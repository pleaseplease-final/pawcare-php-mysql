// Real database locking and HTTP responses; synthetic email provider only.
import {test,after,mock} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import pg from 'pg';
const url=new URL(process.env.TEST_DATABASE_URL || '');
if(!['localhost','127.0.0.1'].includes(url.hostname))throw Error('Use a disposable local TEST_DATABASE_URL.');
const admin=new pg.Pool({connectionString:url.href}),schema=`test_lockout_${crypto.randomUUID().replaceAll('-','')}`;
await admin.query(`CREATE SCHEMA ${schema}`);url.searchParams.set('options',`-c search_path=${schema},public`);process.env.DATABASE_URL=url.href;
const {query,pool}=await import('../db.js');
await query(readFileSync(new URL('../database/schema.sql',import.meta.url),'utf8'));
await query(readFileSync(new URL('../database/appointment-status.sql',import.meta.url),'utf8'));
let mail=[],delivery='synthetic';
mock.module('../services.js',{namedExports:{sendMail:async(to,subject,text)=>{mail.push({to,subject,text});if(delivery==='throw')throw Error('Synthetic failure');return{ok:delivery!=='failed',via:delivery};},sendSms:async()=>({ok:true,via:'synthetic'}),serverOutbox:[]}});
const {hashPassword,sha256}=await import('../security.js');
const {default:app}=await import('../../api/index.js');
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
after(async()=>{await new Promise(r=>server.close(r));await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();});
const call=async(path,body)=>{const response=await fetch(`http://127.0.0.1:${server.address().port}/api/auth${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return{status:response.status,headers:response.headers,data:await response.json()};};
const password='SyntheticLogin123!';let seq=0;
async function user(role='owner'){
 const id=`lock-${++seq}`,email=`${id}@example.invalid`;
 await query("INSERT INTO users(id,first_name,last_name,birthday,password_hash,email,role,mobile_number,email_verified_at,mobile_verified) VALUES($1,'Synthetic','Lock','1990-01-01',$2,$3,$4,'+639170000001',NOW(),true)",[id,await hashPassword(password),email,role]);return{id,email};
}
const login=(u,pass='WrongPassword!')=>call('/login',{email:u.email,password:pass});
const token=message=>new URL(message.text.match(/https?:\/\/\S+/)[0]).searchParams.get('unlock');
async function lock(u){mail=[];assert.equal((await login(u)).status,401);const result=await login(u);assert.equal(result.status,423);assert.equal(mail.length,1);return token(mail[0]);}
for(const role of ['owner','assistant','vet','admin'])test(`${role}: two failures, one-time email link then enforced cooldown`,async()=>{
 const u=await user(role);mail=[];
 const first=await login(u);assert.equal(first.status,401);assert.match(first.data.error,/one more incorrect/);assert.equal(mail.length,0);
 const second=await login(u);assert.equal(second.status,423);assert.equal(second.data.unlockEmailSent,true);assert.equal(mail[0].to,u.email);assert.equal(second.data.token,undefined);
 const raw=token(mail[0]);assert.notEqual((await query("SELECT token_hash FROM verification_tokens WHERE user_id=$1",[u.id])).rows[0].token_hash,raw);
 // Time alone cannot clear a lock that is waiting for the email link.
 await query("UPDATE verification_tokens SET created_at=NOW()-INTERVAL '2 minutes' WHERE user_id=$1",[u.id]);
 const waiting=await login(u,password);assert.equal(waiting.status,423);assert.equal(waiting.data.unlockRequired,true);
 const latest=token(mail.at(-1));if(latest!==raw)assert.equal((await call('/unlock',{token:raw})).status,400);
 const confirmed=await call('/unlock',{token:latest});assert.equal(confirmed.status,200);assert.equal(confirmed.data.retryAfter,120);
 const until=new Date(confirmed.data.cooldownUntil).getTime();assert.ok(until>Date.now()+118000 && until<=Date.now()+120000);
 const replay=await call('/unlock',{token:latest});assert.equal(replay.status,400);
 const cooling=await login(u,password);assert.equal(cooling.status,423);assert.equal(cooling.data.cooldownUntil,confirmed.data.cooldownUntil);assert.equal(cooling.headers.get('set-cookie'),null);
 await query("UPDATE users SET lockout_until=NOW()-INTERVAL '1 second' WHERE id=$1",[u.id]);
 const success=await login(u,password);assert.equal(success.status,200);assert.equal(success.data.user.id,u.id);
 const saved=(await query('SELECT * FROM users WHERE id=$1',[u.id])).rows[0];assert.equal(saved.failed_login_attempts,0);assert.equal(saved.is_locked,false);
});
test('concurrent failures count exactly twice and send one email; link consumes once',async()=>{
 const u=await user();mail=[];const results=await Promise.all(Array.from({length:5},()=>login(u)));
 assert.equal(results.filter(r=>r.status===401).length,1);assert.equal(results.filter(r=>r.status===423).length,4);assert.equal(mail.length,1);
 assert.equal((await query('SELECT failed_login_attempts FROM users WHERE id=$1',[u.id])).rows[0].failed_login_attempts,2);
 const raw=token(mail[0]);const clicks=await Promise.all([call('/unlock',{token:raw}),call('/unlock',{token:raw})]);assert.deepEqual(clicks.map(c=>c.status).sort(),[200,400]);
});
test('invalid, expired, failed delivery and dev outbox links cannot unlock; resend is throttled',async()=>{
 for(const via of ['failed','throw','dev_outbox']){
  delivery=via;const u=await user();const raw=await lock(u);assert.equal((await call('/unlock',{token:raw})).status,400);
  const before=mail.length;assert.equal((await login(u)).data.unlockEmailSent,false);assert.equal(mail.length,before);
  delivery='synthetic';await query("UPDATE verification_tokens SET created_at=NOW()-INTERVAL '61 seconds' WHERE user_id=$1",[u.id]);
  assert.equal((await login(u)).data.unlockEmailSent,true);const next=token(mail.at(-1));
  await query("UPDATE verification_tokens SET expired_at=NOW()-INTERVAL '1 second' WHERE user_id=$1",[u.id]);assert.equal((await call('/unlock',{token:next})).status,400);
 }
 assert.equal((await call('/unlock',{token:'invalid'})).status,400);
});
test('successful login resets the first failure; cooldown expiry starts a fresh two-attempt cycle',async()=>{
 const u=await user();assert.equal((await login(u)).status,401);assert.equal((await login(u,password)).status,200);assert.equal((await login(u)).status,401);
 await login(u);const raw=token(mail.at(-1));await call('/unlock',{token:raw});await query("UPDATE users SET lockout_until=NOW()-INTERVAL '1 second' WHERE id=$1",[u.id]);
 const next=await login(u);assert.equal(next.status,401);assert.equal(next.data.attemptsRemaining,1);
});
test('unknown accounts do not receive tokens or sessions',async()=>{
 mail=[];const result=await login({email:'missing@example.invalid'});assert.equal(result.status,401);assert.equal(mail.length,0);assert.equal(result.headers.get('set-cookie'),null);
});
