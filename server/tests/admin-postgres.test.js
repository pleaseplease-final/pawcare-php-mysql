import {test,after,mock} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import pg from 'pg';
import express from 'express';
import cookieParser from 'cookie-parser';
if(!process.env.TEST_DATABASE_URL)throw Error('Set TEST_DATABASE_URL to a disposable local database');
const url=new URL(process.env.TEST_DATABASE_URL);
if(!['localhost','127.0.0.1'].includes(url.hostname))throw Error('Local database required');
const admin=new pg.Pool({connectionString:url.href}),schema=`test_admin_${crypto.randomUUID().replaceAll('-','')}`;
await admin.query(`CREATE SCHEMA ${schema}`);url.searchParams.set('options',`-c search_path=${schema},public`);process.env.DATABASE_URL=url.href;
const {query,pool}=await import('../db.js');await query(readFileSync(new URL('../database/schema.sql',import.meta.url),'utf8'));
await query(readFileSync(new URL('../database/appointment-status.sql',import.meta.url),'utf8'));
let messages=[];
mock.module('../services.js',{namedExports: {sendMail:async(...args)=>{messages.push(args);return{ok:true,via:'synthetic'};},sendSms:async(...args)=>{messages.push(args);return{ok:true,via:'synthetic'};},serverOutbox:[]}});
const {sha256,hashPassword}=await import('../security.js');const {authRouter}=await import('../routes/auth.js');const{clinicRouter}=await import('../routes/clinic.js');
const app=express();app.use(express.json());app.use(cookieParser());app.use('/api/auth',authRouter);app.use('/api',clinicRouter);
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
after(async()=>{await new Promise(r=>server.close(r));await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();});
const call=async(token,method,path,body)=>{const res=await fetch(`http://127.0.0.1:${server.address().port}/api${path}`,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});return{status:res.status,data:await res.json()};};
const password='SyntheticPass123!';const hash=await hashPassword(password);
for(const role of ['admin','vet','assistant','owner']){
 await query(`INSERT INTO users(id,first_name,last_name,birthday,password_hash,email,role,vet_id,mobile_number,email_verified_at,mobile_verified) VALUES($1,'Synthetic',$1,'1990-01-01',$2,$3,$1,$4,'+639170000001',NOW(),true)`,[role,hash,`${role}@example.invalid`,role==='vet'?'v1':null]);
 await query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,NOW()+INTERVAL '1 day')",[sha256(role),role]);
}
const change=(id,action,revision,reason='Synthetic governance reason')=>call('admin','POST',`/admin/staff/${id}/access`,{action,revision,reason,actorRole:'owner'});
test('administrator staff list is live, schema-local and excludes all credentials',async()=>{
 const result=await call('admin','GET','/admin/staff');assert.equal(result.status,200);assert.equal(result.data.accountCount,4);assert.equal(result.data.staff.length,2);
 assert.equal(result.data.staff.find(u=>u.id==='vet').vetId,'v1');
 assert.doesNotMatch(JSON.stringify(result.data),/password_hash|token_hash|SyntheticPass/);
 assert.equal((await query("SELECT n.nspname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.oid='users'::regclass")).rows[0].nspname,schema);
});
test('anonymous and other roles cannot read or mutate governance, even with spoofed roles',async()=>{
 for(const token of [null,'owner','vet','assistant'])for(const [method,path,body]of [['GET','/admin/staff'],['GET','/admin/audit'],['POST','/admin/staff/vet/access',{action:'deactivate',revision:0,reason:'Spoofed',actorRole:'admin'}]])assert.equal((await call(token,method,path,body)).status,token?403:401);
 for(const id of ['owner','admin'])assert.equal((await change(id,'deactivate',0)).status,403);
});
test('staff email availability checks all roles privately and preserves invitation replacement',async()=>{
 const path=email=>'/admin/staff/email-availability?email='+encodeURIComponent(email);
 for(const token of [null,'owner','vet','assistant'])assert.equal((await call(token,'GET',path('admin@example.invalid'))).status,token?403:401);
 for(const email of [' ADMIN@EXAMPLE.INVALID ','owner@example.invalid','vet@example.invalid','assistant@example.invalid']){
  const result=await call('admin','GET',path(email));assert.equal(result.status,200);assert.equal(result.data.available,false);assert.deepEqual(Object.keys(result.data).sort(),['available','pendingInvitation']);
 }
 assert.equal((await call('admin','GET',path('invalid'))).status,400);
 assert.equal((await call('admin','GET',path('unused@example.invalid'))).data.available,true);
 const before=messages.length;
 assert.equal((await call('admin','POST','/auth/staff/invite',{role:'assistant',name:'Duplicate Account',email:'OWNER@example.invalid'})).status,400);
 assert.equal(messages.length,before);
 await query("INSERT INTO staff_invitations(email,name,role,token_hash,invited_by,expired_at) VALUES('pending@example.invalid','Pending Staff','assistant','synthetic-pending','admin',NOW()+INTERVAL '1 day')");
 const pending=await call('admin','GET',path('pending@example.invalid'));assert.deepEqual(pending.data,{available:true,pendingInvitation:true});
 const replaced=await call('admin','POST','/auth/staff/invite',{role:'assistant',name:'Pending Staff',email:'pending@example.invalid'});assert.equal(replaced.status,200);assert.equal(replaced.data.status,'ok');
 assert.equal(Number((await query("SELECT COUNT(*) FROM staff_invitations WHERE email='pending@example.invalid'")).rows[0].count),1);
});
test('deactivation revokes sessions and login, retains records, and removes doctor availability',async()=>{
 await query("INSERT INTO owners(id,name,email,phone,address) VALUES('client','Synthetic Owner','owner@example.invalid','+639170000001','Synthetic')");
 await query("INSERT INTO pets(id,owner_id,name,birth) VALUES('pet','client','Synthetic Luna','2020-01-01')");
 await query("INSERT INTO appointments(id,pet_id,vet_id,date,time,status,reason) VALUES('historic','pet','v1','2026-10-23','10:00','Completed','Synthetic history')");
 assert.equal((await change('vet','deactivate',0)).status,200);
 assert.equal((await call('vet','GET','/auth/me')).status,401);
 assert.equal((await call(null,'POST','/auth/login',{email:'vet@example.invalid',password})).status,403);
 await query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,'vet',NOW()+INTERVAL '1 day')",[sha256('late-session')]);
 assert.equal((await call('late-session','GET','/auth/me')).status,403);
 const state=await call('admin','GET','/state');assert.equal(state.status,200);assert.equal(state.data.data.vets.length,0);assert.equal(state.data.data.appts.length,1);
 assert.equal((await call('assistant','GET','/appointments/availability?vetId=v1&date=2026-10-25&service=checkup')).status,400);
 assert.equal((await change('vet','reactivate',1)).status,200);
 assert.equal((await call('late-session','GET','/auth/me')).status,401);
 assert.equal((await call(null,'POST','/auth/login',{email:'vet@example.invalid',password})).status,200);
});
test('access reasons and versions are required; stale concurrent actions cannot overwrite decisions',async()=>{
 assert.equal((await change('assistant','deactivate',0,'')).status,400);
 assert.equal((await change('assistant','deactivate',undefined)).status,409);
 const results=await Promise.all([change('assistant','deactivate',0),change('assistant','deactivate',0)]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 assert.equal((await change('assistant','unlock',1)).status,409);
 assert.equal((await change('assistant','reactivate',1)).status,200);
 await query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,'assistant',NOW()+INTERVAL '1 day')",[sha256('assistant')]);
});
test('unlock clears lockout and revokes sessions; failed audit rolls back access and revocation',async()=>{
 await query("UPDATE users SET is_locked=true,failed_login_attempts=3,lockout_until=NOW()+INTERVAL '2 minutes' WHERE id='assistant'");
 assert.equal((await change('assistant','unlock',2)).status,200);
 let row=(await query("SELECT * FROM users WHERE id='assistant'")).rows[0];assert.equal(row.is_locked,false);assert.equal(row.failed_login_attempts,0);assert.equal(row.lockout_until,null);
 await query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,'assistant',NOW()+INTERVAL '1 day')",[sha256('assistant')]);
 await query(`CREATE FUNCTION reject_access_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action LIKE 'Staff access%' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$`);await query('CREATE TRIGGER reject_access_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_access_audit()');
 try{assert.equal((await change('assistant','deactivate',3)).status,500);row=(await query("SELECT * FROM users WHERE id='assistant'")).rows[0];assert.equal(row.is_active,true);assert.equal(row.access_revision,3);assert.equal((await call('assistant','GET','/auth/me')).status,200);}finally{await query('DROP TRIGGER reject_access_audit ON audit_logs');}
 const logs=(await query("SELECT * FROM audit_logs WHERE action LIKE 'Staff access%'")).rows;assert.ok(logs.every(l=>l.user_role==='admin'&&l.user_name==='Synthetic admin'));assert.match(logs.at(-1).action,/Sessions revoked/);
});
test('invitations validate roles, preserve the admin session and can be revoked without exposing tokens',async()=>{
 for(const body of [{role:'admin',name:'New Staff',email:'new@example.invalid'},{role:'vet',name:'',email:'new@example.invalid'},{role:'vet',name:'New Staff',email:'invalid'}])assert.equal((await call('admin','POST','/auth/staff/invite',body)).status,400);
 const invited=await call('admin','POST','/auth/staff/invite',{role:'vet',name:'New Staff',email:'new@example.invalid'});assert.equal(invited.status,200);assert.equal(invited.data.token,undefined);assert.equal(invited.data.delivery,'accepted');assert.match(invited.data.inviteLink,/\?invite=/);assert.equal((await call('admin','GET','/auth/me')).status,200);
 const list=await call('admin','GET','/admin/staff');const invitation=list.data.invitations.find(i=>i.email==='new@example.invalid');assert.equal(invitation.status,'Pending');assert.doesNotMatch(JSON.stringify(invitation),/token/);
 assert.equal((await call('admin','POST',`/admin/invitations/${invitation.id}/revoke`,{reason:'Synthetic replacement'})).status,200);
 const token=new URL(invited.data.inviteLink).searchParams.get('invite');assert.equal((await call(null,'GET',`/auth/staff/invite-info?token=${token}`)).status,404);
 assert.equal((await call(null,'POST','/auth/staff/accept-invite',{token,firstName:'New',lastName:'Staff',birthday:'1990-01-01',mobileNumber:'+639170000001',password,houseStreet:'12 Test Street',city:'Makati',state:'Metro Manila',zipCode:'1200'})).status,409);
});
test('staff setup validates identity, consumes invitations once, and never exposes the OTP',async()=>{
 const invited=await call('admin','POST','/auth/staff/invite',{role:'assistant',name:'Accepted Staff',email:'accepted@example.invalid'});const token=new URL(invited.data.inviteLink).searchParams.get('invite');
 const body={token,firstName:'Accepted',lastName:'Staff',birthday:'1990-01-01',mobileNumber:'+639170000001',password,houseStreet:'12 Test Street',city:'Makati',state:'Metro Manila',zipCode:'1200'};
 assert.equal((await call(null,'POST','/auth/staff/accept-invite',{...body,birthday:'2025-02-30'})).status,400);
 const results=await Promise.all([call(null,'POST','/auth/staff/accept-invite',body),call(null,'POST','/auth/staff/accept-invite',body)]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 const good=results.find(r=>r.status===200);assert.equal(good.data.needsOtp,true);assert.equal(good.data.devCode,undefined);assert.equal((await call(good.data.token,'GET','/auth/me')).status,403);
 assert.equal((await query("SELECT COUNT(*)::int n FROM users WHERE email='accepted@example.invalid'")).rows[0].n,1);
});
test('invitation acceptance rechecks expiry after waiting for a revocation lock',async()=>{
 const invited=await call('admin','POST','/auth/staff/invite',{role:'vet',name:'Revoked Race',email:'race@example.invalid'});
 const token=new URL(invited.data.inviteLink).searchParams.get('invite');
 const blocker=await pool.connect();let accepting;
 try{
  await blocker.query('BEGIN');
  await blocker.query('UPDATE staff_invitations SET expired_at=clock_timestamp() WHERE token_hash=$1',[sha256(token)]);
  accepting=call(null,'POST','/auth/staff/accept-invite',{token,firstName:'Revoked',lastName:'Race',birthday:'1990-01-01',mobileNumber:'+639170000001',password,houseStreet:'12 Test Street',city:'Makati',state:'Metro Manila',zipCode:'1200'});
  let waiting=false;
  for(let n=0;n<100;n++){
   waiting=(await query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE 'SELECT * FROM staff_invitations WHERE token_hash=$1 FOR UPDATE%') AS waiting")).rows[0].waiting;
   if(waiting)break;
   await new Promise(r=>setTimeout(r,25));
  }
  assert.equal(waiting,true,'acceptance must reach the locked invitation');
  await blocker.query('COMMIT');
  assert.equal((await accepting).status,409);
  assert.equal((await query("SELECT COUNT(*)::int n FROM users WHERE email='race@example.invalid'")).rows[0].n,0);
 }finally{await blocker.query('ROLLBACK');blocker.release();if(accepting)await accepting;}
});
test('verified sign-ins are audited atomically with their session',async()=>{
 const before=(await query("SELECT COUNT(*)::int n FROM sessions WHERE user_id='vet'")).rows[0].n;
 await query("CREATE FUNCTION reject_signin_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action LIKE 'Signed in%' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$");
 await query('CREATE TRIGGER reject_signin_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_signin_audit()');
 try{
  assert.equal((await call(null,'POST','/auth/login',{email:'vet@example.invalid',password})).status,500);
  assert.equal((await query("SELECT COUNT(*)::int n FROM sessions WHERE user_id='vet'")).rows[0].n,before);
 }finally{await query('DROP TRIGGER reject_signin_audit ON audit_logs');}
 const login=await call(null,'POST','/auth/login',{email:'vet@example.invalid',password});assert.equal(login.status,200);
 const audit=(await query("SELECT * FROM audit_logs WHERE action='Signed in (vet).' ORDER BY created_at DESC")).rows[0];assert.equal(audit.user_name,'Synthetic vet');assert.equal(audit.user_role,'vet');
});
test('audit history searches beyond the latest 100 and paginates timestamp ties without duplicates',async()=>{
 await query("INSERT INTO audit_logs(id,user_name,user_role,action,created_at) SELECT 'page_'||n,'Synthetic audit','admin','Unique audit needle '||n,'2025-01-01T00:00:00.123456Z'::timestamptz FROM generate_series(1,111) n");
 let cursor=null,ids=[];do{const result=await call('admin','GET',`/admin/audit?search=Unique%20audit%20needle${cursor?'&cursor='+encodeURIComponent(cursor):''}`);assert.equal(result.status,200);ids.push(...result.data.entries.map(e=>e.id));cursor=result.data.nextCursor;}while(cursor);
 assert.equal(ids.length,111);assert.equal(new Set(ids).size,111);
 assert.equal((await call('admin','GET','/admin/audit?cursor=invalid')).status,400);
 assert.equal((await call('admin','GET','/admin/audit?search=Unique%25')).data.entries.length,0);
});

let careSeq=0;
async function careDoctor(){
 const id=`care-doctor-${++careSeq}`,vetId=`care-vet-${careSeq}`;
 await query("INSERT INTO users(id,first_name,last_name,birthday,password_hash,email,role,vet_id,mobile_number,email_verified_at,mobile_verified) VALUES($1,'Synthetic','Doctor','1990-01-01',$2,$3,'vet',$4,'+639170000001',NOW(),true)",[id,hash,`${id}@example.invalid`,vetId]);
 await query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,NOW()+INTERVAL '1 day')",[sha256(id),id]);return{id,vetId};
}
async function careVisit(doctor,status='Scheduled'){
 const id=`care-visit-${careSeq}`;
 await query("INSERT INTO appointments(id,pet_id,vet_id,date,time,status,reason) VALUES($1,'pet',$2,$3,'09:00',$4,'Synthetic measured exam')",[id,doctor.vetId,(await import('../scheduling.js')).clinicClock().date,status]);return id;
}
test('doctor deactivation requires all waiting and active care handed off, with rollback of sessions and audit',async()=>{
 const source=await careDoctor(),target=await careDoctor(),id=await careVisit(source,'In consultation');
 // Both stages, including overnight patients, must prevent removing their responsible vet.
 for(const status of ['Checked-in','In consultation']){
  await query('UPDATE appointments SET status=$1,date=CURRENT_DATE-1 WHERE id=$2',[status,id]);
  const blocked=await change(source.id,'deactivate',0);assert.equal(blocked.status,409);assert.match(blocked.data.error,/Transfer/);
  assert.equal((await query('SELECT is_active FROM users WHERE id=$1',[source.id])).rows[0].is_active,true);
  assert.equal((await query('SELECT * FROM sessions WHERE user_id=$1',[source.id])).rows.length,1);
 }
 const handoff=await call(source.id,'POST',`/appointments/${id}/handoff`,{vetId:target.vetId,note:'Transfer clinical responsibility'});assert.equal(handoff.status,200);
 assert.equal((await change(source.id,'deactivate',0)).status,200);assert.equal((await query('SELECT vet_id FROM appointments WHERE id=$1',[id])).rows[0].vet_id,target.vetId);
 assert.equal((await change(target.id,'deactivate',0)).status,409);
});
test('deactivation racing check-in cannot leave an arrived visit assigned to an inactive vet',async()=>{
 const doctor=await careDoctor(),id=await careVisit(doctor);
 const result=await Promise.all([change(doctor.id,'deactivate',0),call('assistant','PATCH',`/appointments/${id}/status`,{status:'Checked-in',intakeVitals:{weight:5,temp:38.5}})]);
 assert.ok(result.some(r=>r.status===409),JSON.stringify(result));assert.ok(result.some(r=>r.status===200),JSON.stringify(result));
 const row=(await query('SELECT u.is_active,a.status FROM users u JOIN appointments a ON a.vet_id=u.vet_id WHERE a.id=$1',[id])).rows[0];assert.ok(row.is_active || row.status==='Scheduled');
});
test('deactivation racing a handoff cannot orphan the receiving veterinarian queue',async()=>{
 const source=await careDoctor(),target=await careDoctor(),id=await careVisit(source,'In consultation');
 const result=await Promise.all([change(target.id,'deactivate',0),call(source.id,'POST',`/appointments/${id}/handoff`,{vetId:target.vetId,note:'Concurrent transfer'})]);
 assert.ok(result.some(r=>r.status===200),JSON.stringify(result));assert.ok(result.some(r=>[400,409].includes(r.status)),JSON.stringify(result));
 const row=(await query('SELECT u.is_active,a.status FROM users u JOIN appointments a ON a.vet_id=u.vet_id WHERE a.id=$1',[id])).rows[0];assert.equal(row.is_active,true);
});
