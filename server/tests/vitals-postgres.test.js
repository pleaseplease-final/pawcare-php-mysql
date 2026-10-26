import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import pg from 'pg';
import express from 'express';
import cookieParser from 'cookie-parser';
import {intakeVisitSnapshot} from '../../src/intakeVisit.js';
if(!process.env.TEST_DATABASE_URL)throw Error('Set TEST_DATABASE_URL to a disposable local database');
const url=new URL(process.env.TEST_DATABASE_URL);
if(!['localhost','127.0.0.1'].includes(url.hostname))throw Error('Local database required');
const admin=new pg.Pool({connectionString:url.href}),schema=`test_vitals_${crypto.randomUUID().replaceAll('-','')}`;
await admin.query(`CREATE SCHEMA ${schema}`);url.searchParams.set('options',`-c search_path=${schema},public`);process.env.DATABASE_URL=url.href;
const {query,pool}=await import('../db.js');
const sql=name=>readFileSync(new URL(`../database/${name}.sql`,import.meta.url),'utf8');
await query(sql('schema'));await query(sql('appointment-status'));
const {ensurePetRegistrationSchema}=await import('../petRegistration.js');await ensurePetRegistrationSchema();
const {ensureAdmissionsSchema}=await import('../admissions.js');await ensureAdmissionsSchema();
const {sha256}=await import('../security.js');
for(const role of ['owner','other-owner','assistant','vet','other-vet','admin']){
 const actual=role.replace('other-','');
 await query("INSERT INTO users(id,first_name,last_name,birthday,password_hash,email,role,owner_id,vet_id,mobile_number,email_verified_at,mobile_verified) VALUES($1,'Synthetic',$1,'1990-01-01','unused',$2,$3,$4,$5,'+639170000001',NOW(),true)",[role,`${role}@example.invalid`,actual,actual==='owner'?role:null,actual==='vet'?role:null]);
 await query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,NOW()+INTERVAL '1 day')",[sha256(role),role]);
}
await query("INSERT INTO owners(id,name,email,phone,address) VALUES('owner','Synthetic owner','owner@example.invalid','+639170000001','Synthetic'),('other-owner','Other owner','other@example.invalid','+639170000002','Synthetic')");
await query("INSERT INTO pets(id,owner_id,name,species,birth,weight) VALUES('legacy','owner','Legacy','Dog','2020-01-01',10)");
await query("INSERT INTO pet_weights(id,pet_id,date,kg,recorded_by) VALUES('original-weight','legacy','2025-01-01',10,'Owner')");
await query(`INSERT INTO appointments(id,pet_id,vet_id,date,time,reason,status,intake_vitals) VALUES('original-visit','legacy','vet','2025-01-02','09:00','Legacy visit','Completed','{"weight":10.5,"temp":38.8,"checkedInBy":"Old assistant"}')`);
const legacyAdmission=crypto.randomUUID(),legacyObservation=crypto.randomUUID(),legacyMeasured=crypto.randomUUID();
await query("INSERT INTO admissions(id,pet_id,appt_id,reason,care_plan) VALUES($1,'legacy','original-visit','Legacy admission','Legacy care')",[legacyAdmission]);
await query("INSERT INTO admission_updates(id,admission_id,kind,clinical_note,measurements,actor_id,actor_name,actor_role,request_payload,created_at) VALUES($1,$2,'Observation','Historical bedside note','{}','vet','Synthetic vet','vet','{}','2025-01-02T12:00:00Z'),($3,$2,'Observation','Historical measurements','{\"temp\":38.7,\"weight\":10.6}','assistant','Synthetic assistant','assistant','{}','2025-01-02T13:00:00Z')",[legacyObservation,legacyAdmission,legacyMeasured]);
const {ensureVitalsSchema}=await import('../vitals.js');await ensureVitalsSchema();
const {clinicRouter}=await import('../routes/clinic.js');
const app=express();app.use(express.json());app.use(cookieParser());app.use('/api',clinicRouter);
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
after(async()=>{await new Promise(r=>server.close(r));await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();});
const call=async(role,method,path,body)=>{const res=await fetch(`http://127.0.0.1:${server.address().port}/api${path}`,{method,headers:{'Content-Type':'application/json',...(role?{Authorization:`Bearer ${role}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:res.status,data:await res.json()};};
const {clinicClock,shiftDate}=await import('../scheduling.js');
async function fixture(status='Scheduled',date=clinicClock().date){
 const pet=crypto.randomUUID(),id=crypto.randomUUID();
 await query("INSERT INTO pets(id,owner_id,name,species,breed,birth,weight,registration_status) VALUES($1,'owner','Synthetic patient','Dog','Mixed Breed','2020-01-01',10,'Verified')",[pet]);
 return (await query("INSERT INTO appointments(id,pet_id,vet_id,date,time,reason,status) VALUES($1,$2,'vet',$3,'09:00','Examination',$4) RETURNING *",[id,pet,date,status])).rows[0];
}
const intake=(visit,role='assistant',values={})=>call(role,'PATCH',`/appointments/${visit.id}/status`,{status:['Checked-in','In consultation'].includes(visit.status)?visit.status:'Checked-in',expectedVisit:intakeVisitSnapshot(visit),intakeVitals:{weight:10.25,temp:38.5,notes:'Measured in clinic',...values}});
const history=(pet,role='assistant',cursor='')=>call(role,'GET',`/pets/${pet}/vitals${cursor?'?'+new URLSearchParams({cursor}):''}`);
const correction=(row,body={},role='assistant',pet=row.petId)=>call(role,'POST',`/pets/${pet}/vitals/${row.id}/correct`,{requestId:crypto.randomUUID(),value:row.value+0.1,reason:'Transcription error',...body});
const rows=async pet=>(await query('SELECT * FROM vital_measurements WHERE pet_id=$1 ORDER BY id',[pet])).rows;
const snapshot=async visit=>({visit:(await query('SELECT * FROM appointments WHERE id=$1',[visit.id])).rows,pet:(await query('SELECT * FROM pets WHERE id=$1',[visit.pet_id])).rows,weights:(await query('SELECT * FROM pet_weights WHERE pet_id=$1 ORDER BY id',[visit.pet_id])).rows,vitals:await rows(visit.pet_id),audits:(await query('SELECT * FROM audit_logs ORDER BY id')).rows});

test('migration preserves source IDs and old metadata honestly, and reruns without duplicate history',async()=>{
 const h=await history('legacy','owner');assert.equal(h.status,200,JSON.stringify(h));
 assert.equal(h.data.measurements.length,3);
 const registration=h.data.measurements.find(r=>r.origin==='registration');assert.equal(registration.value,10);assert.equal(registration.measuredAt,null);assert.equal(registration.visitId,null);
 const temp=h.data.measurements.find(r=>r.kind==='temp');assert.equal(temp.value,38.8);assert.equal(temp.visitId,'original-visit');assert.equal(temp.measuredAt,null);assert.equal(temp.recordedAt,null);assert.equal(temp.staffId,null);assert.equal(temp.staffName,'Old assistant');
 const staff=(await history('legacy','vet')).data.measurements;assert.equal(staff.length,6);assert.ok(staff.some(m=>m.kind==='observation'&&m.measuredAt==='2025-01-02T12:00:00.000Z'));assert.ok(staff.some(m=>m.source==='admission'&&m.staffId==='assistant'&&m.unit==='°C'));
 const before=await rows('legacy');await query(sql('vitals-history'));await query(sql('vitals-history'));assert.deepEqual(await rows('legacy'),before);
 assert.equal((await query("SELECT id FROM pet_weights WHERE pet_id='legacy'")).rows[0].id,'original-weight');
 assert.equal((await query("SELECT id FROM appointments WHERE pet_id='legacy'")).rows[0].id,'original-visit');
});

test('assistant and assigned vet can capture intake; other roles and vets cannot spoof access or staff',async()=>{
 for(const role of ['assistant','vet']){
  const v=await fixture(),r=await intake(v,role,{staffId:'forged',staffRole:'admin',checkedInBy:'forged',measuredAt:'1990-01-01'});assert.equal(r.status,200,JSON.stringify(r));
  const h=await history(v.pet_id,role);assert.equal(h.data.measurements.length,2);
  for(const m of h.data.measurements){assert.equal(m.staffId,role);assert.equal(m.staffRole,role);assert.equal(m.staffName,`Synthetic ${role}`);assert.equal(m.petId,v.pet_id);assert.equal(m.visitId,v.id);assert.ok(Date.parse(m.measuredAt)>Date.now()-60000);assert.ok(m.unit);assert.equal(m.origin,'clinic');}
 }
 const v=await fixture(),before=await snapshot(v);
 for(const role of ['owner','other-owner','other-vet','admin'])assert.ok([403,404,409].includes((await intake(v,role)).status),role);
 assert.deepEqual(await snapshot(v),before);
 assert.equal((await intake(v,null)).status,401);
 assert.equal((await history(v.pet_id,'other-owner')).status,404);assert.equal((await history(v.pet_id,'other-vet')).status,404);
});

test('same-day remeasurement appends both vitals, survives midnight, and preserves consultation stage',async()=>{
 const v=await fixture();let saved=(await intake(v)).data.appointment;
 for(const [i,role] of ['assistant','vet','assistant'].entries()){
  const r=await intake(saved,role,{weight:11+i,temp:38.6+i/10});assert.equal(r.status,200,JSON.stringify(r));saved=r.data.appointment;
 }
 assert.equal((await rows(v.pet_id)).length,8);assert.equal((await query('SELECT count(*)::int n FROM pet_weights WHERE pet_id=$1',[v.pet_id])).rows[0].n,4);
 const start=await call('vet','PATCH',`/appointments/${v.id}/status`,{status:'In consultation',expectedVisit:intakeVisitSnapshot(saved)});assert.equal(start.status,200,JSON.stringify(start));
 await query('UPDATE appointments SET date=$2 WHERE id=$1',[v.id,shiftDate(clinicClock().date,-1)]);
 const ongoing=(await query('SELECT * FROM appointments WHERE id=$1',[v.id])).rows[0];
 const r=await intake(ongoing,'assistant');assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.data.appointment.status,'In consultation');assert.equal((await rows(v.pet_id)).length,10);
 const future=await fixture('Scheduled',shiftDate(clinicClock().date,1));assert.equal((await intake(future,'vet')).status,409);
 await query(sql('vitals-history'));assert.equal((await rows(v.pet_id)).length,10,'reruns do not backfill mirrors twice');
});

test('invalid measurements and stale/concurrent saves leave no partial snapshots or journal rows',async()=>{
 const v=await fixture();const before=await snapshot(v);
 for(const invalid of [{weight:0},{temp:46},{weight:1.001},{temp:38.123},{temp:'38.5'},{notes:'x'.repeat(2001)}])assert.equal((await intake(v,'vet',invalid)).status,409,JSON.stringify(invalid));
 assert.deepEqual(await snapshot(v),before);
 const invalidReason=await call('assistant','PATCH',`/appointments/${v.id}/status`,{status:'Checked-in',expectedVisit:intakeVisitSnapshot(v),reason:'45555555555',intakeVitals:{weight:12,temp:38.5}});assert.equal(invalidReason.status,409);assert.match(invalidReason.data.error,/words/);assert.deepEqual(await snapshot(v),before);
 const results=await Promise.all([intake(v),intake(v,'vet')]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);assert.equal((await rows(v.pet_id)).length,2);
 assert.equal((await intake(v)).status,409);assert.equal((await rows(v.pet_id)).length,2);
});

test('corrections retain the original, refresh the current snapshot, and retry without duplicates',async()=>{
 const v=await fixture();assert.equal((await intake(v)).status,200);
 const original=(await history(v.pet_id)).data.measurements.find(r=>r.kind==='weight');const requestId=crypto.randomUUID();
 const r=await correction(original,{requestId,value:10.8});assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.data.measurement.correctsId,original.id);
 const after=await snapshot(v);assert.equal(after.vitals.length,3);assert.equal(after.visit[0].intake_vitals.weight,10.8);assert.equal(Number(after.pet[0].weight),10.8);
 assert.equal(Number(after.vitals.find(m=>m.id===original.id).value),10.25);assert.equal(after.visit[0].intake_vitals.measurementIds.weight,r.data.measurement.id);
 assert.equal((await correction(original,{requestId,value:10.8})).status,200);assert.deepEqual(await snapshot(v),after);
 assert.equal((await correction(original,{requestId,value:11})).status,409);
 const h=(await history(v.pet_id)).data.measurements;assert.equal(h.find(m=>m.id===original.id).supersededBy,r.data.measurement.id);
 assert.equal((await correction(r.data.measurement,{value:10.7},'vet')).status,200);
 assert.equal((await correction(original)).status,409);
});

test('correcting old intake never replaces a newer measurement; temperature corrections also retain history',async()=>{
 const v=await fixture();let r=await intake(v);const originals=(await history(v.pet_id)).data.measurements;
 r=await intake(r.data.appointment,'vet',{weight:12,temp:39});assert.equal(r.status,200);
 const old=originals.find(m=>m.kind==='weight');assert.equal((await correction(old,{value:9.5})).status,200);
 const state=await snapshot(v);assert.equal(Number(state.pet[0].weight),12);assert.equal(state.visit[0].intake_vitals.weight,12);
 const temp=(await history(v.pet_id)).data.measurements.find(m=>m.kind==='temp'&&m.value===39);assert.equal((await correction(temp,{value:38.9},'vet')).status,200);
 const final=await snapshot(v);assert.equal(final.visit[0].intake_vitals.temp,38.9);assert.equal(final.vitals.length,6);
});

test('correction role/field checks, one-winner concurrency and audit rollback preserve history',async()=>{
 const v=await fixture();await intake(v);const original=(await history(v.pet_id)).data.measurements.find(r=>r.kind==='weight');const before=await snapshot(v);
 for(const role of ['owner','admin','other-vet'])assert.ok([403,404].includes((await correction(original,{},role)).status));
 for(const body of [{reason:''},{reason:'x'.repeat(501)},{value:NaN},{value:9.123},{value:'9'}])assert.equal((await correction(original,body)).status,400);
 assert.equal((await correction(original,{},'assistant','legacy')).status,404);
 assert.deepEqual(await snapshot(v),before);
 await query(`CREATE FUNCTION reject_correction() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action LIKE 'Corrected vital%' THEN RAISE EXCEPTION 'Synthetic failure'; END IF; RETURN NEW; END $$`);
 await query('CREATE TRIGGER reject_correction BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_correction()');
 try{assert.equal((await correction(original)).status,500);assert.deepEqual(await snapshot(v),before);}finally{await query('DROP TRIGGER reject_correction ON audit_logs');}
 const race=await Promise.all([correction(original,{value:10.4}),correction(original,{value:10.5})]);assert.deepEqual(race.map(r=>r.status).sort(),[200,409]);assert.equal((await rows(v.pet_id)).length,3);
});

test('database refuses edits or deletes of saved measurements',async()=>{
 const v=await fixture();await intake(v);const before=await rows(v.pet_id);
 await assert.rejects(query("UPDATE vital_measurements SET value=12 WHERE pet_id=$1",[v.pet_id]),/append-only/);
 await assert.rejects(query('DELETE FROM vital_measurements WHERE pet_id=$1',[v.pet_id]),/append-only/);assert.deepEqual(await rows(v.pet_id),before);
});

test('keyset pages include every row once, including equal microsecond timestamps and corrected entries',async()=>{
 const v=await fixture();
 await query(`INSERT INTO vital_measurements(id,pet_id,appt_id,kind,value,unit,measured_at,measurement_date,recorded_at,staff_id,staff_name,staff_role,source,origin) SELECT 'page-'||n,$1,$2,'weight',10,'kg',now(),CURRENT_DATE,'2026-01-01T00:00:00.123456Z','vet','Synthetic vet','vet','intake','clinic' FROM generate_series(1,123) n`,[v.pet_id,v.id]);
 const ids=[];let cursor;
 do{const h=await history(v.pet_id,'owner',cursor);assert.equal(h.status,200,JSON.stringify(h));ids.push(...h.data.measurements.map(m=>m.id));cursor=h.data.page.cursor;}while(cursor);
 assert.equal(ids.length,123);assert.equal(new Set(ids).size,123);assert.equal((await history(v.pet_id,'owner','garbage')).status,400);
});

test('admission notes and repeat vitals share the journal, retain care records and remain staff-only',async()=>{
 const v=await fixture('In consultation');
 const body={requestId:crypto.randomUUID(),apptId:v.id,expectedVisit:intakeVisitSnapshot(v),clinicalNote:'Private admission reason',carePlan:'Clinical plan',ownerUpdate:'Staying for observation.',nextObservationAt:new Date(Date.now()+3600000).toISOString(),observationInstructions:'Check regularly',consentConfirmed:true,consentName:'Synthetic owner',consentMethod:'In person',emergencyName:'Synthetic owner',emergencyPhone:'+639170000001',emergencyRelationship:'Owner'};
 const admitted=await call('vet','POST','/admissions',body);assert.equal(admitted.status,200,JSON.stringify(admitted));
 const path=`/admissions/${admitted.data.admission.id}/update`;
 const update={requestId:crypto.randomUUID(),revision:0,clinicalNote:'Private bedside observation',ownerUpdate:'Checked again.',measurements:{weight:10.3,temp:38.7}};
 assert.equal((await call('assistant','POST',path,update)).status,200);assert.equal((await call('assistant','POST',path,update)).status,200);
 const again={...update,requestId:crypto.randomUUID(),revision:1};assert.equal((await call('vet','POST',path,again)).status,200);
 const h=(await history(v.pet_id,'vet')).data.measurements;assert.equal(h.length,5);assert.equal(h.filter(m=>m.kind==='observation').length,1);assert.equal(h.filter(m=>m.kind==='temp').length,2);
 assert.ok(h.every(m=>m.visitId===v.id&&m.staffId&&m.source==='admission'));assert.ok(h.some(m=>m.notes==='Private bedside observation'));
 const temp=h.find(m=>m.kind==='temp');assert.equal((await correction(temp,{value:38.6},'vet')).status,200);
 assert.equal((await history(v.pet_id,'owner')).data.measurements.length,0,'corrections preserve admission privacy');
 const ownerState=(await call('owner','GET','/state')).data.data.pets.find(p=>p.id===v.pet_id);assert.equal(ownerState.weight,10);assert.equal(ownerState.weights.length,0,'private admission measurements cannot leak through shared weight history');
 const admission=(await call('vet','GET',`/admissions/${admitted.data.admission.id}`)).data;assert.equal(admission.admission.status,'Admitted');assert.equal(admission.updates.length,3);assert.equal(admission.admission.carePlan,'Clinical plan');
 assert.equal((await query('SELECT status FROM appointments WHERE id=$1',[v.id])).rows[0].status,'In consultation');
});


test('intake snapshot, measurement journal, weight mirror and audit fail together',async()=>{
 for(const [table,event,condition] of [['vital_measurements','BEFORE INSERT',"NEW.kind='temp'"],['pet_weights','BEFORE INSERT','true'],['audit_logs','BEFORE INSERT',"NEW.action LIKE 'Updated appointment%'"]]){
  const v=await fixture(),before=await snapshot(v);
  await query(`CREATE OR REPLACE FUNCTION fail_intake() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF ${condition} THEN RAISE EXCEPTION 'Synthetic failure'; END IF; RETURN NEW; END $$`);
  await query(`CREATE TRIGGER fail_intake ${event} ON ${table} FOR EACH ROW EXECUTE FUNCTION fail_intake()`);
  try{assert.equal((await intake(v)).status,500);assert.deepEqual(await snapshot(v),before);}finally{await query(`DROP TRIGGER fail_intake ON ${table}`);}
  assert.equal((await intake(v,'vet')).status,200);
 }
});

test('manual clinical weights require visit, exact valid time and canonical staff; older times preserve latest weight',async()=>{
 const v=await fixture('Completed'),time=new Date(Date.now()-60000).toISOString(),older=new Date(Date.now()-120000).toISOString();
 const measure=(body={},role='assistant')=>call(role,'POST',`/pets/${v.pet_id}/weights`,{visitId:v.id,measuredAt:time,kg:11,...body});
 for(const body of [{visitId:null},{measuredAt:'2026-02-30T01:00:00Z'},{measuredAt:'2026-01-01'},{measuredAt:new Date(Date.now()+3600000).toISOString()}])assert.equal((await measure(body)).status,400);
 assert.equal((await measure({},'other-vet')).status,403);assert.equal((await measure({},'owner')).status,403);
 assert.equal((await measure({recordedBy:'Forged'})).status,200);
 assert.equal((await measure({kg:9,measuredAt:older},'vet')).status,200);
 const saved=await snapshot(v);assert.equal(Number(saved.pet[0].weight),11);assert.equal(saved.pet[0].weight_origin,'clinic');assert.equal(saved.vitals.length,2);assert.ok(saved.vitals.every(m=>m.appt_id===v.id&&m.measured_at&&m.staff_id&&m.unit==='kg'));
 assert.equal(saved.vitals.find(m=>Number(m.value)===11).staff_name,'Synthetic assistant');
});
