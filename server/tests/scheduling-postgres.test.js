// Opt-in isolated-schema integration tests. Never use production credentials.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import pg from 'pg';
import express from 'express';
import cookieParser from 'cookie-parser';

if (!process.env.TEST_DATABASE_URL) throw new Error('Set TEST_DATABASE_URL to a disposable local PostgreSQL database');
const url=new URL(process.env.TEST_DATABASE_URL);
if (!['localhost','127.0.0.1'].includes(url.hostname)) throw new Error('These integration tests require a local database');
const admin=new pg.Pool({connectionString:url.href});
const schema=`test_schedule_${crypto.randomUUID().replaceAll('-','')}`;
await admin.query(`CREATE SCHEMA ${schema}`);
url.searchParams.set('options',`-c search_path=${schema},public`);
process.env.DATABASE_URL=url.href;
const {query,pool}=await import('../db.js');
await query(readFileSync(new URL('../database/schema.sql',import.meta.url),'utf8'));
await query(readFileSync(new URL('../database/appointment-status.sql',import.meta.url),'utf8'));
const {ensureSchedulingSchema}=await import('../database/schedulingSchema.js');
await ensureSchedulingSchema();
const {clinicClock,shiftDate}=await import('../scheduling.js');
const {holidayName}=await import('../../src/booking.js');
const {sha256}=await import('../security.js');
const {clinicRouter}=await import('../routes/clinic.js');
const {jobsRouter}=await import('../routes/jobs.js');
const {processReminders,reconcileReminders}=await import('../reminders.js');
const {UncertainDelivery}=await import('../reminderDelivery.js');
const app=express();app.use(express.json());app.use(cookieParser());app.use('/api/jobs',jobsRouter);app.use('/api',clinicRouter);
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
after(async()=>{await new Promise(r=>server.close(r));await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();});
const req=async(role,method,path,body)=>{
 const res=await fetch(`http://127.0.0.1:${server.address().port}/api${path}`,{method,headers:{'Content-Type':'application/json',...(role?{Authorization:`Bearer test-${role}`}:{})},...(body?{body:JSON.stringify(body)}:{})});
 return {status:res.status,data:await res.json()};
};
for(const role of ['owner','assistant','vet','admin']){
 await query(`INSERT INTO users(id,first_name,last_name,birthday,password_hash,email,role,vet_id,owner_id,mobile_number,email_verified_at,mobile_verified) VALUES($1,'Test',$2,'1990-01-01','unused',$3,$2,$4,$5,'+639000000000',NOW(),true)`,[`u_${role}`,role,`${role}@example.invalid`,role==='vet'?'v1':null,role==='owner'?'o1':null]);
 await query('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,NOW()+INTERVAL \'1 day\')',[sha256(`test-${role}`),`u_${role}`]);
}
await query("INSERT INTO owners(id,name,email,phone,address) VALUES('o1','Synthetic Owner','owner@example.invalid','+639000000000','Synthetic'),('o2','Other Owner','other@example.invalid','+639000000001','Synthetic')");
for(let i=1;i<=8;i++)await query("INSERT INTO pets(id,owner_id,name,birth) VALUES($1,$2,$3,'2020-01-01')",[`p${i}`,i===8?'o2':'o1',`Synthetic ${i}`]);
let date=shiftDate(clinicClock().date,1);while(holidayName(date))date=shiftDate(date,1);
const booking=patch=>({petId:'p1',vetId:'v1',date,time:'10:00',service:'checkup',reason:'Annual check-up',...patch});

test('PostgreSQL booking races, duration, editing, availability privacy and arrival exceptions',async()=>{
 const results=await Promise.all([req('owner','POST','/appointments',booking({petId:'p1'})),req('assistant','POST','/appointments',booking({petId:'p2'}))]);
 assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 const saved=results.find(r=>r.status===200).data.appointment;
 assert.equal(saved.durationMinutes,60);
 assert.equal((await query("SELECT n.nspname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.oid='vaccination_reminders'::regclass")).rows[0].nspname,schema);
 await query("UPDATE appointments SET status='Scheduled',amount=775 WHERE id=$1",[saved.id]);
 const note=await req('owner','PUT',`/appointments/${saved.id}`,{notes:'Synthetic unchanged slot',amount:-99});
 assert.equal(note.status,200);assert.equal(note.data.appointment.status,'Scheduled');assert.equal(note.data.appointment.amount,775);
 assert.equal((await req('assistant','POST','/appointments',booking({petId:'p3',time:'10:30',service:'vaccination'}))).status,409);
 const next=await req('assistant','POST','/appointments',booking({petId:'p3',time:'11:00',service:'vaccination'}));assert.equal(next.status,200);
 const edited=await req('assistant','PUT',`/appointments/${saved.id}`,booking({petId:saved.petId,time:'10:00'}));assert.equal(edited.status,200,JSON.stringify(edited));
 const available=await req('owner','GET',`/appointments/availability?date=${date}&vetId=v1&service=checkup`);
 assert.deepEqual(Object.keys(available.data),['slots']);assert.ok(!available.data.slots.includes('11:00'));assert.ok(available.data.slots.includes('12:30'));
 const walk=await req('assistant','POST','/appointments',booking({petId:'p4',bookingKind:'walk-in',date:'1900-01-01',time:'00:00'}));assert.equal(walk.status,200);assert.equal(walk.data.appointment.bookingKind,'walk-in');assert.equal(walk.data.appointment.date,clinicClock().date);
 const duplicate=await req('assistant','POST','/appointments',booking({petId:'p4',bookingKind:'walk-in'}));assert.equal(duplicate.status,409);
 assert.equal((await req('owner','POST','/appointments',booking({petId:'p8'}))).status,404);
 assert.equal((await req('owner','POST','/appointments',booking({petId:'p5',service:'surgery',reason:'Surgery – Surgical assessment',time:'15:00'}))).status,400,'new surgery bookings are refused on the server');
});

const vaccine=async(id,due,extra={})=>{
 await query(`INSERT INTO vaccinations(id,pet_id,card_id,vaccine,date,next_due,done,vet_id,created_at) VALUES($1,$2,'VACC-SYNTHETIC',$3,$4,$5,$6,$7,$8)`,[id,extra.pet||'p1',extra.vaccine||'Rabies',extra.date||'2026-01-01',due,extra.done??true,extra.vet??'v1',extra.created||'2026-01-01T00:00:00Z']);
};
const when=new Date('2026-10-24T02:00:00Z');
test('durable reminders create exactly 30/14/3 milestones per channel from certified doses',async()=>{
 await vaccine('dose',shiftDate('2026-10-24',30));
 await vaccine('placeholder',shiftDate('2026-10-24',30),{pet:'p2',done:false,vet:''});
 await Promise.all([reconcileReminders(when),reconcileReminders(when)]);
 const jobs=(await query('SELECT * FROM vaccination_reminders ORDER BY milestone DESC,channel')).rows;
 assert.equal(jobs.length,6);assert.deepEqual([...new Set(jobs.map(j=>j.milestone))],[30,14,3]);
 assert.ok(jobs.every(j=>j.vaccination_id==='dose'));assert.equal(new Date(jobs[0].scheduled_at).toISOString(),'2026-10-24T01:00:00.000Z');
});
test('concurrent/restarted workers claim each channel once and retain provider acceptance',async()=>{
 let sent=0;const deliver=async()=>{sent++;return{provider:'synthetic',id:'accepted-test'}};
 const r=await Promise.all([processReminders({now:when,deliver}),processReminders({now:when,deliver})]);
 assert.equal(sent,2);assert.equal(r.reduce((n,r)=>n+r.accepted,0),2);
 await processReminders({now:when,deliver});assert.equal(sent,2);
 assert.equal((await query("SELECT COUNT(*)::int n FROM vaccination_reminders WHERE status='accepted'")).rows[0].n,2);
});
test('known rejections retry durably with backoff; unknown submissions stop for staff',async()=>{
 await vaccine('retry',shiftDate('2026-10-24',14),{pet:'p3'});
 const first=await processReminders({now:when,deliver:async(channel)=>{if(channel==='sms')throw new UncertainDelivery('synthetic timeout');throw new Error('rejected');}});
 assert.equal(first.retrying,1);assert.equal(first.uncertain,1);
 const retry=(await query("SELECT * FROM vaccination_reminders WHERE vaccination_id='retry' AND milestone=14 AND channel='email'")).rows[0];
 assert.equal(retry.attempts,1);assert.equal(new Date(retry.next_attempt_at).toISOString(),'2026-10-24T02:15:00.000Z');
 let calls=0;await processReminders({now:when,deliver:async()=>{calls++;}});assert.equal(calls,0);
 await processReminders({now:new Date('2026-10-24T02:16Z'),deliver:async()=>({provider:'synthetic'})});
 assert.equal((await query("SELECT status FROM vaccination_reminders WHERE id=$1",[retry.id])).rows[0].status,'accepted');
});
test('new doses retire old reminders even without a next date; crash recovery never blindly resends',async()=>{
 await vaccine('new-dose',null,{date:'2026-10-24',created:'2026-10-24T02:00Z'});
 await query("UPDATE vaccination_reminders SET status='sending',claimed_at='2026-10-24T01:00Z' WHERE vaccination_id='retry' AND milestone=3 AND channel='email'");
 await reconcileReminders(when);
 assert.equal((await query("SELECT COUNT(*)::int n FROM vaccination_reminders WHERE vaccination_id='dose' AND status='pending'")).rows[0].n,0);
 assert.equal((await query("SELECT status FROM vaccination_reminders WHERE vaccination_id='retry' AND milestone=3 AND channel='email'")).rows[0].status,'uncertain');
});
test('job endpoint rejects missing secret/unauthorized caller and status is staff-only',async()=>{
 delete process.env.CRON_SECRET;
 assert.equal((await req(null,'GET','/jobs/vaccination-reminders')).status,503);
 process.env.CRON_SECRET='synthetic-job-secret';
 assert.equal((await req(null,'GET','/jobs/vaccination-reminders')).status,401);
 assert.equal((await req('owner','GET','/reminders/status')).status,403);
 const staff=await req('assistant','GET','/reminders/status');assert.equal(staff.status,200);assert.ok(staff.data.attention.length>0);
});

