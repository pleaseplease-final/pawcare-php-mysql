// Real database validation and concurrency checks, restricted to a disposable local DB.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import pg from 'pg';
import express from 'express';
import cookieParser from 'cookie-parser';
if (!process.env.TEST_DATABASE_URL) throw Error('Set TEST_DATABASE_URL to a disposable local database');
const url = new URL(process.env.TEST_DATABASE_URL);
if (!['localhost','127.0.0.1'].includes(url.hostname)) throw Error('Local database required');
const admin = new pg.Pool({connectionString:url.href});
const schema = `test_registration_${crypto.randomUUID().replaceAll('-','')}`;
await admin.query(`CREATE SCHEMA ${schema}`);
url.searchParams.set('options',`-c search_path=${schema},public`);
process.env.DATABASE_URL = url.href;
const {query,pool} = await import('../db.js');
await query(readFileSync(new URL('../database/schema.sql',import.meta.url),'utf8'));
await query(readFileSync(new URL('../database/appointment-status.sql',import.meta.url),'utf8'));
const {sha256} = await import('../security.js');
const {clinicRouter} = await import('../routes/clinic.js');
const app = express(); app.use(express.json({limit:'10mb'})); app.use(cookieParser()); app.use('/api',clinicRouter);
const server = app.listen(0,'127.0.0.1'); await new Promise(r=>server.once('listening',r));
after(async()=>{await new Promise(r=>server.close(r));await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();});
const call = async (token,method,path,body) => {
 const res = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
 return {status:res.status,data:await res.json()};
};
async function user(id,role='owner') {
 await query(`INSERT INTO users(id,first_name,last_name,birthday,password_hash,email,role,owner_id,mobile_number,email_verified_at,mobile_verified)
 VALUES($1,'Synthetic',$1,'1990-01-01','unused',$2,$3,$4,'+639000000000',NOW(),true)`,[id,`${id}@example.invalid`,role,role==='owner'?`o_${id}`:null]);
 if (role==='owner') await query('INSERT INTO owners(id,name,email,phone,address,user_id) VALUES($1,$2,$3,$4,$5,$6)',[`o_${id}`,id,`${id}@example.invalid`,'+639000000000','Synthetic',id]);
 await query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,NOW()+INTERVAL '1 day')",[sha256(id),id]);
 return id;
}
const assistant = await user('assistant','assistant');
const base = {name:'Luna',species:'Feline',breed:'Puspin',sex:'Female',birth:'2025-01-01',weight:4.25,neutered:'Not sure',color:'White',notes:'Owner reported history'};
const photo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
const create = async (owner,data={})=>{
 const result = await call(owner,'POST','/pet-requests',{...base,...data});
 assert.equal(result.status,200,JSON.stringify(result.data));return result.data.request;
};
const review = (id,action,revision,extra={})=>call(assistant,'POST',`/pet-requests/${id}/${action}`,{revision,...extra});

