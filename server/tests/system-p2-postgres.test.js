import {test,after,mock} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import pg from 'pg';
const url=new URL(process.env.TEST_DATABASE_URL||'');
if(!['localhost','127.0.0.1'].includes(url.hostname))throw Error('Use a local disposable database.');
const admin=new pg.Pool({connectionString:url.href}),schema=`test_system_p2_${crypto.randomUUID().replaceAll('-','')}`;
await admin.query(`CREATE SCHEMA ${schema}`);url.searchParams.set('options',`-c search_path=${schema},public`);process.env.DATABASE_URL=url.href;
const {query,pool}=await import('../db.js');await query(readFileSync(new URL('../database/schema.sql',import.meta.url),'utf8'));
await query(readFileSync(new URL('../database/appointment-status.sql',import.meta.url),'utf8'));
let mode='synthetic',messages=[];
const delivery=async(kind,to,text)=>{messages.push({kind,to,text});if(mode==='throw')throw Error('Synthetic delivery failure');return mode==='unknown'?undefined:{ok:mode!=='failed',via:mode};};
mock.module('../services.js',{exports:{sendMail:async(to,subject,text)=>delivery('email',to,text),sendSms:async(to,text)=>delivery('sms',to,text),serverOutbox:[]}});
const {sha256}=await import('../security.js');const {clinicClock}=await import('../scheduling.js');
const {ensureVerificationDelivery,sendMobileVerification}=await import('../verificationDelivery.js');
const {default:app}=await import('../../api/index.js');
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
after(async()=>{await new Promise(r=>server.close(r));await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();});
const call=async(path,body,token)=>{const res=await fetch(`http://127.0.0.1:${server.address().port}/api${path}`,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return{status:res.status,data:await res.json(),headers:res.headers};};
let seq=0;
async function user(role='owner',verified=false){const id=`p2-${++seq}`;await query("INSERT INTO users(id,first_name,last_name,birthday,password_hash,email,role,mobile_number,email_verified_at,mobile_verified,owner_id,vet_id) VALUES($1,'Synthetic','Person','1990-01-01','unused',$2,$3,'+639170000001',NOW(),$4,$5,$6)",[id,`${id}@example.invalid`,role,verified,role==='owner'?id:null,role==='vet'?id:null]);if(role==='owner')await query("INSERT INTO owners(id,user_id,name,email,phone,address) VALUES($1,$1,'Synthetic',$2,'+639170000001','Synthetic address')",[id,`${id}@example.invalid`]);await query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,NOW()+INTERVAL '1 day')",[sha256(id),id]);return{id,email:`${id}@example.invalid`};}
const cool=async(u,type='mobile_otp')=>query(`UPDATE users SET ${type==='mobile_otp'?'mobile_otp_requested_at':'email_verification_requested_at'}=NOW()-INTERVAL '61 seconds' WHERE id=$1`,[u.id]);
const code=()=>messages.at(-1).text.match(/\b\d{6}\b/)[0];

test('unconfirmed, failed, thrown and dev-outbox SMS cannot authorize verification, and resend cooldown survives failure',async()=>{
 const legacy=await user();
 await query("INSERT INTO verification_tokens(user_id,token_hash,type,expired_at) VALUES($1,$2,'mobile_otp',NOW()+INTERVAL '10 minutes')",[legacy.id,sha256('123456')]);
 await ensureVerificationDelivery();
 assert.equal((await query('SELECT delivery_confirmed FROM verification_tokens WHERE user_id=$1',[legacy.id])).rows[0].delivery_confirmed,false);
 assert.equal((await call('/auth/otp/verify',{code:'123456'},legacy.id)).status,400);
 try{for(const scenario of ['dev_outbox','failed','unknown','throw']){mode=scenario;const u=await user();const r=await call('/auth/otp/resend',{},u.id);assert.equal(r.status,503);assert.equal(r.data.retryAfter,60);assert.equal((await call('/auth/otp/info',undefined,u.id)).data.hasActiveOtp,false);assert.equal((await call('/auth/otp/verify',{code:code()},u.id)).status,400);assert.equal((await call('/auth/otp/resend',{},u.id)).status,429);assert.equal((await query('SELECT mobile_verified FROM users WHERE id=$1',[u.id])).rows[0].mobile_verified,false);}}
 finally{mode='synthetic';}
});
test('concurrent resends produce one delivery; three concurrent wrong attempts persist and correct exhausted code cannot pass',async()=>{
 const u=await user();messages=[];const sends=await Promise.all([call('/auth/otp/resend',{},u.id),call('/auth/otp/resend',{},u.id)]);assert.deepEqual(sends.map(r=>r.status).sort(),[200,429]);assert.equal(messages.length,1);const valid=code(),wrong=valid==='123456'?'654321':'123456';
 const failures=await Promise.all(Array.from({length:7},()=>call('/auth/otp/verify',{code:wrong},u.id)));assert.ok(failures.every(r=>r.status===400));assert.equal((await query("SELECT attempts FROM verification_tokens WHERE user_id=$1 AND type='mobile_otp'",[u.id])).rows[0].attempts,3);assert.equal((await call('/auth/otp/verify',{code:valid},u.id)).status,400);assert.equal((await call('/auth/otp/resend',{},u.id)).status,429);
 await cool(u);assert.equal((await call('/auth/otp/resend',{},u.id)).status,200);const fresh=code();const done=await call('/auth/otp/verify',{code:fresh},u.id);assert.equal(done.status,200);assert.equal(done.data.requiresLogin,true);assert.equal((await query('SELECT * FROM sessions WHERE user_id=$1',[u.id])).rows.length,0);
});
test('verification email failure is accurate, throttled, and failed links do not verify accounts',async()=>{
 const u=await user();await query('UPDATE users SET email_verified_at=NULL WHERE id=$1',[u.id]);mode='dev_outbox';
 try{const r=await call('/auth/resend-verification',{email:u.email});assert.equal(r.status,503);const link=messages.at(-1).text.match(/\?verify=([a-f0-9]+)/)[1];assert.equal((await call('/auth/verify-email?token='+link)).status,400);assert.equal((await call('/auth/resend-verification',{email:u.email})).status,429);}
 finally{mode='synthetic';}
 await cool(u,'email_verify');const r=await call('/auth/resend-verification',{email:u.email});assert.equal(r.status,200);assert.equal(r.data.delivery,'accepted');const link=messages.at(-1).text.match(/\?verify=([a-f0-9]+)/)[1];const verified=await call('/auth/verify-email?token='+link);assert.equal(verified.status,200);assert.equal(verified.data.delivery,'accepted');assert.equal((await call('/auth/otp/info',undefined,verified.data.token)).data.hasActiveOtp,true);
});
test('replacement and expired codes are rejected',async()=>{
 const u=await user();await call('/auth/otp/resend',{},u.id);const old=code();await cool(u);await call('/auth/otp/resend',{},u.id);const current=code();if(old!==current)assert.equal((await call('/auth/otp/verify',{code:old},u.id)).status,400);
 await query("UPDATE verification_tokens SET expired_at=NOW()-INTERVAL '1 second' WHERE user_id=$1",[u.id]);assert.equal((await call('/auth/otp/verify',{code:current},u.id)).status,400);
});

let fixture;
async function historyFixture(){
 if(fixture)return fixture;
 const a=await user('owner',true),b=await user('owner',true),v=await user('vet',true),otherVet=await user('vet',true),assistant=await user('assistant',true),administrator=await user('admin',true);
 for(const [owner,pet] of [[a,'patient-a'],[b,'patient-b']])await query("INSERT INTO pets(id,owner_id,name,species,breed,sex,birth,weight) VALUES($1,$2,$1,'Dog','Aspin','Male','2020-01-01',10)",[pet,owner.id]);
 // Initialize existing care/scheduling schemas before inserting extended rows.
 assert.equal((await call('/state',undefined,assistant.id)).status,200);
 for(let n=0;n<113;n++){
  const id=`history-${String(n).padStart(3,'0')}`;
  await query("INSERT INTO appointments(id,pet_id,vet_id,date,time,reason,status,billing_status,amount,paid_at) VALUES($1,'patient-a',$2,'2025-01-01','09:00','Synthetic','Completed','Paid',100,'2025-01-01T02:00:00Z')",[id,v.id]);
  await query("INSERT INTO consultations(id,pet_id,vet_id,appt_id,date,symptoms,objective,diagnosis,treatment) VALUES($1,'patient-a',$2,$1,'2025-01-01','Saved symptom','Saved vitals','Saved diagnosis','Saved treatment')",[id,v.id]);
  await query("INSERT INTO vaccinations(id,pet_id,card_id,vaccine,date,done,vet_id,next_due) VALUES($1,'patient-a','synthetic-card','Anti-rabies','2025-01-01',true,$2,'2026-01-01')",[id,v.id]);
  await query("INSERT INTO pet_weights(id,pet_id,date,kg,recorded_by) VALUES($1,'patient-a','2025-01-01',10,'Synthetic')",[id]);
 }
 await query(readFileSync(new URL('../database/state-read-indexes.sql',import.meta.url),'utf8'));
 await query(readFileSync(new URL('../database/state-read-indexes.sql',import.meta.url),'utf8'));
 const day=clinicClock().date;
 for(const [id,pet,doctor,status,date] of [['today','patient-a',v.id,'Completed',day],['overnight','patient-a',v.id,'In consultation','2025-01-01'],['unpaid','patient-a',v.id,'Completed','2025-01-01'],['foreign','patient-b',otherVet.id,'Scheduled',day]])await query("INSERT INTO appointments(id,pet_id,vet_id,date,time,reason,status,billing_status,amount) VALUES($1,$2,$3,$4,'09:00','Synthetic',$5,'Unbilled',100)",[id,pet,doctor,date,status]);
 await query("INSERT INTO consultations(id,pet_id,vet_id,appt_id,date,symptoms,objective,diagnosis,treatment) VALUES('today','patient-a',$1,'today','2025-01-01','Saved today','Saved vitals','Saved diagnosis','Saved care')",[v.id]);
 fixture={a,b,v,otherVet,assistant,administrator};return fixture;
}
test('summaries bound settled history to five owner payments, retain overnight/unpaid/today records and current certified recalls, with full aggregate totals',async()=>{
 const {a,v,assistant,administrator}=await historyFixture();
 for(const actor of [a,v,assistant,administrator]){
  const r=await call('/state/summary',undefined,actor.id);assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.data.summary,true);const s=r.data.data;
  assert.ok(s.appts.some(a=>a.id==='overnight'));assert.ok(s.appts.some(a=>a.id==='unpaid'));assert.ok(s.consults.some(c=>c.id==='today' && c.date==='2025-01-01'),'current completed visits retain legitimately backdated saved notes');assert.ok(!s.appts.some(a=>a.id==='history-000'));assert.equal(s.appts.filter(row=>row.id.startsWith('history-')).length,actor===a?5:0);if(actor===a)assert.deepEqual(s.appts.filter(row=>row.id.startsWith('history-')).map(row=>row.id).sort(),['history-108','history-109','history-110','history-111','history-112']);assert.equal(s.totals.consultations,114);assert.equal(s.vaccs.length,1);assert.equal(s.pets.find(p=>p.id==='patient-a').weights.length,1);
  if(actor===a||actor===v)assert.ok(!s.pets.some(p=>p.id==='patient-b'));
 }
});
test('history pages traverse tied records once, enforce owner/vet scope and preserve note context across page boundaries',async()=>{
 const {a,b,v,otherVet}=await historyFixture();
 for(const actor of [a,v]){
  let cursor=null,seen=new Set(),pages=0;
  do{const r=await call('/state/history'+(cursor?'?'+new URLSearchParams({cursor}):''),undefined,actor.id);assert.equal(r.status,200,JSON.stringify(r.data));const h=r.data.data;
   assert.ok(h.consults.length<=50);for(const record of h.consults){assert.equal(record.petId,'patient-a');assert.ok(!seen.has(record.id));seen.add(record.id);assert.ok(h.appts.some(a=>a.id===record.apptId));}
   assert.equal(h.owners.length,0);assert.equal(h.pets.length,0);assert.ok(!h.appts.some(a=>a.id==='foreign'));cursor=h.page.cursor;pages++;assert.ok(pages<8);
  }while(cursor);assert.equal(seen.size,114);assert.equal(pages,3);
 }
 for(const actor of [b,otherVet])assert.equal((await call('/state/history?petId=patient-a',undefined,actor.id)).data.data.consults.length,0);
 assert.equal((await call('/state/history?cursor=broken',undefined,a.id)).status,400);
 assert.equal((await call('/state/history')).status,401);
});