test('missed daily runs catch up the current milestone and skip expired earlier ones',async()=>{
 await vaccine('catchup',shiftDate('2026-10-24',30),{pet:'p5'});
 await reconcileReminders(new Date('2026-10-25T02:00Z'));
 assert.equal((await query("SELECT COUNT(*)::int n FROM vaccination_reminders WHERE vaccination_id='catchup' AND milestone=30 AND status='pending'")).rows[0].n,2);
 // At 14 days, the obsolete 30-day attempts are retired and the next pair is due.
 const phase=new Date('2026-11-09T02:00Z');
 const messages=[];
 await processReminders({now:phase,deliver:async(c,r,m)=>{messages.push(m);return{provider:'synthetic'}}});
 const rows=(await query("SELECT * FROM vaccination_reminders WHERE vaccination_id='catchup'")).rows;
 assert.ok(rows.filter(r=>r.milestone===30).every(r=>r.status==='cancelled'));
 assert.ok(rows.filter(r=>r.milestone===14).every(r=>r.status==='accepted'));
 assert.ok(rows.filter(r=>r.milestone===3).every(r=>r.status==='pending'));
 await processReminders({now:new Date('2026-11-20T02:00Z'),deliver:async()=>({provider:'synthetic'})});
 assert.equal((await query("SELECT COUNT(*)::int n FROM vaccination_reminders WHERE vaccination_id='catchup' AND milestone=3 AND status='accepted'")).rows[0].n,2);
});
test('five explicit provider rejections stop retries and surface a failed job',async()=>{
 await vaccine('permanent-rejection',shiftDate('2026-10-24',3),{pet:'p6'});
 let instant=when;
 for(let i=0;i<5;i++){
  await processReminders({now:instant,deliver:async()=>{throw new Error('synthetic rejection')}});
  instant=new Date(instant.getTime()+4*3600000);
 }
 const jobs=(await query("SELECT * FROM vaccination_reminders WHERE vaccination_id='permanent-rejection' AND milestone=3")).rows;
 assert.equal(jobs.length,2);assert.ok(jobs.every(r=>r.status==='failed' && r.attempts===5));
});

// Reception handoff shares the same isolated database and real authenticated router.
const payment = { amount:500, paymentMethod:'Cash',cashTendered:500,invoiceItems:[{catalogId:'srv_consult',name:'Routine General Consultation & Exam',price:500,qty:1}] };
const consultation = id => ({ id:`note_${id}`,apptId:id,petId:'p7',date:clinicClock().date,symptoms:'Synthetic history',objective:'Synthetic findings',diagnosis:'Synthetic assessment',treatment:'Synthetic plan',prescription:'' });
const prepareVisit = async (id,status='In consultation',visitDate=clinicClock().date)=>{
 await query("INSERT INTO appointments(id,pet_id,vet_id,date,time,reason,status) VALUES($1,'p7','v1',$2,'09:00','Synthetic handoff',$3)",[id,visitDate,status]);
 if(status==='Completed')await query("INSERT INTO consultations(id,pet_id,vet_id,appt_id,date,symptoms,objective,diagnosis,treatment,prescription) VALUES($1,'p7','v1',$2,$3,'Synthetic','Synthetic','Synthetic','Synthetic','')",[`note_${id}`,id,visitDate]);
};
let winningClaim,winningRole,losingRole;
test('consultation and checkout task commit together, including rollback if task creation fails',async()=>{
 await prepareVisit('handoff-rollback');
 assert.equal((await req('assistant','GET','/checkout-inbox')).status,200);
 await query(`CREATE FUNCTION reject_checkout_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.appointment_id='handoff-rollback' THEN RAISE EXCEPTION 'Synthetic task write failure'; END IF; RETURN NEW; END $$;
 CREATE TRIGGER fail_checkout_fixture BEFORE INSERT ON checkout_tasks FOR EACH ROW EXECUTE FUNCTION reject_checkout_fixture()`);
 const failed=await req('vet','POST','/consultations',consultation('handoff-rollback'));assert.equal(failed.status,500);
 assert.equal((await query("SELECT status FROM appointments WHERE id='handoff-rollback'")).rows[0].status,'In consultation');
 assert.equal((await query("SELECT COUNT(*)::int n FROM consultations WHERE appt_id='handoff-rollback'")).rows[0].n,0);
 await query('DROP TRIGGER fail_checkout_fixture ON checkout_tasks');
 const saved=await req('vet','POST','/consultations',consultation('handoff-rollback'));assert.equal(saved.status,200,JSON.stringify(saved));
 assert.equal((await query("SELECT COUNT(*)::int n FROM checkout_tasks WHERE appointment_id='handoff-rollback'")).rows[0].n,1);
});
test('checkout inbox restores prior-day completions, excludes paid visits, and leaks no claim tokens',async()=>{
 await prepareVisit('old-unpaid','Completed',shiftDate(clinicClock().date,-7));
 await prepareVisit('old-paid','Completed',shiftDate(clinicClock().date,-7));await query("UPDATE appointments SET billing_status='Paid' WHERE id='old-paid'");
 const inbox=await req('assistant','GET','/checkout-inbox');assert.equal(inbox.status,200,JSON.stringify(inbox));
 assert.ok(inbox.data.tasks.some(t=>t.appointmentId==='old-unpaid'));
 assert.ok(!inbox.data.tasks.some(t=>t.appointmentId==='old-paid'));
 assert.ok(inbox.data.tasks.every(t=>!('claimToken'in t)&&!('claim_hash'in t)));
 for(const role of ['owner','vet','admin'])assert.equal((await req(role,'GET','/checkout-inbox')).status,403);
});
test('two receptionists cannot claim or charge the same visit concurrently',async()=>{
 await query("INSERT INTO users(id,first_name,last_name,birthday,password_hash,email,role,mobile_number,email_verified_at,mobile_verified) VALUES('u_assistant2','Other','Reception','1990-01-01','unused','assistant2@example.invalid','assistant','+639000000000',NOW(),true)");
 await query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,'u_assistant2',NOW()+INTERVAL '1 day')",[sha256('test-assistant2')]);
 const roles=['assistant','assistant2'];const results=await Promise.all(roles.map(r=>req(r,'POST','/checkout-inbox/handoff-rollback/claim',{})));
 assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 const index=results.findIndex(r=>r.status===200);winningRole=roles[index];losingRole=roles[1-index];winningClaim=results[index].data.claimToken;
 assert.equal((await req(losingRole,'POST','/appointments/handoff-rollback/billing',payment)).status,409);
 assert.equal((await req(losingRole,'POST','/appointments/handoff-rollback/billing',{...payment,claimToken:winningClaim})).status,409);
 assert.equal((await req(winningRole,'POST','/appointments/handoff-rollback/billing',payment)).status,409);
 assert.equal((await req(losingRole,'POST','/checkout-inbox/handoff-rollback/release',{claimToken:winningClaim})).status,409);
 assert.equal((await req(winningRole,'POST','/checkout-inbox/handoff-rollback/renew',{claimToken:winningClaim})).status,200);
});
test('failed payment keeps the checkout claim; successful payment completes its task atomically',async()=>{
 await query(`CREATE FUNCTION reject_payment_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action LIKE '%Processed payment%handoff-rollback%' THEN RAISE EXCEPTION 'Synthetic audit failure'; END IF; RETURN NEW; END $$;
 CREATE TRIGGER fail_payment_fixture BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_payment_audit()`);
 const body={...payment,claimToken:winningClaim};
 assert.equal((await req(winningRole,'POST','/appointments/handoff-rollback/billing',body)).status,500);
 assert.equal((await query("SELECT billing_status FROM appointments WHERE id='handoff-rollback'")).rows[0].billing_status,'Unpaid');
 assert.equal((await query("SELECT status FROM checkout_tasks WHERE appointment_id='handoff-rollback'")).rows[0].status,'claimed');
 await query('DROP TRIGGER fail_payment_fixture ON audit_logs');
 assert.equal((await req(winningRole,'POST','/appointments/handoff-rollback/billing',body)).status,200);
 assert.equal((await query("SELECT status FROM checkout_tasks WHERE appointment_id='handoff-rollback'")).rows[0].status,'completed');
 assert.equal((await req(winningRole,'POST','/appointments/handoff-rollback/billing',body)).status,409);
 assert.ok(!(await req('assistant','GET','/checkout-inbox')).data.tasks.some(t=>t.appointmentId==='handoff-rollback'));
});
test('closed/restarted workstation releases or expires claims, and stale tokens cannot pay',async()=>{
 const first=await req('assistant','POST','/checkout-inbox/old-unpaid/claim',{});assert.equal(first.status,200);
 assert.equal((await req('assistant','POST','/checkout-inbox/old-unpaid/release',{claimToken:first.data.claimToken})).status,200);
 const second=await req('assistant2','POST','/checkout-inbox/old-unpaid/claim',{});assert.equal(second.status,200);
 await query("UPDATE checkout_tasks SET lease_until=NOW()-INTERVAL '1 second' WHERE appointment_id='old-unpaid'");
 assert.equal((await req('assistant2','POST','/appointments/old-unpaid/billing',{...payment,claimToken:second.data.claimToken})).status,409);
 assert.equal((await req('assistant2','POST','/checkout-inbox/old-unpaid/renew',{claimToken:second.data.claimToken})).status,409);
 const again=await req('assistant','POST','/checkout-inbox/old-unpaid/claim',{});assert.equal(again.status,200);
 assert.notEqual(again.data.claimToken,first.data.claimToken);
 assert.equal((await req('assistant','POST','/checkout-inbox/old-unpaid/renew',{claimToken:first.data.claimToken})).status,409);
});