test('invalid registration details and unsafe images never insert a request',async()=>{
 const owner=await user('invalid');
 for(const change of [{name:''},{name:'123'},{species:'invented'},{sex:undefined},{birth:'2025-02-30'},{birth:'2099-01-01'},{weight:undefined},{weight:0},{weight:'5'},{weight:121},{weight:1.234},{neutered:'unknown'},{photo:'https://example.invalid/pet.png'},{photo:'data:image/png;base64,PHN2Zz48L3N2Zz4='},{photo:'data:image/svg+xml;base64,PHN2Zz4='},{notes:'a'.repeat(201)},{breed:'123'},{color:'123'},{notes:'123'},{species:'Other',speciesOther:''},{species:'Rodent',dentalOcclusion:'invented'}]) {
  assert.equal((await call(owner,'POST','/pet-requests',{...base,...change})).status,400,JSON.stringify(change));
 }
 assert.equal((await query('SELECT COUNT(*)::int n FROM pet_requests WHERE owner_id=$1',['o_invalid'])).rows[0].n,0);
});
test('owner identity, photos and dental details survive state reload; migrations stay schema-local',async()=>{
 const owner=await user('details');
 const saved=await create(owner,{ownerId:'o_someone_else',species:'Rodent',dentalOcclusion:'Not Evaluated Yet',photo,notes:'Owner report\nFor clinic review'});
 assert.equal(saved.owner_id,'o_details');assert.equal(saved.photo,photo);assert.equal(saved.revision,0);
 const state=(await call(owner,'GET','/state')).data.data;
 const item=state.petRequests.find(r=>r.id===saved.id);
 assert.equal(item.photo,photo);assert.equal(item.dentalOcclusion,'Not Evaluated Yet');assert.equal(item.revision,0);
 assert.equal((await query("SELECT n.nspname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.oid='pet_requests'::regclass")).rows[0].nspname,schema);
});
test('editing retains one request, rejects stale edits and invalidates stale staff review',async()=>{
 const owner=await user('editing');const saved=await create(owner,{photo});
 const updated=await call(owner,'PUT',`/pet-requests/${saved.id}`,{...base,name:'Luna Updated',photo,revision:0});
 assert.equal(updated.status,200);assert.equal(updated.data.request.id,saved.id);assert.equal(updated.data.request.revision,1);
 assert.equal((await call(owner,'PUT',`/pet-requests/${saved.id}`,{...base,revision:0})).status,409);
 assert.equal((await review(saved.id,'approve',0)).status,409);
 assert.equal((await review(saved.id,'decline',0,{reason:'Stale review'})).status,409);
 assert.equal((await query('SELECT COUNT(*)::int n FROM pet_requests WHERE owner_id=$1',['o_editing'])).rows[0].n,1);
});
test('decline gives correction guidance; resend resets the same request to pending',async()=>{
 const owner=await user('resend');const saved=await create(owner,{photo});
 assert.equal((await review(saved.id,'decline',0,{reason:''})).status,400);
 assert.equal((await review(saved.id,'decline',0,{reason:'Please confirm birth date'})).status,200);
 let state=(await call(owner,'GET','/state')).data.data.petRequests[0];assert.equal(state.declineReason,'Please confirm birth date');assert.equal(state.revision,1);
 const resend=await call(owner,'PUT',`/pet-requests/${saved.id}`,{...base,birth:'2024-01-01',photo,revision:1});
 assert.equal(resend.status,200);state=resend.data.request;assert.equal(state.id,saved.id);assert.equal(state.status,'Pending');assert.equal(state.decline_reason,null);assert.equal(state.revision,2);assert.equal(state.photo,photo);
});
test('racing staff decisions cannot decline an approved request or create duplicate patients',async()=>{
 const owner=await user('reviews');const saved=await create(owner,{photo});
 const outcomes=await Promise.all([review(saved.id,'approve',0),review(saved.id,'decline',0,{reason:'Check details'})]);
 assert.deepEqual(outcomes.map(r=>r.status).sort(),[200,409]);
 let row=(await query('SELECT * FROM pet_requests WHERE id=$1',[saved.id])).rows[0];
 if(row.status==='Declined') {
  await call(owner,'PUT',`/pet-requests/${saved.id}`,{...base,photo,revision:row.revision});
  row=(await query('SELECT * FROM pet_requests WHERE id=$1',[saved.id])).rows[0];
  assert.equal((await review(saved.id,'approve',row.revision)).status,200);
 }
 const pets=(await query('SELECT * FROM pets WHERE owner_id=$1',['o_reviews'])).rows;assert.equal(pets.length,1);assert.equal(pets[0].photo,photo);
 assert.equal((await call(owner,'DELETE',`/pet-requests/${saved.id}`)).status,409);
 assert.equal((await review(saved.id,'approve',0)).status,409);
 assert.equal((await query('SELECT COUNT(*)::int n FROM appointments WHERE pet_id=$1',[pets[0].id])).rows[0].n,0);
 assert.equal((await query('SELECT COUNT(*)::int n FROM vaccinations WHERE pet_id=$1 AND done=true',[pets[0].id])).rows[0].n,0);
});
test('photo updates invalidate review; approved request links update the real patient',async()=>{
 const owner=await user('pictures');const saved=await create(owner,{species:'Rodent',dentalOcclusion:'Not Evaluated Yet'});
 assert.equal((await call(owner,'POST',`/owner/pets/${saved.id}/photo`,{photo})).status,200);
 assert.equal((await review(saved.id,'approve',0)).status,409);
 const approved=await review(saved.id,'approve',1);assert.equal(approved.status,200,JSON.stringify(approved.data));assert.equal(approved.data.pet.photo,photo);assert.equal(approved.data.pet.dental_occlusion,'Not Evaluated Yet');
 assert.equal((await call(owner,'POST',`/owner/pets/${saved.id}/photo`,{photo:''})).status,200);
 assert.equal((await query('SELECT photo FROM pets WHERE id=$1',[approved.data.pet.id])).rows[0].photo,'');
 assert.equal((await call(owner,'POST',`/pets/${approved.data.pet.id}/photo`,{photo:'javascript:alert(1)'})).status,400);
});
test('owner locks enforce name uniqueness and pending limits under simultaneous submissions',async()=>{
 const owner=await user('capacity');
 const dupe=await Promise.all([call(owner,'POST','/pet-requests',base),call(owner,'POST','/pet-requests',{...base,name:' luna '})]);assert.deepEqual(dupe.map(r=>r.status).sort(),[200,409]);
 const many=await Promise.all(['Milo','Pip','Coco'].map(name=>call(owner,'POST','/pet-requests',{...base,name})));assert.deepEqual(many.map(r=>r.status).sort(),[200,200,409]);
 assert.equal((await query("SELECT COUNT(*)::int n FROM pet_requests WHERE owner_id='o_capacity' AND status='Pending'")).rows[0].n,3);
});
test('request edits and withdrawals are owner-scoped; staff review is reception-only',async()=>{
 const owner=await user('boundaries');const other=await user('outsider');const saved=await create(owner);
 for(const [token,status] of [[null,401],[other,404],[assistant,403]]) assert.equal((await call(token,'PUT',`/pet-requests/${saved.id}`,{...base,revision:0})).status,status);
 assert.equal((await call(other,'DELETE',`/pet-requests/${saved.id}`)).status,404);
 for(const role of ['vet','admin']) {const token=await user(role,role);assert.equal((await call(token,'POST',`/pet-requests/${saved.id}/approve`,{revision:0})).status,403);}
 assert.equal((await call(owner,'POST',`/pet-requests/${saved.id}/approve`,{revision:0})).status,403);
});
test('audit failures roll back submission, edits, approval, decline and withdrawal',async()=>{
 const owner=await user('rollback');const saved=await create(owner,{photo});
 await query(`CREATE FUNCTION reject_registration_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action LIKE '%pet request%' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$`);
 await query('CREATE TRIGGER reject_registration_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_registration_audit()');
 try {
  assert.equal((await call(owner,'POST','/pet-requests',{...base,name:'Other Pet'})).status,500);
  assert.equal((await call(owner,'PUT',`/pet-requests/${saved.id}`,{...base,name:'Changed',revision:0})).status,500);
  assert.equal((await review(saved.id,'approve',0)).status,500);
  assert.equal((await review(saved.id,'decline',0,{reason:'Check birth date'})).status,500);
  assert.equal((await call(owner,'DELETE',`/pet-requests/${saved.id}`)).status,500);
  const rows=(await query("SELECT * FROM pet_requests WHERE owner_id='o_rollback'")).rows;assert.equal(rows.length,1);assert.equal(rows[0].revision,0);assert.equal(rows[0].status,'Pending');assert.equal(rows[0].photo,photo);
  assert.equal((await query("SELECT COUNT(*)::int n FROM pets WHERE owner_id='o_rollback'")).rows[0].n,1);
 } finally {await query('DROP TRIGGER reject_registration_audit ON audit_logs');}
 assert.equal((await review(saved.id,'approve',0)).status,200);
});
test('withdrawal racing approval never removes an approved request or orphans its patient',async()=>{
 const owner=await user('withdraw');const saved=await create(owner);
 const results=await Promise.all([call(owner,'DELETE',`/pet-requests/${saved.id}`),review(saved.id,'approve',0)]);
 assert.equal(results.filter(r=>r.status===200).length,1);
 const request=(await query('SELECT * FROM pet_requests WHERE id=$1',[saved.id])).rows[0];
 const pets=(await query("SELECT * FROM pets WHERE owner_id='o_withdraw'")).rows;
 if(request){assert.equal(request.status,'Approved');assert.equal(pets.length,1);assert.equal(pets[0].id,request.pet_id);}else assert.equal(pets.length,0);
});
test('the ten-pet account limit includes declined requests and permits correction in place',async()=>{
 const owner=await user('total_limit');const saved=await create(owner);
 await review(saved.id,'decline',0,{reason:'Confirm details'});
 for(let n=0;n<9;n++) await query("INSERT INTO pets(id,owner_id,name,birth) VALUES($1,'o_total_limit',$2,'2024-01-01')",['limit_pet_'+n,'Existing '+n]);
 assert.equal((await call(owner,'POST','/pet-requests',{...base,name:'Eleventh'})).status,409);
 assert.equal((await call(owner,'PUT',`/pet-requests/${saved.id}`,{...base,revision:1})).status,200);
});

