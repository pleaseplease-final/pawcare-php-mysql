import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import pg from 'pg';
import express from 'express';
import cookieParser from 'cookie-parser';
if(!process.env.TEST_DATABASE_URL)throw Error('Set TEST_DATABASE_URL to a disposable local database');
const url=new URL(process.env.TEST_DATABASE_URL);
if(!['localhost','127.0.0.1'].includes(url.hostname))throw Error('Local database required');
const admin=new pg.Pool({connectionString:url.href});
const schema=`test_owner_link_${crypto.randomUUID().replaceAll('-','')}`;
await admin.query(`CREATE SCHEMA ${schema}`);
url.searchParams.set('options',`-c search_path=${schema},public`);process.env.DATABASE_URL=url.href;
const {query,pool}=await import('../db.js');
await query(readFileSync(new URL('../database/schema.sql',import.meta.url),'utf8'));
await query(readFileSync(new URL('../database/staff-access.sql',import.meta.url),'utf8'));
const {sha256}=await import('../security.js');
const {clinicRouter}=await import('../routes/clinic.js');
const app=express();app.use(express.json());app.use(cookieParser());app.use('/api',clinicRouter);
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
after(async()=>{await new Promise(r=>server.close(r));await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();});
const call=async(token,path,body,method=body===undefined?'GET':'POST')=>{
 const response=await fetch(`http://127.0.0.1:${server.address().port}/api${path}`,{method,headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},...(body===undefined?{}:{body:JSON.stringify(body)})});
 return {status:response.status,data:await response.json()};
};
async function user(id,role='owner'){
 await query(`INSERT INTO users(id,first_name,last_name,birthday,password_hash,email,role,owner_id,mobile_number,email_verified_at,mobile_verified) VALUES($1,'Synthetic',$1,'1990-01-01','unused',$2,$3,$4,'+639171112233',NOW(),true)`,[id,`${id}@example.invalid`,role,role==='owner'?`o_${id}`:null]);
 if(role==='owner')await query("INSERT INTO owners(id,user_id,name,email,phone,address) VALUES($1,$2,$3,$4,'+639171112233','Online address')",[`o_${id}`,id,`Synthetic ${id}`,`${id}@example.invalid`]);
 await query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,NOW()+INTERVAL '1 day')",[sha256(id),id]);
 return id;
}
const assistant=await user('assistant','assistant'),vet=await user('vet','vet'),administrator=await user('admin','admin');
let serial=0;
async function fixture(){
 const key=`link${++serial}`,token=await user(key),id=`clinic_${key}`;
 await query("INSERT INTO owners(id,name,email,phone,address) VALUES($1,'Clinic Owner','','09171112233','Clinic address')",[id]);
 await query("INSERT INTO pets(id,owner_id,name,birth) VALUES($1,$2,'Clinic Pet','2024-01-01')",[`pet_${key}`,id]);
 // First API read applies the same additive schemas used by the running app.
 const preview=await call(assistant,`/owners/${id}/account-link/review`,{email:`${key}@example.invalid`});
 assert.equal(preview.status,200,JSON.stringify(preview.data));
 return {key,token,id,petId:`pet_${key}`,preview:preview.data,body:{email:`${key}@example.invalid`,revision:preview.data.revision,identityConfirmed:true}};
}
const confirm=(f,token=assistant,body=f.body)=>call(token,`/owners/${f.id}/account-link/confirm`,body);