test('vet handoff is atomic, scoped, race-safe and exposes instructions to the receiving vet', async () => {
 await query(`INSERT INTO users(id,first_name,last_name,birthday,password_hash,email,role,vet_id,mobile_number,email_verified_at,mobile_verified) VALUES('u_vet2','Second','Doctor','1990-01-01','unused','vet2@example.invalid','vet','v2','+639000000002',NOW(),true)`);
 await query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,'u_vet2',NOW()+INTERVAL '1 day')",[sha256('test-vet2')]);
 await query("INSERT INTO appointments(id,pet_id,vet_id,date,time,status,reason) VALUES('vet-handoff','p8','v1',$1,'11:00','In consultation','Clinical handoff')",[clinicClock().date]);
 const body={vetId:'v2',note:'Monitor hydration; treatment not yet administered.'};
 for(const role of ['owner','assistant','admin','vet2']) assert.equal((await req(role,'POST','/appointments/vet-handoff/handoff',body)).status,403);
 assert.equal((await req('vet','POST','/appointments/vet-handoff/handoff',{...body,note:''})).status,400);
 const baseline=(await query("SELECT * FROM appointments WHERE id='vet-handoff'")).rows[0];
 const {intakeVisitSnapshot}=await import('../../src/intakeVisit.js');
 const expectedVisit=intakeVisitSnapshot(baseline);
 await query("UPDATE appointments SET intake_vitals='{\"weight\":7,\"temp\":38.6}'::jsonb WHERE id='vet-handoff'");
 assert.equal((await req('vet','POST','/appointments/vet-handoff/handoff',{...body,expectedVisit})).status,409);
 assert.equal((await query("SELECT jsonb_array_length(handoffs) n FROM appointments WHERE id='vet-handoff'")).rows[0].n,0);
 body.expectedVisit=intakeVisitSnapshot((await query("SELECT * FROM appointments WHERE id='vet-handoff'")).rows[0]);
 for(const patch of [{status:'Checked-in'},{vetId:'v2'},{petId:'p1'},{date:'1900-01-01'},{time:'16:00'},{reason:'Outdated findings'}]) assert.equal((await req('vet','POST','/appointments/vet-handoff/handoff',{...body,expectedVisit:{...body.expectedVisit,...patch}})).status,409);
 for(const target of ['v1','missing-vet'])assert.equal((await req('vet','POST','/appointments/vet-handoff/handoff',{...body,vetId:target})).status,400);
 await query(`CREATE FUNCTION reject_handoff_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action LIKE 'Handed visit vet-handoff%' THEN RAISE EXCEPTION 'Synthetic handoff audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_handoff BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_handoff_audit()`);
 assert.equal((await req('vet','POST','/appointments/vet-handoff/handoff',body)).status,500);
 assert.equal((await query("SELECT vet_id FROM appointments WHERE id='vet-handoff'")).rows[0].vet_id,'v1');
 await query('DROP TRIGGER fail_handoff ON audit_logs');
 const results=await Promise.all([req('vet','POST','/appointments/vet-handoff/handoff',body),req('vet','POST','/appointments/vet-handoff/handoff',body)]);
 assert.deepEqual(results.map(r=>r.status).sort(),[200,403]);
 const confirmed=results.find(r=>r.status===200).data;
 assert.deepEqual(confirmed.appointment,{id:'vet-handoff',petId:'p8',vetId:'v2',status:'Checked-in'});
 assert.equal(confirmed.handoff.note,body.note);assert.equal(confirmed.handoff.toId,'v2');assert.equal(confirmed.handoff.fromId,'v1');assert.ok(Number.isFinite(Date.parse(confirmed.handoff.at)));
 const row=(await query("SELECT * FROM appointments WHERE id='vet-handoff'")).rows[0];
 assert.equal(row.status,'Checked-in');assert.equal(row.handoffs.length,1);assert.equal(row.handoffs[0].note,body.note);
 const state=await req('vet2','GET','/state');assert.equal(state.status,200);
 assert.equal(state.data.data.appts.find(a=>a.id==='vet-handoff').handoffs[0].note,body.note);
 assert.ok(state.data.data.pets.some(p=>p.id==='p8'));
 assert.ok(!(await req('vet','GET','/state')).data.data.appts.some(a=>a.id==='vet-handoff'));
 assert.equal((await req('vet2','PATCH','/appointments/vet-handoff/status',{status:'In consultation'})).status,200);
 const plan={id:'care-followup',petId:'p8',apptId:'vet-handoff',date:clinicClock().date,symptoms:'Low appetite',objective:'Alert',diagnosis:'Observation required',treatment:'Monitor intake',prescription:'',careStatus:'Recheck required',followUpDate:shiftDate(clinicClock().date,7),followUpReason:'Reassess appetite and hydration'};
 assert.equal((await req('vet2','POST','/consultations',{...plan,followUpDate:'2026-02-30'})).status,400);
 assert.equal((await req('vet2','POST','/consultations',plan)).status,200);
 const persisted=(await req('vet2','GET','/state')).data.data.consults.find(c=>c.id===plan.id);
 assert.equal(persisted.careStatus,'Recheck required');assert.equal(persisted.followUpDate,plan.followUpDate);
 assert.equal(persisted.followUpReason,plan.followUpReason);
 assert.equal((await req('vet2','POST','/appointments/vet-handoff/handoff',{vetId:'v1',note:'Already complete'})).status,409);
 await query("INSERT INTO appointments(id,pet_id,vet_id,date,time,status,reason) VALUES('legacy-vet-handoff','p8','v1',$1,'11:00','Checked-in','Legacy caller')",[date]);
 assert.equal((await req('vet','POST','/appointments/legacy-vet-handoff/handoff',{vetId:'v2',note:'Legacy request without snapshot'})).status,200);
});

