// Isolated real PostgreSQL transactions; email/SMS use synthetic adapters.
import {test,after,mock} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import pg from 'pg';
const url=new URL(process.env.TEST_DATABASE_URL || '');
if(!['localhost','127.0.0.1'].includes(url.hostname))throw Error('Set TEST_DATABASE_URL to a disposable local database.');
const admin=new pg.Pool({connectionString:url.href}),schema=`test_recovery_${crypto.randomUUID().replaceAll('-','')}`;
await admin.query(`CREATE SCHEMA ${schema}`);url.searchParams.set('options',`-c search_path=${schema},public`);process.env.DATABASE_URL=url.href;
const {query,pool}=await import('../db.js');await query(readFileSync(new URL('../database/schema.sql',import.meta.url),'utf8'));
await query(readFileSync(new URL('../database/appointment-status.sql',import.meta.url),'utf8'));
let messages=[],delivery='synthetic';
mock.module('../services.js',{exports:{sendMail:async(to,subject,text)=>{messages.push({to,subject,text});if(delivery==='throw')throw Error('Synthetic provider failure');return{ok:delivery!=='failed',via:delivery};},sendSms:async()=>({ok:true,via:'synthetic'}),serverOutbox:[]}});
const {sha256,hashPassword,verifyPassword}=await import('../security.js');
const {default:app}=await import('../../api/index.js');
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
after(async()=>{await new Promise(r=>server.close(r));await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();});
const call=async(path,body,token)=>{const res=await fetch(`http://127.0.0.1:${server.address().port}/api/auth${path}`,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body)});return{status:res.status,headers:res.headers,data:await res.json()};};
let seq=0;
const oldPassword='SyntheticOld123!',newPassword='SyntheticNew456!';
async function user(role='owner',patch={}){
 const id=`reset-${++seq}`,email=`${id}@example.invalid`;
 await query("INSERT INTO users(id,first_name,last_name,birthday,password_hash,email,role,mobile_number,email_verified_at,mobile_verified) VALUES($1,'Synthetic','Recovery','1990-01-01',$2,$3,$4,'+639170000001',NOW(),true)",[id,await hashPassword(oldPassword),email,role]);
 for(const token of [id,id+'-other'])await query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,NOW()+INTERVAL '1 day')",[sha256(token),id]);
 if(patch.unverified)await query('UPDATE users SET email_verified_at=NULL WHERE id=$1',[id]);
 return{id,email};
}
async function request(u){messages=[];const response=await call('/forgot',{identifier:u.email});assert.equal(response.status,202,JSON.stringify(response));return {response,code:messages[0]?.text.match(/\b\d{6}\b/)[0]};}
const reset=(u,code,extra={})=>call('/reset',{identifier:u.email,code,password:newPassword,confirm_password:newPassword,...extra});
const challenge=async u=>(await query('SELECT * FROM password_recovery WHERE identifier_hash=$1',[sha256(u.email)])).rows[0];
const storedUser=async u=>(await query('SELECT * FROM users WHERE id=$1',[u.id])).rows[0];
for(const role of ['owner','vet','assistant','admin'])test(`${role}: verified email resets password once, revokes sessions and preserves role/verification`,async()=>{
 const u=await user(role),{response,code}=await request(u),stored=await challenge(u);
 assert.ok(code);assert.notEqual(stored.code_hash,sha256(code));assert.doesNotMatch(JSON.stringify(response.data),new RegExp(code));assert.equal(response.data.devCode,undefined);
 const done=await reset(u,code);assert.equal(done.status,200);assert.equal(done.data.requiresLogin,true);assert.match(done.headers.get('set-cookie'),/sid=;/);
 const saved=await storedUser(u);assert.ok(await verifyPassword(newPassword,saved.password_hash));assert.equal(await verifyPassword(oldPassword,saved.password_hash),false);assert.equal(saved.role,role);assert.equal(saved.mobile_verified,true);assert.ok(saved.email_verified_at);
 assert.equal((await query('SELECT * FROM sessions WHERE user_id=$1',[u.id])).rows.length,0);assert.ok((await challenge(u)).consumed_at);assert.equal((await challenge(u)).code_hash,null);
 assert.equal((await reset(u,code)).status,400);assert.equal((await call('/login',{email:u.email,password:oldPassword})).status,401);assert.equal((await call('/login',{email:u.email,password:newPassword})).status,200);
});
test('unknown/unverified email gets the same receipt and durable cooldown without mail or disclosure',async()=>{
 const eligible=await user(),unknown={email:'missing@example.invalid'},unverified=await user('owner',{unverified:true});
 const good=await request(eligible);
 for(const u of [unknown,unverified]){const r=await request(u);assert.deepEqual(r.response.data,good.response.data);assert.equal(messages.length,0);assert.equal((await reset(u,'123456')).status,400);}
 for(const u of [eligible,unknown,unverified]){const r=await call('/forgot',{identifier:u.email});assert.equal(r.status,429);assert.equal(r.headers.get('retry-after'),'60');}
});
test('codes expire, are account-scoped and five concurrent wrong attempts remain durable',async()=>{
 const u=await user(),other=await user(),r=await request(u);await request(other);
 assert.equal((await reset(other,r.code)).status,400);
 const wrong=r.code==='100000'?'100001':'100000';const failures=await Promise.all(Array.from({length:7},()=>reset(u,wrong)));
 assert.ok(failures.every(r=>r.status===400));assert.equal((await challenge(u)).attempts,5);assert.equal((await reset(u,r.code)).status,400);
 const expired=await user(),ex=await request(expired);await query("UPDATE password_recovery SET expires_at=NOW()-INTERVAL '1 second' WHERE identifier_hash=$1",[sha256(expired.email)]);assert.equal((await reset(expired,ex.code)).status,400);
});
test('resend replaces old codes, serializes parallel requests and keeps cooldown after use',async()=>{
 const u=await user(),first=await request(u);await query("UPDATE password_recovery SET created_at=NOW()-INTERVAL '61 seconds' WHERE identifier_hash=$1",[sha256(u.email)]);
 messages=[];const results=await Promise.all([call('/forgot',{identifier:u.email}),call('/forgot',{identifier:u.email})]);assert.deepEqual(results.map(r=>r.status).sort(),[202,429]);assert.equal(messages.length,1);
 const next=messages[0].text.match(/\b\d{6}\b/)[0];if(next!==first.code)assert.equal((await reset(u,first.code)).status,400);
 assert.equal((await reset(u,next)).status,200);assert.equal((await call('/forgot',{identifier:u.email})).status,429);
});
test('provider errors, unconfirmed delivery and dev outbox never authorize recovery',async()=>{
 try{for(const via of ['throw','failed','dev_outbox']){delivery=via;const u=await user(),r=await request(u);assert.ok(r.code);assert.equal((await challenge(u)).sent,false);assert.equal((await reset(u,r.code)).status,400);assert.ok(await verifyPassword(oldPassword,(await storedUser(u)).password_hash));}}finally{delivery='synthetic';}
});
test('recovery does not accept codes after email, password or active status changes',async()=>{
 await query(readFileSync(new URL('../database/staff-access.sql',import.meta.url),'utf8'));
 for(const change of ['email','password','inactive']){const u=await user(),r=await request(u);
 if(change==='email')await query('UPDATE users SET email=$1 WHERE id=$2',[`changed-${u.email}`,u.id]);
 if(change==='password')await query('UPDATE users SET password_hash=$1 WHERE id=$2',[await hashPassword('OtherPassword789!'),u.id]);
 if(change==='inactive')await query('UPDATE users SET is_active=false WHERE id=$1',[u.id]);
 assert.equal((await reset(u,r.code)).status,400);}
});
test('password confirmation/type/complexity and code format are validated before reset',async()=>{
 const u=await user(),r=await request(u);
 for(const patch of [{password:'weak',confirm_password:'weak'},{password:{}},{confirm_password:'Mismatch'},{code:123456},{identifier:'not-email'}])assert.equal((await reset(u,r.code,patch)).status,400);
 assert.equal((await reset(u,r.code,{password:oldPassword,confirm_password:oldPassword})).status,400);assert.equal((await reset(u,r.code)).status,200);
});
test('audit failure rolls back password, token consumption and session revocation; concurrent success consumes once',async()=>{
 const u=await user(),r=await request(u);
 await query(`CREATE FUNCTION reject_recovery_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action LIKE 'Reset own password%' THEN RAISE EXCEPTION 'Synthetic recovery audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_recovery_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_recovery_audit()`);
 try{assert.equal((await reset(u,r.code)).status,500);assert.equal((await challenge(u)).consumed_at,null);assert.ok(await verifyPassword(oldPassword,(await storedUser(u)).password_hash));assert.equal((await query('SELECT * FROM sessions WHERE user_id=$1',[u.id])).rows.length,2);}finally{await query('DROP TRIGGER reject_recovery_audit ON audit_logs');}
 const results=await Promise.all([reset(u,r.code),reset(u,r.code)]);assert.deepEqual(results.map(r=>r.status).sort(),[200,400]);
});
test('a login already issuing a session serializes with reset and its session is revoked',async()=>{
 const u=await user(),r=await request(u),blocker=await pool.connect();let login,resetting;
 try{
  await blocker.query('BEGIN');await blocker.query('LOCK TABLE sessions IN ACCESS EXCLUSIVE MODE');
  login=call('/login',{email:u.email,password:oldPassword});
  let waiting=false;const deadline=Date.now()+3000;
  while(Date.now()<deadline){waiting=(await query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE 'INSERT INTO sessions%') AS waiting")).rows[0].waiting;if(waiting)break;await new Promise(resolve=>setTimeout(resolve,10));}
  assert.equal(waiting,true,'login reached session issuance while retaining the user share lock');
  resetting=reset(u,r.code);await blocker.query('COMMIT');
  assert.equal((await login).status,200);assert.equal((await resetting).status,200);
  assert.equal((await query('SELECT * FROM sessions WHERE user_id=$1',[u.id])).rows.length,0);
 }finally{await blocker.query('ROLLBACK');blocker.release();if(login)await login;if(resetting)await resetting;}
});
test('a code expiring while reset waits for the account lock cannot change the password',async()=>{
 const u=await user(),r=await request(u),blocker=await pool.connect();let resetting;
 try{
  await query("UPDATE password_recovery SET expires_at=clock_timestamp()+INTERVAL '300 milliseconds' WHERE identifier_hash=$1",[sha256(u.email)]);
  await blocker.query('BEGIN');await blocker.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[u.id]);
  resetting=reset(u,r.code);let waiting=false;const deadline=Date.now()+2500;
  while(Date.now()<deadline){waiting=(await query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock' AND query='SELECT * FROM users WHERE id=$1 FOR UPDATE') AS waiting")).rows[0].waiting;if(waiting)break;await new Promise(resolve=>setTimeout(resolve,10));}
  assert.equal(waiting,true);await new Promise(resolve=>setTimeout(resolve,350));await blocker.query('COMMIT');
  assert.equal((await resetting).status,400);assert.ok(await verifyPassword(oldPassword,(await storedUser(u)).password_hash));
 }finally{await blocker.query('ROLLBACK');blocker.release();if(resetting)await resetting;}
});