test('link preserves patient, visit, vaccine and weight IDs and exposes history only to the verified owner',async()=>{
 const f=await fixture();
 await query("INSERT INTO appointments(id,pet_id,vet_id,date,time,reason,status) VALUES('link_visit',$1,'vet','2026-01-01','10:00','Consultation','Completed')",[f.petId]);
 await query("INSERT INTO vaccinations(id,pet_id,card_id,vaccine,date,done) VALUES('link_vaccine',$1,'SYNTHETIC-CARD','Rabies','2026-01-01',true)",[f.petId]);
 await query("INSERT INTO pet_weights(id,pet_id,date,kg) VALUES('link_weight',$1,'2026-01-01',4)",[f.petId]);
 assert.equal((await call(f.token,'/state')).data.data.pets.length,0);
 const linked=await confirm(f);assert.equal(linked.status,200,JSON.stringify(linked.data));
 assert.equal(linked.data.ownerId,f.id);
 assert.equal((await query('SELECT owner_id FROM users WHERE id=$1',[f.key])).rows[0].owner_id,f.id);
 assert.equal((await query('SELECT user_id FROM owners WHERE id=$1',[f.id])).rows[0].user_id,f.key);
 assert.equal((await query('SELECT id FROM owners WHERE id=$1',[`o_${f.key}`])).rows.length,0);
 const state=(await call(f.token,'/state')).data.data;
 assert.equal(state.pets[0].id,f.petId);assert.equal(state.appts[0].id,'link_visit');assert.ok(state.vaccs.some(v=>v.id==='link_vaccine'));
 assert.equal((await query("SELECT pet_id FROM pet_weights WHERE id='link_weight'")).rows[0].pet_id,f.petId);
 assert.equal((await confirm(f)).status,409);
 const other=await user('outsider');assert.equal((await call(other,'/state')).data.data.pets.length,0);
});
test('only assistants can review or confirm; identity confirmation and fresh snapshot required',async()=>{
 const f=await fixture();
 for(const role of [f.token,vet,administrator]){
   assert.equal((await call(role,`/owners/${f.id}/account-link/review`,{email:f.body.email})).status,403);
   assert.equal((await confirm(f,role)).status,403);
 }
 assert.equal((await confirm(f,assistant,{...f.body,identityConfirmed:false})).status,400);
 await query("UPDATE owners SET phone='09172223344' WHERE id=$1",[f.id]);
 assert.equal((await confirm(f)).status,409);
 assert.equal((await query('SELECT owner_id FROM pets WHERE id=$1',[f.petId])).rows[0].owner_id,f.id);
});
test('unverified, disabled and already claimed accounts cannot be linked',async()=>{
 const f=await fixture();
 for(const change of ['mobile_verified=false','mobile_verified=true,email_verified_at=NULL','email_verified_at=NOW(),is_active=false']){
   await query(`UPDATE users SET ${change} WHERE id=$1`,[f.key]);
   assert.equal((await call(assistant,`/owners/${f.id}/account-link/review`,{email:f.body.email})).status,409);
 }
 await query('UPDATE users SET is_active=true WHERE id=$1',[f.key]);
 await query("UPDATE owners SET user_id='already_claimed' WHERE id=$1",[f.id]);
 assert.equal((await confirm(f)).status,409);
});
test('link consolidates distinct online pets and requests without changing patient IDs',async()=>{
 const f=await fixture();
 const registered=await call(f.token,'/pet-requests',{name:'Online Pet',species:'Feline',breed:'Puspin',sex:'Female',birth:'2025-01-01',weight:4,neutered:'Not sure',color:'White',notes:''});
 assert.equal(registered.status,200,JSON.stringify(registered.data));
 assert.equal((await confirm(f)).status,409,'new patient invalidates old review');
 const next=await call(assistant,`/owners/${f.id}/account-link/review`,{email:f.body.email});
 assert.equal((await confirm(f,assistant,{...f.body,revision:next.data.revision})).status,200);
 const request=(await query('SELECT * FROM pet_requests WHERE id=$1',[registered.data.request.id])).rows[0];
 assert.equal(request.owner_id,f.id);assert.equal(request.revision,1);
 assert.equal((await query('SELECT owner_id FROM pets WHERE id=$1',[request.pet_id])).rows[0].owner_id,f.id);
});
test('audit failure rolls back every ownership change',async()=>{
 const f=await fixture();
 await query("CREATE FUNCTION fail_link_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action LIKE 'Linked clinic owner%' THEN RAISE EXCEPTION 'synthetic'; END IF; RETURN NEW; END $$");
 await query('CREATE TRIGGER fail_link_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION fail_link_audit()');
 try{assert.equal((await confirm(f)).status,500);}finally{await query('DROP TRIGGER fail_link_audit ON audit_logs');}
 assert.equal((await query('SELECT owner_id FROM users WHERE id=$1',[f.key])).rows[0].owner_id,`o_${f.key}`);
 assert.equal((await query('SELECT user_id FROM owners WHERE id=$1',[f.id])).rows[0].user_id,null);
 assert.equal((await query('SELECT id FROM owners WHERE id=$1',[`o_${f.key}`])).rows.length,1);
});
test('competing account claims have one winner and cannot expose pets to two accounts',async()=>{
 const f=await fixture(),other=await user('competitor');
 const second=await call(assistant,`/owners/${f.id}/account-link/review`,{email:'competitor@example.invalid'});
 const results=await Promise.all([confirm(f),confirm(f,assistant,{email:'competitor@example.invalid',revision:second.data.revision,identityConfirmed:true})]);
 assert.deepEqual(results.map(x=>x.status).sort(),[200,409]);
 const owners=(await query('SELECT id FROM users WHERE owner_id=$1',[f.id])).rows;assert.equal(owners.length,1);
 const states=await Promise.all([call(f.token,'/state'),call(other,'/state')]);
 assert.equal(states.filter(s=>s.data.data.pets.some(p=>p.id===f.petId)).length,1);
});