test('structured prescription, automatic invoice and checkout task commit together and survive reload', async () => {
 await prepareVisit('rx-atomic');
 const dose={amount:0.5,unit:'mL',route:'by mouth',timesPerDay:2,days:7,unitsPerItem:5};
 const body={...consultation('rx-atomic'),prescription:'Give with food.',prescriptionItems:[{catalogId:'product_multivitamin',quantity:2,dose},{catalogId:'srv_nexgard',quantity:1,instructions:'Vet-confirmed product and strength; one dose as directed.'}]};
 for(const role of ['owner','assistant','admin','vet2']) assert.equal((await req(role,'POST','/consultations',body)).status,403);
 await query(`CREATE FUNCTION reject_rx_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action LIKE 'Finalized consultation note_rx-atomic%' THEN RAISE EXCEPTION 'Synthetic Rx audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_rx BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_rx_audit()`);
 assert.equal((await req('vet','POST','/consultations',body)).status,500);
 assert.equal((await query("SELECT COUNT(*)::int n FROM consultations WHERE appt_id='rx-atomic'")).rows[0].n,0);
 const unchanged=(await query("SELECT * FROM appointments WHERE id='rx-atomic'")).rows[0];
 assert.equal(unchanged.status,'In consultation');assert.deepEqual(unchanged.invoice_items,[]);
 assert.equal((await query("SELECT COUNT(*)::int n FROM checkout_tasks WHERE appointment_id='rx-atomic'")).rows[0].n,0);
 await query('DROP TRIGGER fail_rx ON audit_logs');
 const result=await req('vet','POST','/consultations',body);assert.equal(result.status,200,JSON.stringify(result));
 assert.equal(result.data.prescriptionItems.length,2);assert.match(result.data.prescription,/0.5 mL by mouth, 2 time/);
 assert.match(result.data.prescription,/Give with food/);
 assert.deepEqual(result.data.invoiceItems.map(p=>[p.catalogId,p.qty,p.price]),[['product_multivitamin',2,250],['srv_nexgard',1,550]]);
 for(let i=0;i<2;i++) {
  const state=(await req('assistant','GET','/state')).data.data;
  assert.deepEqual(state.appts.find(a=>a.id==='rx-atomic').invoiceItems,result.data.invoiceItems);
  assert.equal(state.consults.find(c=>c.apptId==='rx-atomic').prescriptionItems[0].dose.amount,0.5);
 }
 // Legacy installations can contain an older note linked to the same visit.
 await query("INSERT INTO consultations(id,pet_id,vet_id,appt_id,date,symptoms,objective,diagnosis,treatment,prescription) VALUES('legacy-rx-note','p7','v1','rx-atomic','2020-01-01','Legacy','Legacy','Legacy','Legacy','Legacy text')");
 const claim=await req('assistant','POST','/checkout-inbox/rx-atomic/claim',{});assert.equal(claim.status,200);
 assert.deepEqual(claim.data.invoiceItems,result.data.invoiceItems);assert.deepEqual(claim.data.prescriptionItems,result.data.prescriptionItems);
 const lines=claim.data.invoiceItems;
 const pay=patch=>({invoiceItems:lines,amount:1050,paymentMethod:'Cash',cashTendered:2000,claimToken:claim.data.claimToken,...patch});
 assert.equal((await req('assistant','POST','/appointments/rx-atomic/billing',pay({invoiceItems:[...lines,{...lines[1]}],amount:1600}))).status,400);
 assert.equal((await req('assistant','POST','/appointments/rx-atomic/billing',pay({invoiceItems:[{...lines[0],price:1}],amount:2}))).status,400);
 assert.equal((await req('assistant','POST','/appointments/rx-atomic/billing',pay({invoiceItems:[{...lines[1],catalogId:'srv_simparica',name:'Simparica Trio Chewable Tablet',price:600}],amount:600}))).status,400);
 const paid=await req('assistant','POST','/appointments/rx-atomic/billing',pay({}));assert.equal(paid.status,200,JSON.stringify(paid));
 assert.equal((await query("SELECT status FROM checkout_tasks WHERE appointment_id='rx-atomic'")).rows[0].status,'completed');
 assert.equal((await req('vet','POST','/consultations',body)).status,403);
 assert.equal((await query("SELECT jsonb_array_length(invoice_items)::int n FROM appointments WHERE id='rx-atomic'")).rows[0].n,2);
});

test('unprescribed medicine and diets cannot be added at checkout; retail guide products can', async () => {
 await prepareVisit('rx-retail');
 assert.equal((await req('vet','POST','/consultations',consultation('rx-retail'))).status,200);
 const catalog=(await req('owner','GET','/services/prices')).data.catalog;
 for(const id of ['srv_nexgard','product_renal_diet']) {
  const product=catalog.find(p=>p.id===id);
  const result=await req('assistant','POST','/appointments/rx-retail/billing',{amount:product.price,paymentMethod:'Cash',cashTendered:2000,invoiceItems:[{catalogId:id,name:product.name,price:product.price,qty:1}]});
  assert.equal(result.status,400);assert.match(result.data.error,/prescription/);
 }
 const product=catalog.find(p=>p.id==='product_oatmeal_shampoo');
 const paid=await req('assistant','POST','/appointments/rx-retail/billing',{amount:350,paymentMethod:'Cash',cashTendered:350,invoiceItems:[{catalogId:product.id,name:product.name,price:350,qty:1}]});
 assert.equal(paid.status,200,JSON.stringify(paid));
});

test('confirmed services, vaccine schedule and Rx persist atomically and mandatory charges cannot be removed or doubled',async()=>{
 await prepareVisit('service-atomic','In consultation',shiftDate(clinicClock().date,-2));
 await query("UPDATE pets SET vaccination_card_id='VACC-PROCESS' WHERE id='p7'");
 const administered=shiftDate(clinicClock().date,-2);
 const vaccination={vaccine:'Anti-rabies',brand:'Synthetic',batch:'TEST-ONLY',doseNo:2,doseOf:3,intervalDays:28,scheduleApproved:true,nextDue:shiftDate(administered,28)};
 const body={...consultation('service-atomic'),date:administered,backdateReason:'Care was provided during this historical visit.',performedServices:['srv_consult','srv_rabies'],vaccination,prescriptionItems:[{catalogId:'product_multivitamin',quantity:1,instructions:'Synthetic instructions'}]};
 for(const patch of [{doseNo:0},{doseNo:4},{doseOf:1},{scheduleApproved:false},{intervalDays:0},{nextDue:shiftDate(clinicClock().date,28)}]) assert.equal((await req('vet','POST','/consultations',{...body,vaccination:{...vaccination,...patch}})).status,400);
 const result=await req('vet','POST','/consultations',body);assert.equal(result.status,200,JSON.stringify(result));
 assert.deepEqual(result.data.invoiceItems.map(i=>[i.catalogId,i.qty,i.price]),[['srv_consult',1,500],['srv_rabies',1,350],['product_multivitamin',1,250]]);
 const dose=(await query("SELECT date,next_due,protocol_type,dose_no,dose_of FROM vaccinations WHERE pet_id='p7' AND batch='TEST-ONLY'")).rows[0];
 assert.equal(dose.dose_no,2);assert.equal(dose.dose_of,3);assert.equal(dose.date,administered);assert.equal(dose.next_due,vaccination.nextDue);assert.match(dose.protocol_type,/28 days/);
 const claim=await req('assistant','POST','/checkout-inbox/service-atomic/claim',{});assert.equal(claim.status,200);
 const lines=claim.data.invoiceItems;assert.deepEqual(lines,result.data.invoiceItems);
 const pay=items=>req('assistant','POST','/appointments/service-atomic/billing',{invoiceItems:items,amount:items.reduce((sum,i)=>sum+i.price*i.qty,0),paymentMethod:'Cash',cashTendered:3000,claimToken:claim.data.claimToken});
 assert.equal((await pay(lines.slice(1))).status,400);
 assert.equal((await pay([...lines,lines[0]])).status,400);
 assert.equal((await query("SELECT billing_status FROM appointments WHERE id='service-atomic'")).rows[0].billing_status,'Unpaid');
 assert.equal((await pay(lines)).status,200);
});

test('follow-up links enforce ownership and pet, survive reschedule/cancellation, prevent races and complete explicitly',async(t)=>{
 // Existing care-followup belongs to p8/o2; the signed-in owner owns o1.
 assert.equal((await req('owner','POST','/appointments',booking({petId:'p1',followUpId:'care-followup'}))).status,400);
 assert.equal((await req('owner','POST','/appointments',booking({petId:'p8',followUpId:'care-followup'}))).status,404);
 let target=shiftDate(date,1);while(holidayName(target))target=shiftDate(target,1);
 const b=booking({petId:'p8',service:'checkup',date:target,followUpId:'care-followup'});
 const results=await Promise.all([req('assistant','POST','/appointments',b),req('assistant','POST','/appointments',{...b,time:'11:00'})]);
 assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 const saved=results.find(r=>r.status===200).data.appointment;assert.equal(saved.followUpId,'care-followup');
 // A linked visit cannot be transferred to a different pet or request.
 assert.equal((await req('assistant','PUT',`/appointments/${saved.id}`,{...b,petId:'p1'})).status,400);
 assert.equal((await req('assistant','PUT',`/appointments/${saved.id}`,{...b,followUpId:'unknown'})).status,400);
 const moved=await req('assistant','PUT',`/appointments/${saved.id}`,{...b,time:'13:00'});assert.equal(moved.status,200,JSON.stringify(moved));assert.equal(moved.data.appointment.followUpId,'care-followup');
 assert.equal((await req('assistant','PATCH',`/appointments/${saved.id}/status`,{status:'Cancelled',cancelReason:'Synthetic schedule change'})).status,200);
 const rebook=await req('assistant','POST','/appointments',{...b,time:'13:00'});assert.equal(rebook.status,200,JSON.stringify(rebook));
 const id=rebook.data.appointment.id;
 assert.equal((await req('assistant','PATCH',`/appointments/${id}/status`,{status:'Scheduled'})).status,200);
 // Reach the reserved clinic day before initial arrival. Only this encounter completes the request.
 t.mock.timers.enable({apis:['Date'],now:new Date(`${target}T13:00:00+08:00`)});
 assert.equal((await req('assistant','PATCH',`/appointments/${id}/status`,{status:'Checked-in',intakeVitals:{weight:10,temp:38}})).status,200);
 assert.equal((await req('vet','PATCH',`/appointments/${id}/status`,{status:'In consultation'})).status,200);
 const note={...consultation(id),petId:'p8'};
 assert.equal((await req('vet','POST','/consultations',note)).status,200);
 const state=(await req('assistant','GET','/state')).data.data;
 assert.equal(state.appts.find(a=>a.id===id).followUpId,'care-followup');assert.equal(state.appts.find(a=>a.id===id).status,'Completed');
 assert.ok(state.consults.find(c=>c.id==='care-followup')); // survives newer routine consultation
 assert.equal((await req('assistant','POST','/appointments',{...b,time:'14:00'})).status,409);
});