const walkIn = {ownerName:'Walkin Owner',phone:'09171112233',email:'',address:'',petName:'Milo Walkin',species:'Rodent',breed:'',sex:'Male',birth:'2024-01-01',weight:0.25,neutered:'Not sure',color:'',dentalOcclusion:'Not Evaluated Yet',notes:'',addToQueue:false};
test('walk-in preserves entered measurements, dental status and missing optional contacts',async()=>{
 const saved=await call(assistant,'POST','/walk-in',walkIn);
 assert.equal(saved.status,200,JSON.stringify(saved.data));
 const {owner,pet,appointment}=saved.data;
 assert.equal(owner.email,'');assert.equal(owner.address,'');assert.equal(owner.phone,walkIn.phone);
 assert.equal(pet.weight,0.25);assert.equal(pet.dentalOcclusion,'Not Evaluated Yet');assert.equal(appointment,null);
 const row=(await query('SELECT * FROM pets WHERE id=$1',[pet.id])).rows[0];
 assert.equal(row.dental_occlusion,'Not Evaluated Yet');assert.equal(Number(row.weight),0.25);
 const weights=(await query('SELECT * FROM pet_weights WHERE pet_id=$1',[pet.id])).rows;
 assert.equal(weights.length,1);assert.equal(Number(weights[0].kg),0.25);assert.equal(pet.weights[0].kg,0.25);
 assert.equal((await query("SELECT COUNT(*)::int n FROM audit_logs WHERE action LIKE '%Registered walk-in%' AND action LIKE $1",[`%${pet.name}%`])).rows[0].n,1);
});
test('walk-in rejects missing or invalid patient facts before creating records',async()=>{
 const before=(await query('SELECT COUNT(*)::int n FROM pets')).rows[0].n;
 for(const change of [{weight:undefined},{weight:'5'},{weight:0},{birth:'2025-02-30'},{species:''},{sex:''},{phone:''}]) {
  assert.equal((await call(assistant,'POST','/walk-in',{...walkIn,...change})).status,400);
 }
 assert.equal((await query('SELECT COUNT(*)::int n FROM pets')).rows[0].n,before);
});
test('walk-in audit failure rolls back owner, patient, weights, protocols and arrival',async()=>{
 await user('walkin_vet','vet');
 const vet=(await query("SELECT vet_id FROM users WHERE id='walkin_vet'")).rows[0].vet_id;
 // The fixture user helper leaves vet_id empty; assign a real directory identity.
 await query("UPDATE users SET vet_id='walkin_vet' WHERE id='walkin_vet'");
 const body={...walkIn,phone:'09174445566',petName:'Rollback Walkin',species:'Canine',weight:5,addToQueue:true,vetId:'walkin_vet',reason:'Walk-in examination'};
 const counts=async()=> (await query('SELECT (SELECT COUNT(*) FROM owners)::int owners,(SELECT COUNT(*) FROM pets)::int pets,(SELECT COUNT(*) FROM pet_weights)::int weights,(SELECT COUNT(*) FROM vaccinations)::int vacc,(SELECT COUNT(*) FROM appointments)::int appts')).rows[0];
 const before=await counts();
 await query(`CREATE FUNCTION reject_walkin_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action LIKE 'Registered walk-in%' THEN RAISE EXCEPTION 'synthetic walk-in audit failure'; END IF; RETURN NEW; END $$`);
 await query('CREATE TRIGGER reject_walkin_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_walkin_audit()');
 try {assert.equal((await call(assistant,'POST','/walk-in',body)).status,500);assert.deepEqual(await counts(),before);}
 finally {await query('DROP TRIGGER reject_walkin_audit ON audit_logs');}
 const retry=await call(assistant,'POST','/walk-in',body);
 assert.equal(retry.status,200,JSON.stringify(retry.data));
 assert.equal(retry.data.appointment.status,'Scheduled');assert.equal(retry.data.appointment.intakeVitals,null);
 assert.equal(retry.data.appointment.vetId,'walkin_vet');assert.equal(retry.data.pet.weight,5);
});

