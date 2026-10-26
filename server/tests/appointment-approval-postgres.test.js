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
const schema = `test_approval_${crypto.randomUUID().replaceAll('-','')}`;
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

const {clinicClock,shiftDate} = await import('../scheduling.js');
const {holidayName} = await import('../../src/booking.js');
const {intakeVisitSnapshot} = await import('../../src/intakeVisit.js');
await user('approval-vet','vet');
const base = {name:'Luna',species:'Feline',breed:'Puspin',sex:'Female',birth:'2025-01-01',weight:4.25,neutered:'Not sure',color:'White',notes:'Owner reported history'};
let day = 1;
async function fixture(label) {
 const owner = await user(label);
 const created = await call(owner,'POST','/pet-requests',base);
 assert.equal(created.status,200,JSON.stringify(created.data));
 let date = shiftDate(clinicClock().date,day++);
 while (holidayName(date)) date = shiftDate(clinicClock().date,day++);
 const request = created.data.request;
 const booking = {petId:request.pet_id,vetId:'approval-vet',date,time:'09:00',reason:'Routine examination',service:'checkup'};
 const result = await call(owner,'POST','/appointments',booking);
 assert.equal(result.status,200,JSON.stringify(result.data));
 const visit = result.data.appointment;
 const body = {status:'Scheduled',expectedVisit:intakeVisitSnapshot(visit),expectedRegistration:{id:request.id,revision:request.revision},actorName:'Forged actor',actorRole:'admin'};
 return {owner,request,visit,body,booking};
}
const approve = f => call(assistant,'PATCH',`/appointments/${f.visit.id}/status`,f.body);
async function saved(f) {
 return {
  pet:(await query('SELECT * FROM pets WHERE id=$1',[f.request.pet_id])).rows,
  request:(await query('SELECT * FROM pet_requests WHERE id=$1',[f.request.id])).rows,
  appointment:(await query('SELECT * FROM appointments WHERE id=$1',[f.visit.id])).rows,
  weights:(await query('SELECT * FROM pet_weights WHERE pet_id=$1 ORDER BY id',[f.request.pet_id])).rows,
  vaccines:(await query('SELECT * FROM vaccinations WHERE pet_id=$1 ORDER BY id',[f.request.pet_id])).rows,
  audit:(await query('SELECT * FROM audit_logs ORDER BY id')).rows
 };
}

test('one approval verifies the same patient, confirms its slot and persists trusted timestamped attribution',async()=>{
 const f = await fixture('combined');
 const result = await approve(f); assert.equal(result.status,200,JSON.stringify(result.data));
 const state = await saved(f);
 assert.equal(state.pet[0].id,f.request.pet_id);assert.equal(state.pet[0].registration_status,'Verified');
 assert.equal(state.request[0].status,'Approved');assert.equal(state.request[0].revision,1);
 assert.equal(state.request[0].approved_by_user_id,assistant);assert.ok(state.request[0].reviewed_at instanceof Date);
 assert.equal(state.appointment[0].status,'Scheduled');assert.equal(state.appointment[0].approved_by_user_id,assistant);
 assert.equal(state.appointment[0].approved_by,'Synthetic assistant');assert.ok(state.appointment[0].approved_at instanceof Date);
 assert.equal(state.appointment[0].date,f.booking.date);assert.equal(state.appointment[0].time,f.booking.time);
 assert.equal(result.data.registration.pet.id,f.request.pet_id);
 assert.equal((await query('SELECT count(*)::int n FROM pets WHERE owner_id=$1',[f.request.owner_id])).rows[0].n,1);
 const remote = (await call(f.owner,'GET','/state')).data.data;
 assert.equal(remote.appts.find(a=>a.id===f.visit.id).approvedByUserId,assistant);
 assert.ok(remote.petRequests.find(r=>r.id===f.request.id).reviewedAt);
});