const walkIn={ownerName:'Clinic Owner',phone:'09171112233',email:'',address:'Clinic address',petName:'New Clinic Pet',species:'Feline',breed:'Puspin',sex:'Female',birth:'2025-01-01',weight:4,neutered:'Not sure',color:'White',notes:'',addToQueue:false};
test('matching contacts require explicit owner selection and stale or unknown IDs cannot fall back',async()=>{
 const f=await fixture();
 const before=(await query('SELECT COUNT(*)::int n FROM pets')).rows[0].n;
 const ambiguous=await call(assistant,'/walk-in',{...walkIn,email:f.body.email});
 assert.equal(ambiguous.status,409);assert.match(ambiguous.data.error,/Select the correct existing owner/);
 assert.equal((await call(assistant,'/walk-in',{...walkIn,ownerId:'missing-owner'})).status,409);
 assert.equal((await call(assistant,'/walk-in',{...walkIn,ownerId:f.id,phone:'09170000000'})).status,409);
 assert.equal((await query('SELECT COUNT(*)::int n FROM pets')).rows[0].n,before);
 const selected=await call(assistant,'/walk-in',{...walkIn,ownerId:f.id});
 assert.equal(selected.status,200,JSON.stringify(selected.data));assert.equal(selected.data.owner.id,f.id);assert.equal(selected.data.pet.ownerId,f.id);
});
test('concurrent contact matches cannot create two households',async()=>{
 const results=await Promise.all(['First Patient','Second Patient'].map(petName=>call(assistant,'/walk-in',{...walkIn,phone:'09173339999',petName})));
 assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 assert.equal((await query("SELECT COUNT(*)::int n FROM owners WHERE phone='09173339999'")).rows[0].n,1);
});
test('pending patient is verified before walk-in arrival and then reaches measured intake',async()=>{
 const owner=await user('pendingwalkin');
 const request=await call(owner,'/pet-requests',{name:'Pending Patient',species:'Feline',breed:'Puspin',sex:'Female',birth:'2025-01-01',weight:4,neutered:'Not sure',color:'White',notes:''});
 assert.equal(request.status,200);
 const payload={petId:request.data.request.pet_id,vetId:'vet',bookingKind:'walk-in',service:'checkup',reason:'Routine examination'};
 const blocked=await call(assistant,'/appointments',payload);assert.equal(blocked.status,409);assert.match(blocked.data.error,/Review and approve/);
 assert.equal((await query('SELECT COUNT(*)::int n FROM appointments WHERE pet_id=$1',[payload.petId])).rows[0].n,0);
 const approved=await call(assistant,`/pet-requests/${request.data.request.id}/approve`,{revision:request.data.request.revision});assert.equal(approved.status,200,JSON.stringify(approved.data));
 const arrival=await call(assistant,'/appointments',payload);assert.equal(arrival.status,200,JSON.stringify(arrival.data));assert.equal(arrival.data.appointment.status,'Scheduled');
 const intake=await call(assistant,`/appointments/${arrival.data.appointment.id}/status`,{status:'Checked-in',intakeVitals:{weight:4.2,temp:38.5,triageLevel:'Routine',notes:'Measured now'}},'PATCH');
 assert.equal(intake.status,200,JSON.stringify(intake.data));
 assert.equal((await query('SELECT status FROM appointments WHERE id=$1',[arrival.data.appointment.id])).rows[0].status,'Checked-in');
});
test('duplicate patient names and excess account size cannot be silently consolidated',async()=>{
 const f=await fixture();
 await query("INSERT INTO pets(id,owner_id,name,birth) VALUES('duplicate_link_pet',$1,' clinic pet ','2024-01-01')",[`o_${f.key}`]);
 assert.equal((await call(assistant,`/owners/${f.id}/account-link/review`,{email:f.body.email})).status,409);
 await query("UPDATE pets SET name='Different patient' WHERE id='duplicate_link_pet'");
 for(let i=0;i<9;i++)await query("INSERT INTO pets(id,owner_id,name,birth) VALUES($1,$2,$3,'2024-01-01')",[`extra_link_${i}`,`o_${f.key}`,`Extra ${i}`]);
 const excess=await call(assistant,`/owners/${f.id}/account-link/review`,{email:f.body.email});assert.equal(excess.status,409);assert.match(excess.data.error,/ten-pet/);
});