test('weight history validates measured facts, preserves newest weight and audits atomically',async()=>{
 const token=await user('weight-audit');const registered=await create(token);const id=registered.id;
 const approved=await call(assistant,'POST',`/pet-requests/${id}/approve`,{revision:0});assert.equal(approved.status,200);
 const petId=approved.data.pet.id;const {clinicClock,shiftDate}=await import('../scheduling.js');const today=clinicClock().date;
 await query("INSERT INTO appointments(id,pet_id,vet_id,date,time,reason,status) VALUES('weight-visit',$1,'walkin_vet',$2,'09:00','Weight visit','Completed')",[petId,today]);
 const actualTime=new Date(Date.now()-60000).toISOString();
 const measure=body=>call(assistant,'POST',`/pets/${petId}/weights`,{visitId:'weight-visit',measuredAt:actualTime,...body});
 const before=(await query('SELECT COUNT(*)::int n FROM pet_weights WHERE pet_id=$1',[petId])).rows[0].n;
 for(const kg of [undefined,null,-1,0,0.01,121,'5',true,5.123])assert.equal((await measure({kg,date:today})).status,400);
 for(const date of ['2026-02-30',shiftDate(today,1),'2020-01-01'])assert.equal((await measure({kg:5,measuredAt:date+'T12:00:00+08:00'})).status,400);
 assert.equal((await query('SELECT COUNT(*)::int n FROM pet_weights WHERE pet_id=$1',[petId])).rows[0].n,before);
 const saved=await measure({kg:5.25,recordedBy:'Forged vet'});assert.equal(saved.status,200);assert.equal(saved.data.measurement.by,'Synthetic assistant');assert.equal(saved.data.measurement.date,today);
 assert.equal((await measure({kg:4.5,measuredAt:shiftDate(today,-1)+'T12:00:00+08:00'})).status,200);
 assert.equal(Number((await query('SELECT weight FROM pets WHERE id=$1',[petId])).rows[0].weight),5.25);
 await query(`CREATE FUNCTION reject_weight_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action LIKE 'Recorded measured weight%' THEN RAISE EXCEPTION 'synthetic weight audit failure'; END IF; RETURN NEW; END $$`);
 await query('CREATE TRIGGER reject_weight_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_weight_audit()');
 const count=(await query('SELECT COUNT(*)::int n FROM pet_weights WHERE pet_id=$1',[petId])).rows[0].n;
 assert.equal((await measure({kg:6,date:today})).status,500);
 assert.equal((await query('SELECT COUNT(*)::int n FROM pet_weights WHERE pet_id=$1',[petId])).rows[0].n,count);
 assert.equal(Number((await query('SELECT weight FROM pets WHERE id=$1',[petId])).rows[0].weight),5.25);
 await query('DROP TRIGGER reject_weight_audit ON audit_logs');
});