test('concurrent approval clicks and retries produce one approval, patient, baseline and protocol set',async()=>{
 const f = await fixture('duplicate');
 const responses = await Promise.all([approve(f),approve(f),approve(f)]);
 assert.ok(responses.every(r=>r.status===200),JSON.stringify(responses));
 const before = await saved(f);
 assert.equal(before.weights.length,1);assert.ok(before.vaccines.length>0);
 assert.equal(before.audit.filter(a=>a.action.startsWith(`Approved appointment ${f.visit.id}`)).length,1);
 assert.equal(before.audit.filter(a=>a.action.startsWith(`Approved pet request ${f.request.id}`)).length,1);
 const replay = await approve(f);assert.equal(replay.status,200);assert.equal(replay.data.registration.pet.id,f.request.pet_id);
 assert.deepEqual(await saved(f),before);
});

test('failure at each patient, protocol, request, appointment and audit write rolls everything back',async()=>{
 const failures = [
  ['pets','BEFORE UPDATE',"NEW.registration_status='Verified'"],
  ['pet_weights','BEFORE INSERT','true'],
  ['vaccinations','BEFORE INSERT','true'],
  ['pet_requests','BEFORE UPDATE',"NEW.status='Approved'"],
  ['appointments','BEFORE UPDATE',"NEW.status='Scheduled'"],
  ['audit_logs','BEFORE INSERT',"NEW.action LIKE 'Approved appointment%'"],
  ['audit_logs','BEFORE INSERT',"NEW.action LIKE 'Approved pet request%'"],
 ];
 for (const [index,[table,event,condition]] of failures.entries()) {
  const f = await fixture(`rollback-${index}`);const before = await saved(f);
  await query(`CREATE OR REPLACE FUNCTION fail_approval() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF ${condition} THEN RAISE EXCEPTION 'synthetic approval failure'; END IF; RETURN NEW; END $$`);
  await query(`CREATE TRIGGER fail_approval ${event} ON ${table} FOR EACH ROW EXECUTE FUNCTION fail_approval()`);
  try {assert.equal((await approve(f)).status,500);assert.deepEqual(await saved(f),before);}
  finally {await query(`DROP TRIGGER fail_approval ON ${table}`);}
  assert.equal((await approve(f)).status,200);
 }
});

test('missing/stale registration review and declined registrations leave both records untouched',async()=>{
 const f = await fixture('stale');
 let before = await saved(f);
 for (const expectedRegistration of [undefined,{id:f.request.id,revision:99},{id:'other',revision:0},{id:f.request.id,revision:'0'}]) {
  const result = await call(assistant,'PATCH',`/appointments/${f.visit.id}/status`,{...f.body,expectedRegistration});
  assert.equal(result.status,409);assert.deepEqual(await saved(f),before);
 }
 const updated = await call(f.owner,'PUT',`/pet-requests/${f.request.id}`,{...base,revision:0,notes:'Corrected history'});
 assert.equal(updated.status,200);before=await saved(f);assert.equal((await approve(f)).status,409);assert.deepEqual(await saved(f),before);
 assert.equal((await call(assistant,'POST',`/pet-requests/${f.request.id}/decline`,{revision:1,reason:'Correct birth date'})).status,200);
 f.body.expectedRegistration.revision=2;before=await saved(f);
 assert.equal((await approve(f)).status,409);assert.deepEqual(await saved(f),before);
});

test('slot conflicts, duplicate pet/day bookings and inactive vets cannot verify a pending patient',async()=>{
 for (const kind of ['overlap','same-pet','inactive']) {
  const f=await fixture(`conflict-${kind}`);
  if (kind==='inactive') await query('ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true');
  if (kind==='inactive') await query("UPDATE users SET is_active=false WHERE id='approval-vet'");
  else await query(`INSERT INTO appointments(id,pet_id,vet_id,date,time,reason,status,service,duration_minutes) VALUES($1,$2,$3,$4,$5,'Legacy overlap','Pending Approval','checkup',60)`,[`conflict-${kind}`,f.request.pet_id,kind==='overlap'?'approval-vet':'other-vet',f.booking.date,kind==='overlap'?'09:30':'14:00']);
  const before=await saved(f);
  try {assert.equal((await approve(f)).status,409);assert.deepEqual(await saved(f),before);}
  finally {if(kind==='inactive')await query("UPDATE users SET is_active=true WHERE id='approval-vet'");else await query('DELETE FROM appointments WHERE id=$1',[`conflict-${kind}`]);}
 }
});