test('intake snapshots reject stale parallel measurements and changed assignments',async()=>{
 const {intakeVisitSnapshot}=await import('../../src/intakeVisit.js');
 const id='intake_conflict';
 await query("INSERT INTO appointments(id,pet_id,vet_id,date,time,reason,status) VALUES($1,'p6','v1',$2,'09:00','Intake examination','Scheduled')",[id,clinicClock().date]);
 const original=(await query('SELECT * FROM appointments WHERE id=$1',[id])).rows[0];
 const body={status:'Checked-in',expectedVisit:intakeVisitSnapshot(original),intakeVitals:{weight:5.25,temp:38.6,notes:'First measured intake'}};
 const results=await Promise.all([req('assistant','PATCH',`/appointments/${id}/status`,body),req('assistant','PATCH',`/appointments/${id}/status`,{...body,intakeVitals:{weight:6,temp:38.4}})]);
 assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 const saved=results.find(r=>r.status===200).data.appointment;
 assert.equal((await query('SELECT COUNT(*)::int n FROM pet_weights WHERE pet_id=\'p6\'')).rows[0].n,1);
 const edit={status:'Checked-in',expectedVisit:intakeVisitSnapshot(saved),intakeVitals:{weight:5.5,temp:38.5,notes:'Remeasured'}};
 await query("UPDATE appointments SET vet_id='v2', reason='Veterinarian updated reason' WHERE id=$1",[id]);
 assert.equal((await req('assistant','PATCH',`/appointments/${id}/status`,edit)).status,409);
 const latest=(await query('SELECT * FROM appointments WHERE id=$1',[id])).rows[0];
 assert.equal((await req('assistant','PATCH',`/appointments/${id}/status`,{...edit,expectedVisit:intakeVisitSnapshot(latest)})).status,200);
 assert.equal(Number((await query('SELECT weight FROM pets WHERE id=\'p6\'')).rows[0].weight),5.5);
});
test('status audit failure rolls back intake, patient weight and weight history',async()=>{
 const id='intake_audit';
 await query("INSERT INTO appointments(id,pet_id,vet_id,date,time,reason,status) VALUES($1,'p7','v1',$2,'09:10','Audit rollback intake','Scheduled')",[id,clinicClock().date]);
 const before=(await query("SELECT weight FROM pets WHERE id='p7'")).rows[0];
 await query(`CREATE FUNCTION reject_intake_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action LIKE 'Updated appointment intake_audit%' THEN RAISE EXCEPTION 'synthetic intake audit failure'; END IF; RETURN NEW; END $$`);
 await query('CREATE TRIGGER reject_intake_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_intake_audit()');
 const body={status:'Checked-in',intakeVitals:{weight:7.75,temp:38.6},actorName:'Forged actor',actorRole:'admin'};
 try {
  assert.equal((await req('assistant','PATCH',`/appointments/${id}/status`,body)).status,500);
  const row=(await query('SELECT * FROM appointments WHERE id=$1',[id])).rows[0];
  assert.equal(row.status,'Scheduled');assert.equal(row.intake_vitals,null);
  assert.deepEqual((await query("SELECT weight FROM pets WHERE id='p7'")).rows[0],before);
  assert.equal((await query("SELECT COUNT(*)::int n FROM pet_weights WHERE pet_id='p7'")).rows[0].n,0);
 } finally { await query('DROP TRIGGER reject_intake_audit ON audit_logs'); }
 assert.equal((await req('assistant','PATCH',`/appointments/${id}/status`,body)).status,200);
 const audit=(await query("SELECT * FROM audit_logs WHERE action LIKE 'Updated appointment intake_audit%'")).rows;
 assert.equal(audit.length,1);assert.equal(audit[0].user_name,'Test assistant');assert.equal(audit[0].user_role,'assistant');
});

test('confirmation and consultation start reject snapshots from before rescheduling or remeasurement',async()=>{
 const {intakeVisitSnapshot}=await import('../../src/intakeVisit.js');
 const id='confirm_snapshot';
 let confirmationDate=shiftDate(clinicClock().date,25);while(holidayName(confirmationDate))confirmationDate=shiftDate(confirmationDate,1);
 await query("INSERT INTO appointments(id,pet_id,vet_id,date,time,reason,status) VALUES($1,'p8','v1',$2,'15:00','Confirmation examination','Pending Approval')",[id,clinicClock().date]);
 const before=(await query('SELECT * FROM appointments WHERE id=$1',[id])).rows[0];
 await query("UPDATE appointments SET date=$1,reason='Rescheduled examination' WHERE id=$2",[confirmationDate,id]);
 const stale=await req('assistant','PATCH',`/appointments/${id}/status`,{status:'Scheduled',expectedVisit:intakeVisitSnapshot(before)});
 assert.equal(stale.status,409);assert.equal((await query('SELECT status FROM appointments WHERE id=$1',[id])).rows[0].status,'Pending Approval');
 const fresh=(await query('SELECT * FROM appointments WHERE id=$1',[id])).rows[0];
 const results=await Promise.all([1,2].map(()=>req('assistant','PATCH',`/appointments/${id}/status`,{status:'Scheduled',expectedVisit:intakeVisitSnapshot(fresh)})));
 assert.deepEqual(results.map(r=>r.status),[200,200]);
 await query("UPDATE appointments SET status='Checked-in',intake_vitals=$1 WHERE id=$2",[JSON.stringify({weight:5,temp:38.5}),id]);
 const measured=(await query('SELECT * FROM appointments WHERE id=$1',[id])).rows[0];
 await query("UPDATE appointments SET intake_vitals=$1 WHERE id=$2",[JSON.stringify({weight:5.5,temp:38.8}),id]);
 assert.equal((await req('vet','PATCH',`/appointments/${id}/status`,{status:'In consultation',expectedVisit:intakeVisitSnapshot(measured)})).status,409);
 const remeasured=(await query('SELECT * FROM appointments WHERE id=$1',[id])).rows[0];
 assert.equal((await req('vet','PATCH',`/appointments/${id}/status`,{status:'In consultation',expectedVisit:intakeVisitSnapshot(remeasured)})).status,200);
 assert.equal((await query('SELECT COUNT(*)::int n FROM audit_logs WHERE action LIKE $1 OR action LIKE $2',[`Updated appointment ${id}%`,`Approved appointment ${id}%`])).rows[0].n,2);
});