test('new customer vaccination arrivals validate species before inserts and persist the requested purpose',async()=>{
 await user('request_vet','vet');await query("UPDATE users SET vet_id='request_vet' WHERE id='request_vet'");
 const body={...walkIn,phone:'09175556677',petName:'Requested Cat',species:'Feline',weight:4,dentalOcclusion:'',addToQueue:true,vetId:'request_vet',serviceCategory:'vaccination',vaccineId:'feline-core',reason:'Wrong price and purpose'};
 const before=(await query('SELECT COUNT(*)::int n FROM pets')).rows[0].n;
 for(const vaccineId of ['canine-core','invented',''])assert.equal((await call(assistant,'POST','/walk-in',{...body,vaccineId})).status,400);
 assert.equal((await query('SELECT COUNT(*)::int n FROM pets')).rows[0].n,before);
 const saved=await call(assistant,'POST','/walk-in',body);assert.equal(saved.status,200,JSON.stringify(saved.data));
 assert.equal(saved.data.appointment.reason,'Vaccination: Feline 4-in-1');assert.equal(saved.data.appointment.service,'vaccination');assert.equal(saved.data.appointment.bookingKind,'walk-in');
 const row=(await query('SELECT reason,service FROM appointments WHERE id=$1',[saved.data.appointment.id])).rows[0];assert.equal(row.reason,saved.data.appointment.reason);assert.equal(row.service,'vaccination');
 assert.equal((await query('SELECT COUNT(*)::int n FROM vaccinations WHERE pet_id=$1 AND done=true',[saved.data.pet.id])).rows[0].n,0);
});