test('competing booking cannot take a pending request slot while it is being approved',async()=>{
 const f=await fixture('racing-approval');const other=await user('racing-booking');
 const request=(await call(other,'POST','/pet-requests',base)).data.request;
 const [approved,booked]=await Promise.all([approve(f),call(other,'POST','/appointments',{...f.booking,petId:request.pet_id})]);
 assert.equal(approved.status,200);assert.equal(booked.status,409);
});

test('owners, vets and admins cannot approve or spoof the assistant identity',async()=>{
 const f=await fixture('roles');const vet=await user('approval-role-vet','vet');const admin=await user('approval-role-admin','admin');
 const before=await saved(f);
 for (const token of [f.owner,vet,admin]) assert.equal((await call(token,'PATCH',`/appointments/${f.visit.id}/status`,f.body)).status,token===f.owner?409:403);
 assert.deepEqual(await saved(f),before);
 const outsider=await user('outsider');assert.equal((await call(outsider,'GET','/state')).data.data.pets.length,0);
 assert.equal((await call(outsider,'PATCH',`/appointments/${f.visit.id}/status`,f.body)).status,404);
});

test('later cancellation and rejection retain verified patient and original registration attribution',async()=>{
 const f=await fixture('persistent');assert.equal((await approve(f)).status,200);
 const verified=(await saved(f)).pet;const reviewed=(await saved(f)).request;
 assert.equal((await call(f.owner,'PATCH',`/appointments/${f.visit.id}/status`,{status:'Cancelled',cancelReason:'Cannot attend'})).status,200);
 const second=await call(f.owner,'POST','/appointments',{...f.booking,date:shiftDate(f.booking.date,7)});
 assert.equal(second.status,200,JSON.stringify(second.data));
 assert.equal((await call(assistant,'PATCH',`/appointments/${second.data.appointment.id}/status`,{status:'Rejected',cancelReason:'Choose a different visit'})).status,200);
 assert.deepEqual((await saved(f)).pet,verified);assert.deepEqual((await saved(f)).request,reviewed);
});

test('rescheduling invalidates approval metadata and a stale approval cannot confirm the changed visit',async()=>{
 const f=await fixture('reschedule');assert.equal((await approve(f)).status,200);
 const updated=await call(f.owner,'PUT',`/appointments/${f.visit.id}`,{...f.booking,time:'11:00'});assert.equal(updated.status,200);
 const before=await saved(f);assert.equal(before.appointment[0].status,'Pending Approval');assert.equal(before.appointment[0].approved_at,null);
 assert.equal((await approve(f)).status,409);assert.deepEqual(await saved(f),before);
 const approved=await call(assistant,'PATCH',`/appointments/${f.visit.id}/status`,{status:'Scheduled',expectedVisit:intakeVisitSnapshot(updated.data.appointment)});
 assert.equal(approved.status,200);assert.equal((await saved(f)).weights.length,1);
});

test('approval migration is repeatable and preserves existing IDs, visits and histories',async()=>{
 const f=await fixture('migration');assert.equal((await approve(f)).status,200);const before=await saved(f);
 for(let i=0;i<2;i++) await query(readFileSync(new URL('../database/appointment-approval.sql',import.meta.url),'utf8'));
 assert.deepEqual(await saved(f),before);
});

test('approval retains authorized visit reason corrections and rejects malformed corrections atomically',async()=>{
 const f=await fixture('reason');let before=await saved(f);
 assert.equal((await call(assistant,'PATCH',`/appointments/${f.visit.id}/status`,{...f.body,reason:'  '})).status,409);
 assert.deepEqual(await saved(f),before);
 const result=await call(assistant,'PATCH',`/appointments/${f.visit.id}/status`,{...f.body,reason:'  Corrected examination reason  '});
 assert.equal(result.status,200);assert.equal(result.data.appointment.reason,'Corrected examination reason');
});