const callBody=()=>({logOnly:true,requestId:crypto.randomUUID(),vaccinationId:'call_dose',petId:'call_pet',ownerId:'o1',dueDate:'2026-12-01',expectedPhone:'+639000000000',outcome:'No answer',notes:'Try again in the morning.'});
test('call outcomes are durable, idempotent, patient-scoped and audited as the authenticated assistant',async()=>{
 await query("INSERT INTO pets(id,owner_id,name,birth) VALUES('call_pet','o1','Call patient','2023-01-01')");
 await vaccine('call_dose','2026-12-01',{pet:'call_pet'});
 const body=callBody();
 const results=await Promise.all([1,2].map(()=>req('assistant','POST','/reminders/log-call',{...body,ownerPhone:'forged',ownerEmail:'forged@example.invalid',staffName:'Forged staff',sendEmail:true,sendSmsMsg:true})));
 assert.deepEqual(results.map(r=>r.status),[200,200]);assert.equal(results[0].data.call.id,body.requestId);assert.deepEqual(results[0].data.call,results[1].data.call);
 assert.equal(results[0].data.call.staffName,'Test assistant');assert.equal(results[0].data.call.phone,body.expectedPhone);
 assert.equal((await query('SELECT COUNT(*)::int n FROM reminder_call_logs WHERE id=$1',[body.requestId])).rows[0].n,1);
 assert.equal((await query('SELECT COUNT(*)::int n FROM audit_logs WHERE action LIKE $1',[`Recorded reminder call ${body.requestId}%`])).rows[0].n,1);
 assert.equal((await req('assistant','POST','/reminders/log-call',{...body,notes:'Different call'})).status,409);
 const history=await req('assistant','GET','/reminders/calls?petId=call_pet');assert.equal(history.status,200);assert.equal(history.data.calls[0].id,body.requestId);
 assert.equal((await req('assistant','GET','/reminders/calls?petId=p2')).data.calls.length,0);
 for(const role of ['owner','vet']) {assert.equal((await req(role,'GET','/reminders/calls?petId=call_pet')).status,403);assert.equal((await req(role,'POST','/reminders/log-call',callBody())).status,403);}
 assert.equal((await req('admin','GET','/reminders/calls?petId=call_pet')).status,200);
});
test('call saves reject invalid outcomes, mismatched owners, stale contact and superseded uncertified recalls',async()=>{
 const before=(await query('SELECT COUNT(*)::int n FROM reminder_call_logs')).rows[0].n;
 for(const change of [{outcome:''},{notes:'x'.repeat(2001)},{expectedPhone:''}]) assert.equal((await req('assistant','POST','/reminders/log-call',{...callBody(),...change})).status,400);
 for(const change of [{ownerId:'o2'},{expectedPhone:'09170000000'},{dueDate:'2026-12-02'},{vaccinationId:'missing'}]) assert.equal((await req('assistant','POST','/reminders/log-call',{...callBody(),...change})).status,409);
 await vaccine('call_suggestion','2026-12-01',{pet:'call_pet',done:false,vet:''});
 assert.equal((await req('assistant','POST','/reminders/log-call',{...callBody(),vaccinationId:'call_suggestion'})).status,409);
 await vaccine('call_new',null,{pet:'call_pet',date:'2026-10-25'});
 assert.equal((await req('assistant','POST','/reminders/log-call',callBody())).status,409);
 assert.equal((await query('SELECT COUNT(*)::int n FROM reminder_call_logs')).rows[0].n,before);
});
test('call notes and audit roll back together, and a failed save can reuse its original request',async()=>{
 await query("UPDATE vaccinations SET next_due='2026-12-03' WHERE id='call_new'");
 const body={...callBody(),vaccinationId:'call_new',dueDate:'2026-12-03'};
 await query(`CREATE FUNCTION reject_call_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action LIKE 'Recorded reminder call%' THEN RAISE EXCEPTION 'synthetic call audit failure'; END IF; RETURN NEW; END $$`);
 await query('CREATE TRIGGER reject_call_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_call_audit()');
 try {assert.equal((await req('assistant','POST','/reminders/log-call',body)).status,500);assert.equal((await query('SELECT COUNT(*)::int n FROM reminder_call_logs WHERE id=$1',[body.requestId])).rows[0].n,0);}
 finally {await query('DROP TRIGGER reject_call_audit ON audit_logs');}
 const saved=await req('assistant','POST','/reminders/log-call',body);assert.equal(saved.status,200);assert.equal(saved.data.call.notes,body.notes);
 await query("UPDATE owners SET phone='' WHERE id='o1'");
 const unavailable=await req('assistant','POST','/reminders/log-call',{...body,requestId:crypto.randomUUID(),expectedPhone:'',outcome:'Contact unavailable'});assert.equal(unavailable.status,200);assert.equal(unavailable.data.call.phone,'');
});

test('SOAP finalization checks displayed visit, acknowledges persisted clinical data, and commits once',async()=>{
 await prepareVisit('soap-safe');
 const {intakeVisitSnapshot}=await import('../../src/intakeVisit.js');
 const expectedVisit=intakeVisitSnapshot((await query("SELECT * FROM appointments WHERE id='soap-safe'")).rows[0]);
 const body={...consultation('soap-safe'),expectedVisit,weight:5.6,careStatus:'Recheck required',followUpDate:shiftDate(clinicClock().date,7),followUpReason:'Reassess healing',performedServices:['srv_consult'],vaccination:{id:'soap-safe-dose',vaccine:'Anti-rabies',brand:'Synthetic actual brand',batch:'SYNTHETIC-ACTUAL-LOT',doseNo:1,doseOf:1,intervalDays:365,scheduleApproved:true,nextDue:shiftDate(clinicClock().date,365)}};
 for(const patch of [{reason:'Old concern'},{time:'15:00'},{status:'Checked-in'},{vetId:'v2'},{intakeVitals:{weight:8,temp:39}}])assert.equal((await req('vet','POST','/consultations',{...body,expectedVisit:{...expectedVisit,...patch}})).status,409);
 assert.equal((await query("SELECT COUNT(*)::int n FROM consultations WHERE appt_id='soap-safe'")).rows[0].n,0);
 const weightsBefore=(await query("SELECT COUNT(*)::int n FROM pet_weights WHERE pet_id='p7'")).rows[0].n;
 await query(`CREATE FUNCTION reject_soap_safe_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action LIKE 'Finalized consultation note_soap-safe %' THEN RAISE EXCEPTION 'Synthetic finalization audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_soap_safe BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_soap_safe_audit()`);
 assert.equal((await req('vet','POST','/consultations',body)).status,500);
 assert.equal((await query("SELECT status FROM appointments WHERE id='soap-safe'")).rows[0].status,'In consultation');
 assert.equal((await query("SELECT COUNT(*)::int n FROM vaccinations WHERE id='soap-safe-dose'")).rows[0].n,0);
 assert.equal((await query("SELECT COUNT(*)::int n FROM pet_weights WHERE pet_id='p7'")).rows[0].n,weightsBefore);
 assert.equal((await query("SELECT COUNT(*)::int n FROM checkout_tasks WHERE appointment_id='soap-safe'")).rows[0].n,0);
 await query('DROP TRIGGER fail_soap_safe ON audit_logs');
 const results=await Promise.all([req('vet','POST','/consultations',body),req('vet','POST','/consultations',body)]);
 assert.equal(results.filter(r=>r.status===200).length,1);assert.ok(results.filter(r=>r.status!==200).every(r=>[403,409].includes(r.status)));
 const saved=results.find(r=>r.status===200).data;
 assert.equal(saved.consultation.care_status,body.careStatus);assert.equal(saved.consultation.follow_up_reason,body.followUpReason);assert.equal(saved.consultation.follow_up_date,body.followUpDate);assert.equal(saved.consultation.performed_services.length,2);assert.deepEqual(saved.consultation.prescription_items,[]);
 assert.equal(saved.appointment.status,'Completed');assert.equal(saved.appointment.pet_id,'p7');assert.equal(saved.appointment.vet_id,'v1');assert.equal(saved.vaccination.recorded_by,'Test vet');assert.equal(saved.vaccination.card_id,'VACC-PROCESS');assert.equal(saved.vaccination.batch,body.vaccination.batch);assert.deepEqual(saved.weight,{petId:'p7',date:body.date,kg:5.6,by:'Test vet'});
 const reloaded=(await req('vet','GET','/state')).data.data;
 assert.equal(reloaded.consults.find(c=>c.id===body.id).followUpReason,saved.consultation.follow_up_reason);assert.equal(reloaded.vaccs.find(v=>v.id==='soap-safe-dose').vetId,'v1');
 assert.equal((await query("SELECT COUNT(*)::int n FROM consultations WHERE appt_id='soap-safe'")).rows[0].n,1);assert.equal((await query("SELECT COUNT(*)::int n FROM audit_logs WHERE action LIKE 'Finalized consultation note_soap-safe %'")).rows[0].n,1);
 assert.equal((await query("SELECT COUNT(*)::int n FROM pet_weights WHERE pet_id='p7'")).rows[0].n,weightsBefore+1);
});

