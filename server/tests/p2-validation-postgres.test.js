// Opt-in isolated-schema integration tests. Never use production credentials.
import { test, after, mock } from 'node:test';
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
mock.module('../services.js',{exports:{sendMail:async()=>({ok:true,via:'synthetic'}),sendSms:async()=>({ok:true,via:'synthetic'}),serverOutbox:[]}});
process.env.PSGC_API_URL='http://127.0.0.1:1';
const {query,pool}=await import('../db.js');
await query(readFileSync(new URL('../database/schema.sql',import.meta.url),'utf8'));
await query(readFileSync(new URL('../database/appointment-status.sql',import.meta.url),'utf8'));
const {ensureSchedulingSchema}=await import('../database/schedulingSchema.js');
await ensureSchedulingSchema();
const {clinicClock,shiftDate}=await import('../scheduling.js');
const {sha256}=await import('../security.js');
const {clinicRouter}=await import('../routes/clinic.js');
const {authRouter}=await import('../routes/auth.js');
const app=express();app.use(express.json());app.use(cookieParser());app.use('/api/auth',authRouter);app.use('/api',clinicRouter);
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

const tomorrow=shiftDate(clinicClock().date,1);
const makeVisit=async(id,pet,status='Pending Approval',date=clinicClock().date)=>query("INSERT INTO appointments(id,pet_id,vet_id,date,time,reason,status) VALUES($1,$2,'v1',$3,'16:30','Synthetic validation audit',$4)",[id,pet,date,status]);
const signup = {first_name:'Synthetic',last_name:'Owner',middle_initial:'A.',birthday:'01/01/1990',country:'PH',state:'Metro Manila',city:'Quezon City',zip_code:'1100',house_street:'12 Synthetic St',mobile:'09171234567',email:'p2.synthetic@gmail.com',password:'Synthetic123!',confirm_password:'Synthetic123!'};
test('signup rejects malformed form fields individually before creating any account records',async()=>{
 const patches=[{first_name:'123'},{last_name:'!'},{middle_initial:'AB'},{middle_initial:42},{birthday:'2099-01-01'},{birthday:'02/30/1990'},{birthday:shiftDate(clinicClock().date,-365)},{email:'not-email'},{email:'x@private.invalid'},{mobile:'abc'},{password:{bad:true}},{confirm_password:'Mismatch'},{house_street:''},{country:'Invented'},{state:'Wrong'},{city:'Wrong'},{zip_code:'9999'}];
 for(const patch of patches){const result=await req(null,'POST','/auth/register',{...signup,...patch});assert.equal(result.status,400,JSON.stringify({patch,result}));assert.ok(Object.keys(result.data.errors).length);}
 assert.equal((await query("SELECT COUNT(*)::int n FROM users WHERE email=$1",[signup.email])).rows[0].n,0);
});
test('signup commits canonical owner, address and verification together and rolls back a failed owner insert',async()=>{
 await query(`CREATE FUNCTION reject_p2_owner() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.email='p2.synthetic@gmail.com' THEN RAISE EXCEPTION 'synthetic failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_p2_owner BEFORE INSERT ON owners FOR EACH ROW EXECUTE FUNCTION reject_p2_owner()`);
 try {const result=await req(null,'POST','/auth/register',signup);assert.equal(result.status,500);assert.doesNotMatch(result.data.error,/synthetic failure/);
 assert.equal((await query("SELECT COUNT(*)::int n FROM users WHERE email=$1",[signup.email])).rows[0].n,0);
 assert.equal((await query("SELECT COUNT(*)::int n FROM addresses a LEFT JOIN users u ON u.id=a.user_id WHERE u.id IS NULL")).rows[0].n,0);
 } finally {await query('DROP TRIGGER reject_p2_owner ON owners');}
 const result=await req(null,'POST','/auth/register',signup);assert.equal(result.status,200,JSON.stringify(result));
 const user=(await query('SELECT * FROM users WHERE email=$1',[signup.email])).rows[0];assert.equal(user.birthday,'1990-01-01');assert.equal(user.mobile_number,'+639171234567');assert.equal(user.middle_initial,'A');assert.equal(user.email_verified_at,null);assert.equal(user.mobile_verified,false);
 assert.equal((await query('SELECT * FROM owners WHERE user_id=$1',[user.id])).rows.length,1);assert.equal((await query('SELECT * FROM addresses WHERE user_id=$1',[user.id])).rows.length,1);assert.equal((await query('SELECT * FROM verification_tokens WHERE user_id=$1',[user.id])).rows.length,1);
 assert.equal((await req(null,'POST','/auth/register',signup)).status,400);
});
test('intake rejects malformed triage/types/reason and saves only canonical measured metadata',async()=>{
 await makeVisit('p2-intake','p3');
 await query("UPDATE appointments SET status='Scheduled' WHERE id='p2-intake'");
 const vitals={weight:5,temp:38.5};
 for(const patch of [{triageLevel:'Emergancy'},{fasted:'no'},{notes:'x'.repeat(2001)},{notes:[]},{triageLevel:null}]) assert.equal((await req('assistant','PATCH','/appointments/p2-intake/status',{status:'Checked-in',intakeVitals:{...vitals,...patch}})).status,409);
 for(const reason of ['', ' ', null, {}, 'x'.repeat(501)])assert.equal((await req('assistant','PATCH','/appointments/p2-intake/status',{status:'Checked-in',intakeVitals:vitals,reason})).status,409);
 assert.equal((await query("SELECT status FROM appointments WHERE id='p2-intake'")).rows[0].status,'Scheduled');
 const saved=await req('assistant','PATCH','/appointments/p2-intake/status',{status:'Checked-in',intakeVitals:{...vitals,triageLevel:'Emergency',fasted:true,notes:' Measured ',checkedInBy:'Forged',checkedInAt:'invalid',tempAnalysis:{label:'Invented'},arbitrary:'untrusted'}});
 assert.equal(saved.status,200);const v=saved.data.appointment.intake_vitals;assert.equal(v.triageLevel,'Emergency');assert.equal(v.fasted,true);assert.equal(v.notes,'Measured');assert.equal(v.checkedInBy,'Test assistant');assert.match(v.checkedInAt,/^\d{2}:\d{2}$/);assert.notEqual(v.tempAnalysis.label,'Invented');assert.equal(v.arbitrary,undefined);
});
test('future no-shows fail and cancellation requires bounded reasons for owner and reception',async()=>{
 await makeVisit('p2-future','p2','Scheduled',tomorrow);
 assert.equal((await req('assistant','PATCH','/appointments/p2-future/status',{status:'No-show'})).status,409);
 for(const role of ['owner','assistant'])for(const cancelReason of [undefined,' ',42,'x'.repeat(501)])assert.equal((await req(role,'PATCH','/appointments/p2-future/status',{status:'Cancelled',cancelReason})).status,409);
 const result=await req('owner','PATCH','/appointments/p2-future/status',{status:'Cancelled',cancelReason:' Schedule conflict '});assert.equal(result.status,200);assert.equal(result.data.appointment.cancel_reason,'Schedule conflict');
 await makeVisit('p2-missed','p2','Scheduled',shiftDate(clinicClock().date,-1));assert.equal((await req('assistant','PATCH','/appointments/p2-missed/status',{status:'No-show'})).status,200);
});
test('clinical dates reject pre-birth notes and overdue followups without completing care; historical overnight note remains valid',async()=>{
 await makeVisit('p2-note','p4','In consultation',shiftDate(clinicClock().date,-1));
 const note={id:'p2-note-saved',apptId:'p2-note',petId:'p4',date:clinicClock().date,symptoms:'History',objective:'Exam',diagnosis:'Assessment',treatment:'Plan',prescription:'',performedServices:['srv_consult']};
 for(const patch of [{date:'2010-01-01'},{careStatus:'Recheck required',followUpDate:shiftDate(clinicClock().date,-1),followUpReason:'Review'}])assert.equal((await req('vet','POST','/consultations',{...note,...patch})).status,400);
 assert.equal((await query("SELECT status FROM appointments WHERE id='p2-note'")).rows[0].status,'In consultation');assert.equal((await query("SELECT COUNT(*)::int n FROM consultations WHERE appt_id='p2-note'")).rows[0].n,0);
 const saved=await req('vet','POST','/consultations',{...note,date:shiftDate(clinicClock().date,-1),backdateReason:'Care was provided during the overnight visit.',careStatus:'Recheck required',followUpDate:clinicClock().date,followUpReason:'Review today'});assert.equal(saved.status,200,JSON.stringify(saved));assert.equal(saved.data.appointment.status,'Completed');
});