test('a code delivered to the previous mobile number cannot certify a replacement contact',async()=>{
 const u=await user();await call('/auth/otp/resend',{},u.id);const sentCode=code();
 await query("UPDATE users SET mobile_number='+639170000002' WHERE id=$1",[u.id]);
 assert.equal((await call('/auth/otp/info',undefined,u.id)).data.hasActiveOtp,false);
 assert.equal((await call('/auth/otp/verify',{code:sentCode},u.id)).status,400);
});
test('registration preserves the saved account and returns accurate delivery failure with a usable resend path',async()=>{
 mode='throw';const email='synthetic.system.p2@gmail.com';
 try{
  const receipt=await call('/auth/register',{firstName:'Synthetic',lastName:'Person',email,password:'SyntheticPassword123!',confirm_password:'SyntheticPassword123!',birthday:'01/01/1990',country:'PH',state:'Metro Manila',city:'Quezon City',zip_code:'1100',house_street:'12 Synthetic Street',mobile:'+639170000003'});
  assert.equal(receipt.status,200,JSON.stringify(receipt.data));assert.equal(receipt.data.delivery,'failed');assert.match(receipt.data.message,/Account created/);assert.equal(receipt.data.retryAfter,60);assert.equal(receipt.data.token,undefined);
  const stored=(await query('SELECT * FROM users WHERE email=$1',[email])).rows[0];assert.ok(stored);assert.equal(stored.email_verified_at,null);
  assert.equal((await call('/auth/resend-verification',{email})).status,429);
 }finally{mode='synthetic';}
});