test('new owner saves once, reloads pending patient and books before review; approval preserves the same patient and appointment',async()=>{
 const owner=await user('onboarding'),other=await user('onboarding-other');
 await user('onboarding-vet','vet');await query("UPDATE users SET vet_id='onboarding-vet' WHERE id='onboarding-vet'");
 const requestId=crypto.randomUUID(),body={...base,requestId};
 const submitted=await call(owner,'POST','/pet-requests',body);assert.equal(submitted.status,200,JSON.stringify(submitted));
 const {pet,request}=submitted.data;
 assert.equal(pet.registration_status,'Pending');assert.equal(request.pet_id,pet.id);assert.equal(pet.vaccination_card_id,null);
 const retry=await call(owner,'POST','/pet-requests',body);assert.equal(retry.status,200);assert.equal(retry.data.pet.id,pet.id);
 assert.equal((await call(owner,'POST','/pet-requests',{...body,name:'Changed payload'})).status,409);
 assert.equal((await call(other,'POST','/pet-requests',body)).status,409);
 const state=(await call(owner,'GET','/state')).data.data;
 assert.ok(state.owners[0].firstPetRegisteredAt);assert.equal(state.pets.find(p=>p.id===pet.id).registrationStatus,'Pending');assert.deepEqual(state.pets.find(p=>p.id===pet.id).weights,[]);
 assert.ok(!(await call(other,'GET','/state')).data.data.pets.some(p=>p.id===pet.id));
 const {clinicClock,shiftDate}=await import('../scheduling.js');const {holidayName}=await import('../../src/booking.js');
 let date=shiftDate(clinicClock().date,1);while(holidayName(date))date=shiftDate(date,1);
 const booking={petId:pet.id,vetId:'onboarding-vet',date,time:'09:00',reason:'Routine examination',service:'checkup'};
 assert.equal((await call(other,'POST','/appointments',booking)).status,404);
 const booked=await call(owner,'POST','/appointments',booking);assert.equal(booked.status,200,JSON.stringify(booked));
 assert.equal(booked.data.appointment.status,'Pending Approval');assert.equal(booked.data.appointment.petId,pet.id);
 assert.equal((await query('SELECT registration_status FROM pets WHERE id=$1',[pet.id])).rows[0].registration_status,'Pending');
 assert.equal((await call(assistant,'PATCH',`/appointments/${booked.data.appointment.id}/status`,{status:'Scheduled'})).status,409,'staff must review registration before confirming visit');
 assert.equal((await call(owner,'DELETE',`/pet-requests/${request.id}`)).status,409,'cannot erase patient or appointment history');
 assert.equal((await review(request.id,'approve',0)).status,409,'a linked visit must use combined approval');
 const approved=await call(assistant,'PATCH',`/appointments/${booked.data.appointment.id}/status`,{status:'Scheduled',expectedRegistration:{id:request.id,revision:0},expectedVisit:booked.data.appointment});
 assert.equal(approved.status,200,JSON.stringify(approved));assert.equal(approved.data.registration.pet.id,pet.id);assert.equal(approved.data.registration.pet.registration_status,'Verified');
 assert.equal((await query('SELECT pet_id FROM appointments WHERE id=$1',[booked.data.appointment.id])).rows[0].pet_id,pet.id);
 assert.equal((await query('SELECT count(*)::int n FROM pets WHERE owner_id=$1',[pet.owner_id])).rows[0].n,1);
 assert.equal((await call(assistant,'PATCH',`/appointments/${booked.data.appointment.id}/status`,{status:'Scheduled'})).status,200);
});

test('withdrawal removes an unused pending profile without resetting completed first-pet setup',async()=>{
 const owner=await user('onboarding-withdraw');const request=await create(owner);
 assert.equal((await call(owner,'DELETE',`/pet-requests/${request.id}`)).status,200);
 assert.equal((await query('SELECT id FROM pets WHERE id=$1',[request.pet_id])).rows.length,0);
 assert.ok((await query('SELECT first_pet_registered_at FROM owners WHERE id=$1',['o_onboarding-withdraw'])).rows[0].first_pet_registered_at);
});