test('locked saved day gates initial arrival, rejects slot rewrites and preserves overnight care',async(t)=>{
 const {intakeVisitSnapshot}=await import('../../src/intakeVisit.js');
 t.mock.timers.enable({apis:['Date'],now:new Date('2026-10-24T16:05:00Z')});
 const id='scheduled_day_intake',today=clinicClock().date;
 assert.equal(today,'2026-10-25'); // Manila has crossed midnight; UTC has not.
 await query("INSERT INTO appointments(id,pet_id,vet_id,date,time,reason,status) VALUES($1,'p6','v1',$2,'16:30','Scheduled-day check','Pending Approval')",[id,today]);
 const saved=async()=>(await query('SELECT * FROM appointments WHERE id=$1',[id])).rows[0];
 const weights=async()=>(await query("SELECT COUNT(*)::int n FROM pet_weights WHERE pet_id='p6'")).rows[0].n;
 const audits=async()=>(await query('SELECT COUNT(*)::int n FROM audit_logs WHERE action LIKE $1',[`%${id}%`])).rows[0].n;
 const initialWeights=await weights(),initialAudits=await audits();
 for(const status of ['Pending Approval','Scheduled'])for(const offset of [-1,1]){
   await query('UPDATE appointments SET date=$1,status=$2 WHERE id=$3',[shiftDate(today,offset),status,id]);
   const original=await saved();
   for(const override of [{},{date:today,time:clinicClock().time}]){
     const response=await req('assistant','PATCH',`/appointments/${id}/status`,{status:'Checked-in',expectedVisit:intakeVisitSnapshot(original),intakeVitals:{weight:6,temp:38.6},...override});
     assert.equal(response.status,409,JSON.stringify(response));
     assert.deepEqual(await saved(),original);
     assert.equal(await weights(),initialWeights);assert.equal(await audits(),initialAudits);
   }
 }
 await query("UPDATE appointments SET date=$1,status='Scheduled' WHERE id=$2",[today,id]);
 for(const override of [{date:today},{time:'00:05'}])assert.equal((await req('assistant','PATCH',`/appointments/${id}/status`,{status:'Checked-in',intakeVitals:{weight:6,temp:38.6},...override})).status,409);
 const original=await saved();
 const arrival=await req('assistant','PATCH',`/appointments/${id}/status`,{status:'Checked-in',expectedVisit:intakeVisitSnapshot(original),intakeVitals:{weight:6,temp:38.6}});
 assert.equal(arrival.status,200);assert.equal(arrival.data.appointment.date,today);assert.equal(arrival.data.appointment.time,original.time);assert.equal(arrival.data.appointment.booking_kind,original.booking_kind);
 assert.equal(await weights(),initialWeights+1);assert.equal(await audits(),initialAudits+1);
 t.mock.timers.setTime(new Date('2026-10-25T16:05:00Z').getTime());
 const remeasure=await req('assistant','PATCH',`/appointments/${id}/status`,{status:'Checked-in',expectedVisit:intakeVisitSnapshot(await saved()),intakeVitals:{weight:6.1,temp:38.5}});
 assert.equal(remeasure.status,200);assert.equal(remeasure.data.appointment.date,today);assert.equal(remeasure.data.appointment.time,original.time);
 assert.equal((await req('vet','PATCH',`/appointments/${id}/status`,{status:'In consultation'})).status,200);
});

test('owner duplicate day bookings serialize across different vets and preserve rebooking rules', async () => {
  await query("INSERT INTO users(id,first_name,last_name,birthday,password_hash,email,role,vet_id,mobile_number) VALUES('booking_vet_two','Synthetic','Vet','1990-01-01','unused','booking-vet@example.invalid','vet','booking_v2','+639000000002')");
  await query("INSERT INTO pets(id,owner_id,name,birth) VALUES('booking_day_pet','o1','Day patient','2020-01-01'),('booking_other_pet','o1','Other patient','2020-01-01')");
  let day=shiftDate(clinicClock().date,3);while(holidayName(day))day=shiftDate(day,1);
  const body=patch=>booking({petId:'booking_day_pet',date:day,service:'vaccination',time:'08:00',...patch});
  const results=await Promise.all([
    req('owner','POST','/appointments',body()),
    req('owner','POST','/appointments',body({vetId:'booking_v2',time:'12:00'}))
  ]);
  assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
  const saved=results.find(r=>r.status===200).data.appointment;
  assert.equal((await query("SELECT count(*)::int n FROM appointments WHERE pet_id='booking_day_pet' AND date=$1",[day])).rows[0].n,1);
  const duplicate=await req('owner','POST','/appointments',body({vetId:'booking_v2',time:'15:00',service:'checkup'}));
  assert.equal(duplicate.status,409);assert.match(duplicate.data.error,/already has a visit that day/);
  assert.equal((await req('owner','PUT',`/appointments/${saved.id}`,{notes:'Updated notes only'})).status,200);
  assert.equal((await req('owner','POST','/appointments',body({petId:'booking_other_pet',vetId:'booking_v2',time:'16:00'}))).status,200);
  await query("UPDATE appointments SET status='Completed' WHERE id=$1",[saved.id]);
  assert.equal((await req('owner','POST','/appointments',body({time:'14:00'}))).status,409);
  await query("UPDATE appointments SET status='Cancelled' WHERE id=$1",[saved.id]);
  const rebooked=await req('owner','POST','/appointments',body({time:'14:00'}));assert.equal(rebooked.status,200);
  await query("UPDATE appointments SET status='No-show' WHERE id=$1",[rebooked.data.appointment.id]);
  assert.equal((await req('owner','POST','/appointments',body({time:'15:00'}))).status,200);
});

test('vaccine request saves are canonical, species checked and re-confirmed after changes',async()=>{
 await query("INSERT INTO pets(id,owner_id,name,species,birth) VALUES('request-dog','o1','Request Dog','Canine','2020-01-01'),('request-cat','o1','Request Cat','Feline','2020-01-01')");
 const nextDay=shiftDate(date,7);let vaccineDate=nextDay;while(holidayName(vaccineDate))vaccineDate=shiftDate(vaccineDate,1);
 const body=booking({petId:'request-dog',date:vaccineDate,time:'14:00',service:'vaccination',vaccineId:'rabies',reason:'Spoofed free vaccine'});
 for(const change of [{vaccineId:'feline-core'},{vaccineId:'invented'},{vaccineId:''},{service:'checkup'}]) {
  const bad=await req('owner','POST','/appointments',{...body,...change});assert.equal(bad.status,400,JSON.stringify(bad));
 }
 assert.equal((await query("SELECT COUNT(*)::int n FROM appointments WHERE pet_id='request-dog'")).rows[0].n,0);
 const saved=await req('owner','POST','/appointments',body);assert.equal(saved.status,200,JSON.stringify(saved));
 const a=saved.data.appointment;assert.equal(a.reason,'Vaccination: Anti-rabies');assert.equal(a.service,'vaccination');
 assert.equal((await query('SELECT reason FROM appointments WHERE id=$1',[a.id])).rows[0].reason,a.reason);
 assert.equal((await query("SELECT COUNT(*)::int n FROM vaccinations WHERE pet_id='request-dog' AND done=true")).rows[0].n,0);
 await query("UPDATE appointments SET status='Scheduled' WHERE id=$1",[a.id]);
 const changed=await req('owner','PUT',`/appointments/${a.id}`,{...body,vaccineId:'canine-core'});
 assert.equal(changed.status,200,JSON.stringify(changed));assert.equal(changed.data.appointment.status,'Pending Approval');assert.equal(changed.data.appointment.reason,'Vaccination: 5-in-1');
 const log=(await query("SELECT action FROM audit_logs WHERE action LIKE $1 ORDER BY created_at DESC",[`%${a.id}%`])).rows;assert.ok(log.some(l=>l.action.includes('Vaccination: 5-in-1')));
 const cat=await req('assistant','POST','/appointments',{...body,petId:'request-cat',bookingKind:'walk-in',vaccineId:'canine-core'});assert.equal(cat.status,400);
 const arrival=await req('assistant','POST','/appointments',{...body,petId:'request-cat',bookingKind:'walk-in',vaccineId:'feline-core'});assert.equal(arrival.status,200,JSON.stringify(arrival));assert.equal(arrival.data.appointment.reason,'Vaccination: Feline 4-in-1');assert.equal(arrival.data.appointment.bookingKind,'walk-in');
});

test('request retries, rejection reasons, slot release and reapproval preserve separate payment state',async()=>{
 let day=shiftDate(date,30);while(holidayName(day))day=shiftDate(day,1);
 const payload=booking({id:'request-retry',petId:'p1',date:day,time:'08:00',service:'checkup',reason:'Check-up'});
 const both=await Promise.all([req('owner','POST','/appointments',payload),req('owner','POST','/appointments',payload)]);
 assert.deepEqual(both.map(r=>r.status),[200,200]);
 assert.equal(both[0].data.appointment.id,both[1].data.appointment.id);
 assert.equal(both[0].data.appointment.status,'Pending Approval');
 assert.equal(both[0].data.appointment.billingStatus,'Unbilled');
 assert.equal((await query("SELECT COUNT(*)::int n FROM appointments WHERE id='request-retry'")).rows[0].n,1);
 assert.equal((await req('owner','POST','/appointments',{...payload,time:'09:00'})).status,409);
 assert.equal((await req('assistant','POST','/appointments',{...payload,id:'conflict-request',petId:'p2'})).status,409);
 const status=body=>req('assistant','PATCH','/appointments/request-retry/status',body);
 assert.equal((await status({status:'Checked-in',intakeVitals:{weight:5,temp:38.5}})).status,409);
 assert.equal((await req('owner','PATCH','/appointments/request-retry/status',{status:'Rejected',cancelReason:'Forged decision'})).status,409);
 assert.equal((await status({status:'Rejected',cancelReason:' '})).status,409);
 const rejected=await status({status:'Rejected',cancelReason:'Veterinarian unavailable; please choose another date'});
 assert.equal(rejected.status,200);assert.equal(rejected.data.appointment.cancel_reason,'Veterinarian unavailable; please choose another date');
 assert.equal(rejected.data.appointment.billing_status,'Unbilled');
 const visible=(await req('owner','GET','/state')).data.data.appts.find(a=>a.id==='request-retry');
 assert.equal(visible.status,'Rejected');assert.equal(visible.cancelReason,rejected.data.appointment.cancel_reason);
 const replacement=await req('owner','POST','/appointments',{...payload,id:'request-replacement'});
 assert.equal(replacement.status,200); // rejection releases both pet-day and doctor slot
 assert.equal((await req('assistant','PATCH','/appointments/request-replacement/status',{status:'Scheduled'})).status,200);
 const moved=await req('owner','PUT','/appointments/request-replacement',{...payload,id:'request-replacement',time:'10:00'});
 assert.equal(moved.status,200);assert.equal(moved.data.appointment.status,'Pending Approval');assert.equal(moved.data.appointment.billingStatus,'Unbilled');
 assert.equal((await req('owner','PATCH','/appointments/request-replacement/status',{status:'Cancelled',cancelReason:'Owner schedule changed'})).status,200);
});