test('delivery uses the current locked contact when a caller holds an older phone snapshot',async()=>{
 const u=await user();const stale={id:u.id,mobile_number:'+639170000001'};
 await query("UPDATE users SET mobile_number='+639170000009' WHERE id=$1",[u.id]);
 assert.equal(await sendMobileVerification(stale),true);assert.equal(messages.at(-1).to,'+639170000009');
});

test('summary recalls match full authorized history across vaccine family aliases and uncertified doses',async()=>{
 const {a,v}=await historyFixture();
 const doses=[['family-old','5-in-1','2025-01-01',v.id,'2025-02-01'],['family-new','DHPP','2025-02-01',v.id,'2025-03-01'],['unqualified','Anti-rabies','2025-03-01',null,'2025-04-01']];
 for(const [id,name,date,doctor,due] of doses)await query("INSERT INTO vaccinations(id,pet_id,card_id,vaccine,date,done,vet_id,next_due) VALUES($1,'patient-a','synthetic-card',$2,$3,true,$4,$5)",[id,name,date,doctor,due]);
 const full=(await call('/state',undefined,a.id)).data.data,summary=(await call('/state/summary',undefined,a.id)).data.data;
 const {currentVaccinationDue}=await import('../../src/vaccinationDue.js');
 assert.deepEqual(currentVaccinationDue(summary.vaccs).map(v=>v.id).sort(),currentVaccinationDue(full.vaccs).map(v=>v.id).sort());
 assert.ok(summary.vaccs.length<full.vaccs.length/10);
});