test('onboarding migration backfills pending legacy requests, keeps approved identities and is repeatable',async()=>{
 const owner=await user('legacy-pending');
 await query("INSERT INTO pet_requests(id,owner_id,name,species,sex,birth,weight) VALUES('legacy-request','o_legacy-pending','Legacy Pet','Canine','Male','2025-01-01',5)");
 const before=(await query('SELECT id,registration_status FROM pets ORDER BY id')).rows;
 for(let n=0;n<2;n++)await query(readFileSync(new URL('../database/owner-pet-onboarding.sql',import.meta.url),'utf8'));
 const request=(await query("SELECT pet_id FROM pet_requests WHERE id='legacy-request'")).rows[0];
 const pet=(await query('SELECT * FROM pets WHERE id=$1',[request.pet_id])).rows[0];assert.equal(pet.registration_status,'Pending');assert.equal(pet.name,'Legacy Pet');assert.equal(pet.vaccination_card_id,null);
 for(const original of before) assert.deepEqual((await query('SELECT id,registration_status FROM pets WHERE id=$1',[original.id])).rows[0],original);
 assert.equal((await query("SELECT count(*)::int n FROM pets WHERE owner_id='o_legacy-pending'")).rows[0].n,1);
});

test('each new pet retains its own unverified references through review without creating certified doses',async()=>{
 const owner=await user('references'),other=await user('references-other');
 const requestId=crypto.randomUUID(),priorVaccines=['Anti-Rabies Vaccine','FVRCP 4-in-1 Dose 1'],externalClinicNotes='Previous clinic: Synthetic Animal Care; date unknown. Bring original booklet.';
 const data={...base,requestId,priorVaccines,externalClinicNotes};
 const pair=await Promise.all([call(owner,'POST','/pet-requests',data),call(owner,'POST','/pet-requests',data)]);
 assert.deepEqual(pair.map(r=>r.status),[200,200]);assert.equal(pair[0].data.pet.id,pair[1].data.pet.id);
 const first=pair[0].data.request;
 assert.deepEqual(first.prior_vaccines,priorVaccines);assert.deepEqual(pair[0].data.pet.prior_vaccines,priorVaccines);
 const approved=await review(first.id,'approve',0);assert.equal(approved.status,200,JSON.stringify(approved));
 assert.deepEqual(approved.data.pet.prior_vaccines,priorVaccines);
 assert.equal((await query('SELECT count(*)::int n FROM vaccinations WHERE pet_id=$1 AND done=true',[first.pet_id])).rows[0].n,0);
 const second=await create(owner,{name:'Milo',priorVaccines:['Prior Deworming'],externalClinicNotes:'Different clinic report.'});
 assert.notEqual(second.pet_id,first.pet_id);assert.equal(second.status,'Pending');
 let state=(await call(owner,'GET','/state')).data.data;
 assert.equal(state.pets.find(p=>p.id===first.pet_id).registrationStatus,'Verified');
 assert.equal(state.pets.find(p=>p.id===second.pet_id).registrationStatus,'Pending');
 assert.deepEqual(state.petRequests.find(r=>r.id===second.id).priorVaccines,['Prior Deworming']);
 const path=`/pets/${first.pet_id}/reference-history`,edit={revision:0,priorVaccines:['Anti-Rabies Vaccine'],externalClinicNotes:'Original booklet now available from previous clinic.'};
 assert.equal((await call(other,'PUT',path,edit)).status,404);
 assert.equal((await call(assistant,'PUT',path,edit)).status,403);
 const saved=await call(owner,'PUT',path,edit);assert.equal(saved.status,200,JSON.stringify(saved));assert.equal(saved.data.pet.reference_revision,1);
 assert.equal((await call(owner,'PUT',path,edit)).status,200,'retry of identical data creates no new history');
 assert.equal((await query('SELECT count(*)::int n FROM pet_reference_updates WHERE pet_id=$1',[first.pet_id])).rows[0].n,1);
 assert.equal((await call(owner,'PUT',path,{...edit,externalClinicNotes:'Different stale details'})).status,409);
 for(const patch of [{priorVaccines:['123']},{priorVaccines:['Rabies',' rabies ']},{priorVaccines:{}},{externalClinicNotes:'666666'}])assert.equal((await call(owner,'PUT',path,{...edit,revision:1,...patch})).status,400);
 assert.equal((await call(owner,'PUT',`/pets/${second.pet_id}/reference-history`,edit)).status,409,'pending reference corrections use registration revisions');
 assert.ok(!(await call(other,'GET','/state')).data.data.pets.some(p=>p.id===first.pet_id));
 await query("CREATE FUNCTION fail_reference_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action LIKE 'Updated owner-reported%' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_reference_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION fail_reference_audit()");
 try{assert.equal((await call(owner,'PUT',path,{...edit,revision:1,externalClinicNotes:'Correction requiring audit.'})).status,500);}finally{await query('DROP TRIGGER fail_reference_audit ON audit_logs');}
 const row=(await query('SELECT reference_revision,external_clinic_notes FROM pets WHERE id=$1',[first.pet_id])).rows[0];assert.equal(row.reference_revision,1);assert.equal(row.external_clinic_notes,edit.externalClinicNotes);
 assert.equal((await query('SELECT count(*)::int n FROM pet_reference_updates WHERE pet_id=$1',[first.pet_id])).rows[0].n,1);
});