test('legacy status migration preserves meaning and is repeatable',async()=>{
 const legacy='legacy_'+crypto.randomUUID().replaceAll('-','');
 const c=await admin.connect();
 try {
  await c.query('BEGIN');await c.query('CREATE SCHEMA '+legacy);await c.query('SET LOCAL search_path TO '+legacy);
  await c.query("CREATE TABLE appointments(id TEXT PRIMARY KEY,status TEXT DEFAULT 'Scheduled' CONSTRAINT appointments_status_check CHECK(status IN ('Scheduled','Confirmed','Completed')),billing_status TEXT DEFAULT 'Unbilled',invoice_items JSONB)");
  await c.query("INSERT INTO appointments VALUES('request','Scheduled','Unbilled',NULL),('approved','Confirmed','Unpaid',NULL),('paid','Completed','Paid','[]')");
  const sql=readFileSync(new URL('../database/appointment-status.sql',import.meta.url),'utf8').replace('BEGIN;','').replace('COMMIT;','');
  await c.query(sql);await c.query(sql);
  assert.deepEqual((await c.query('SELECT id,status,billing_status FROM appointments ORDER BY id')).rows,[
   {id:'approved',status:'Scheduled',billing_status:'Unpaid'},{id:'paid',status:'Completed',billing_status:'Paid'},{id:'request',status:'Pending Approval',billing_status:'Unbilled'}]);
 } finally {await c.query('ROLLBACK');c.release();}
});

test('assistant rescheduling changes date/time only, preserves legacy duration and retries without duplicate audit',async()=>{
 let day=shiftDate(date,40);while(holidayName(day))day=shiftDate(day,1);
 await query("INSERT INTO appointments(id,pet_id,vet_id,date,time,reason,notes,service,duration_minutes,amount,status,approved_at,approved_by,approved_by_user_id) VALUES('reschedule-fixed','p7','u_vet',$1,'09:00','Original legacy symptoms','Saved owner notes',NULL,30,875,'Scheduled',NOW(),'Test assistant','u_assistant')",[day]);
 const before=(await query("SELECT * FROM appointments WHERE id='reschedule-fixed'")).rows[0];
 const expectedVisit={id:before.id,petId:before.pet_id,vetId:before.vet_id,date:before.date,time:before.time,reason:before.reason,status:before.status,intakeVitals:before.intake_vitals || null};
 for(const patch of [{petId:'p6'},{vetId:'missing'},{service:'grooming'},{reason:'Different reason'},{notes:'Different note'},{amount:20},{durationMinutes:120},{bookingKind:'walk-in'},{followUpId:'changed'},{vaccineId:'vet-review'},{reasonChoice:'Other',otherReason:'New symptom'}]){
   const response=await req('assistant','PUT','/appointments/reschedule-fixed',{date:day,time:'10:00',expectedVisit,...patch});
   assert.equal(response.status,400,JSON.stringify({patch,response}));
   assert.deepEqual((await query("SELECT * FROM appointments WHERE id='reschedule-fixed'")).rows[0],before);
 }
 const open=await req('assistant','GET',`/appointments/availability?vetId=u_vet&date=${day}&service=grooming&excludeId=reschedule-fixed`);
 assert.equal(open.status,200);assert.ok(open.data.slots.includes('16:30'),'persisted 30-minute duration fits');
 await query("CREATE FUNCTION fail_reschedule_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action LIKE 'Rescheduled appointment reschedule-fixed %' THEN RAISE EXCEPTION 'synthetic audit rejection'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_reschedule_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION fail_reschedule_audit()");
 assert.equal((await req('assistant','PUT','/appointments/reschedule-fixed',{date:day,time:'14:00',expectedVisit})).status,500);
 assert.deepEqual((await query("SELECT * FROM appointments WHERE id='reschedule-fixed'")).rows[0],before,'failed audit rolls back schedule and approval metadata');
 await query('DROP TRIGGER fail_reschedule_audit ON audit_logs; DROP FUNCTION fail_reschedule_audit()');
 const results=await Promise.all([req('assistant','PUT','/appointments/reschedule-fixed',{date:day,time:'16:30',expectedVisit}),req('assistant','PUT','/appointments/reschedule-fixed',{date:day,time:'16:30',expectedVisit})]);
 assert.deepEqual(results.map(r=>r.status),[200,200]);
 const saved=(await query("SELECT * FROM appointments WHERE id='reschedule-fixed'")).rows[0];
 for(const key of Object.keys(before).filter(k=>!['time','status','approved_at','approved_by','approved_by_user_id'].includes(k)))assert.deepEqual(saved[key],before[key],key);
 assert.equal(saved.status,'Pending Approval');assert.equal(saved.approved_at,null);
 assert.equal((await query("SELECT COUNT(*)::int n FROM audit_logs WHERE action LIKE 'Rescheduled appointment reschedule-fixed %'")).rows[0].n,1);
 assert.equal((await req('assistant','PUT','/appointments/reschedule-fixed',{date:day,time:'15:00',expectedVisit})).status,409);
 await query("UPDATE appointments SET status='Scheduled',approved_by='Reapproved',approved_at=NOW() WHERE id='reschedule-fixed'");
 const retry=await req('assistant','PUT','/appointments/reschedule-fixed',{date:day,time:'16:30',expectedVisit});
 assert.equal(retry.status,200);assert.equal(retry.data.appointment.status,'Scheduled');assert.equal(retry.data.appointment.approvedBy,'Reapproved');
 // Canonical IDs must see existing reservations stored under the veterinarian account ID.
 assert.equal((await req('owner','POST','/appointments',booking({id:'alias-overlap',date:day,petId:'p6',time:'16:00',service:'checkup'}))).status,409);
});

test('reschedule validation rejects invalid dates, pet/day conflicts and duration overlap atomically',async()=>{
 let day=shiftDate(date,45);while(holidayName(day))day=shiftDate(day,1);
 await query("INSERT INTO appointments(id,pet_id,vet_id,date,time,reason,service,duration_minutes,status) VALUES('reschedule-validation','p6','v1',$1,'09:00','Saved long visit','surgery',120,'Scheduled'),('reschedule-busy','p5','v1',$1,'13:00','Existing visit','checkup',60,'Scheduled')",[day]);
 const before=(await query("SELECT * FROM appointments WHERE id='reschedule-validation'")).rows[0];
 for(const patch of [{date:'2026-02-30',time:'09:00'},{date:shiftDate(clinicClock().date,-1),time:'09:00'},{date:shiftDate(clinicClock().date,91),time:'09:00'},{date:day,time:'16:00'},{date:day,time:'12:00'}]){
  const response=await req('assistant','PUT','/appointments/reschedule-validation',patch);assert.ok([400,409].includes(response.status),JSON.stringify(response));
  assert.deepEqual((await query("SELECT * FROM appointments WHERE id='reschedule-validation'")).rows[0],before);
 }
 const next=shiftDate(day,1);
 await query("INSERT INTO appointments(id,pet_id,vet_id,date,time,reason,status,duration_minutes) VALUES('reschedule-pet-day','p6','v1',$1,'08:00','Other visit','Scheduled',30)",[next]);
 assert.equal((await req('assistant','PUT','/appointments/reschedule-validation',{date:next,time:'11:00'})).status,409);
});

test('structured booking reasons reject invalid choices and blank/numeric Other and preserve valid symptoms',async()=>{
 let day=shiftDate(date,50);while(holidayName(day))day=shiftDate(day,1);
 for(const patch of [{service:'invalid-service',reasonChoice:'Other',otherReason:'Skin concern'},{reasonChoice:'bogus'},{reasonChoice:'Other',otherReason:{}},{reasonChoice:'Other',otherReason:''},{reasonChoice:'Other',otherReason:'123'},{reasonChoice:'Other',otherReason:'x'.repeat(201)}]){
  const response=await req('owner','POST','/appointments',booking({petId:'p7',date:day,service:'checkup',...patch}));assert.equal(response.status,400,JSON.stringify(response));
 }
 const saved=await req('owner','POST','/appointments',booking({petId:'p7',date:day,service:'checkup',reason:'ignored untrusted text',reasonChoice:'Other',otherReason:'  Makati ang balat  '}));
 assert.equal(saved.status,200,JSON.stringify(saved));assert.equal(saved.data.appointment.reason,'Makati ang balat');
});