test('consultation backdating is explicit and cannot precede its actual linked encounter',async()=>{
 const yesterday=shiftDate(clinicClock().date,-1);
 await makeVisit('p2-backdate','p3','In consultation',yesterday);
 const note={id:'p2-backdate-saved',apptId:'p2-backdate',petId:'p3',date:yesterday,symptoms:'History',objective:'Exam',diagnosis:'Assessment',treatment:'Plan',prescription:'',performedServices:['srv_consult']};
 for(const patch of [{},{backdateReason:'12345'},{backdateReason:'x'.repeat(501)},{date:shiftDate(yesterday,-1),backdateReason:'Historical visit'}])assert.equal((await req('vet','POST','/consultations',{...note,...patch})).status,400);
 assert.equal((await query("SELECT status FROM appointments WHERE id='p2-backdate'")).rows[0].status,'In consultation');
 assert.equal((await query("SELECT count(*)::int n FROM consultations WHERE appt_id='p2-backdate'")).rows[0].n,0);
 const reason='Care actually provided during this overnight visit.';
 assert.equal((await req('vet','POST','/consultations',{...note,backdateReason:reason})).status,200);
 assert.equal((await query("SELECT backdate_reason FROM consultations WHERE id='p2-backdate-saved'")).rows[0].backdate_reason,reason);
});