test('additive reference migration preserves legacy submission retry identity and existing records',async()=>{
 const owner=await user('legacy-reference-retry'),requestId=crypto.randomUUID();
 const original=await call(owner,'POST','/pet-requests',{...base,requestId});assert.equal(original.status,200);
 await query("UPDATE pet_requests SET submission_payload=submission_payload-'priorVaccines'-'externalClinicNotes' WHERE id=$1",[original.data.request.id]);
 const petBefore=(await query('SELECT * FROM pets WHERE id=$1',[original.data.pet.id])).rows[0];
 const source=readFileSync(new URL('../database/patient-reference-history.sql',import.meta.url),'utf8');
 await query(source);await query(source);
 const retry=await call(owner,'POST','/pet-requests',{...base,requestId});assert.equal(retry.status,200,JSON.stringify(retry));assert.equal(retry.data.request.id,original.data.request.id);assert.equal(retry.data.pet.id,original.data.pet.id);
 assert.deepEqual((await query('SELECT * FROM pets WHERE id=$1',[original.data.pet.id])).rows[0],petBefore);
 assert.equal((await query('SELECT count(*)::int n FROM pet_requests WHERE owner_id=$1',['o_legacy-reference-retry'])).rows[0].n,1);
});

test('invalid walk-in visit details leave owner, patient, protocol and arrival counts unchanged',async()=>{
 await user('reason-vet','vet');await query("UPDATE users SET vet_id='reason-vet' WHERE id='reason-vet'");
 const body={...walkIn,phone:'09176667788',petName:'Reason Check',species:'Canine',weight:5,addToQueue:true,vetId:'reason-vet',serviceCategory:'consultation',reason:'Walk-in examination'};
 const counts=async()=> (await query('SELECT (SELECT COUNT(*) FROM owners)::int owners,(SELECT COUNT(*) FROM pets)::int pets,(SELECT COUNT(*) FROM pet_weights)::int weights,(SELECT COUNT(*) FROM vaccinations)::int vacc,(SELECT COUNT(*) FROM appointments)::int appts,(SELECT COUNT(*) FROM audit_logs)::int audits')).rows[0];
 const before=await counts();
 for(const change of [{reason:'123456'},{reason:''},{reason:'x'.repeat(301)},{serviceCategory:'invented'}]) {
  assert.equal((await call(assistant,'POST','/walk-in',{...body,...change})).status,400);
  assert.deepEqual(await counts(),before);
 }
 const saved=await call(assistant,'POST','/walk-in',body);assert.equal(saved.status,200,JSON.stringify(saved.data));
 const appt=saved.data.appointment;
 assert.equal(appt.status,'Scheduled');assert.equal(appt.intakeVitals,null);
 await query("UPDATE appointments SET status='Rejected' WHERE id=$1",[appt.id]);
 const arrival={petId:saved.data.pet.id,vetId:'reason-vet',bookingKind:'walk-in',service:'checkup',reason:'New walk-in examination'};
 assert.equal((await call(assistant,'POST','/appointments',{...arrival,reason:'123456'})).status,400);
 const next=await call(assistant,'POST','/appointments',arrival);assert.equal(next.status,200,JSON.stringify(next.data));
 assert.equal(next.data.appointment.status,'Scheduled');assert.equal(next.data.appointment.bookingKind,'walk-in');
 assert.equal(next.data.appointment.reason,arrival.reason);
 const duplicate=await call(assistant,'POST','/appointments',arrival);assert.equal(duplicate.status,409);
});
