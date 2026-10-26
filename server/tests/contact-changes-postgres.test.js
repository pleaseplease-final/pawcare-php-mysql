// Real transactions with synthetic local contacts; never deliver to providers.
import {test,after,mock} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import pg from 'pg';
import express from 'express';
import cookieParser from 'cookie-parser';
if(!process.env.TEST_DATABASE_URL)throw Error('Set TEST_DATABASE_URL to a disposable local database');
const url=new URL(process.env.TEST_DATABASE_URL);
if(!['localhost','127.0.0.1'].includes(url.hostname))throw Error('Local database required');
const admin=new pg.Pool({connectionString:url.href}),schema=`test_contact_${crypto.randomUUID().replaceAll('-','')}`;
await admin.query(`CREATE SCHEMA ${schema}`);url.searchParams.set('options',`-c search_path=${schema},public`);process.env.DATABASE_URL=url.href;
const {query,pool}=await import('../db.js');await query(readFileSync(new URL('../database/schema.sql',import.meta.url),'utf8'));
await query(readFileSync(new URL('../database/appointment-status.sql',import.meta.url),'utf8'));
let messages=[],delivery='synthetic';
mock.module('../services.js',{exports:{sendMail:async(to,subject,text)=>{messages.push({channel:'email',to,text});return {ok:true,via:delivery};},sendSms:async(to,text)=>{messages.push({channel:'phone',to,text});return {ok:true,via:delivery};},serverOutbox:[]}});
const {sha256}=await import('../security.js');const {accountRouter}=await import('../routes/account.js');
const app=express();app.use(express.json(),cookieParser());app.use('/api/auth',accountRouter);
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
after(async()=>{await new Promise(r=>server.close(r));await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();});
let seq=0;
async function user(role='owner'){
 const id=`contact-${++seq}`,email=`${id}@example.invalid`,phone='+639170000001';
 await query("INSERT INTO users(id,first_name,last_name,birthday,password_hash,email,role,owner_id,mobile_number,email_verified_at,mobile_verified) VALUES($1,'Synthetic',$1,'1990-01-01','unused',$2,$3,$1,$4,NOW(),true)",[id,email,role,phone]);
 if(role==='owner')await query("INSERT INTO owners(id,user_id,name,email,phone,address) VALUES($1,$1,'Synthetic',$2,$3,'Old address')",[id,email,phone]);
 for(const token of [id,id+'-other'])await query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,NOW()+INTERVAL '1 day')",[sha256(token),id]);
 return {id,email,phone,role};
}
const call=async(u,path,body)=>{const r=await fetch(`http://127.0.0.1:${server.address().port}/api/auth${path}`,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(u?{Authorization:`Bearer ${u.id}`}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};};
const row=async(u)=>(await query('SELECT * FROM users WHERE id=$1',[u.id])).rows[0];
const proposal=u=>({email:`new-${u.id}@example.invalid`,phone:'+639170000002',houseStreet:'12 Synthetic St',city:'Synthetic City',state:'Synthetic State',country:'Philippines',zipCode:'1000'});
async function request(u,change=proposal(u)){
 messages=[];const r=await call(u,'/profile/contact',change);assert.equal(r.status,200,JSON.stringify(r));assert.ok(r.data.pending);
 const codes={};for(const m of messages)codes[m.channel+'Code']=m.text.match(/\b\d{6}\b/)[0];
 return {pending:r.data.pending,codes,change};
}
const verify=(u,r,extra={})=>call(u,'/profile/contact/verify',{id:r.pending.id,...r.codes,...extra});
for(const role of ['owner','assistant','vet','admin'])test(`${role}: contacts stay trusted until all codes verified; success is single-use and revokes other sessions`,async()=>{
 const u=await user(role),before=await row(u),r=await request(u);
 assert.equal((await row(u)).email,u.email);assert.equal((await row(u)).mobile_number,u.phone);
 assert.equal(r.pending.requireEmail,true);assert.equal(r.pending.requirePhone,true);assert.equal(r.pending.emailSent,true);assert.equal(r.pending.phoneSent,true);
 const stored=(await query('SELECT * FROM account_contact_changes WHERE user_id=$1',[u.id])).rows[0];
 assert.notEqual(stored.email_hash,r.codes.emailCode);assert.notEqual(stored.phone_hash,r.codes.phoneCode);
 assert.ok(!JSON.stringify(r.pending).includes(r.codes.emailCode));assert.ok(!JSON.stringify(r.pending).includes(r.codes.phoneCode));
 assert.equal((await call(u,'/profile')).status,200);
 assert.equal((await verify(u,r,{phoneCode:'000000'})).status,400);
 assert.equal((await row(u)).email,u.email);
 const result=await verify(u,r,{email:'injected@example.invalid',phone:'+639170000009',userId:'someone-else'});assert.equal(result.status,200);
 assert.equal(result.data.profile.email,r.change.email);assert.equal(result.data.profile.mobileVerified,true);assert.equal(result.data.profile.emailVerified,true);
 const saved=await row(u);assert.equal(saved.email,r.change.email);assert.equal(saved.mobile_number,r.change.phone);assert.ok(new Date(saved.email_verified_at)>=new Date(before.email_verified_at));
 if(role==='owner'){const owner=(await query('SELECT * FROM owners WHERE user_id=$1',[u.id])).rows[0];assert.equal(owner.email,saved.email);assert.equal(owner.phone,saved.mobile_number);assert.match(owner.address,/12 Synthetic/);}
 assert.equal((await query('SELECT count(*)::int n FROM sessions WHERE user_id=$1',[u.id])).rows[0].n,1);
 assert.equal((await call(u,'/profile')).status,200);assert.equal((await verify(u,r)).status,409);
 assert.equal((await query("SELECT count(*)::int n FROM audit_logs WHERE action LIKE 'Verified and updated%' AND user_name=$1",[`Synthetic ${u.id}`])).rows[0].n,1);
});
test('unchanged contacts save address immediately without codes or session revocation',async()=>{
 const u=await user();messages=[];const r=await call(u,'/profile/contact',{...proposal(u),email:u.email,phone:'+63 917 000 0001'});
 assert.equal(r.status,200);assert.ok(r.data.profile);assert.equal(r.data.pending,undefined);assert.equal(messages.length,0);
 assert.equal((await query('SELECT count(*)::int n FROM sessions WHERE user_id=$1',[u.id])).rows[0].n,2);
});
test('only changed channels require codes',async()=>{
 for(const channel of ['email','phone']){
  const u=await user(),r=await request(u,{...proposal(u),...(channel==='email'?{phone:u.phone}:{email:u.email})});
  assert.equal(messages.length,1);assert.equal(r.pending.requireEmail,channel==='email');assert.equal(r.pending.requirePhone,channel==='phone');
  assert.equal((await verify(u,r)).status,200);
 }
});
test('expiry, five durable failed attempts, ownership and code swapping reject contact replacement',async()=>{
 const u=await user(),other=await user(),r=await request(u);
 assert.equal((await verify(other,r)).status,409);
 for(let i=0;i<5;i++)assert.equal((await verify(u,r,{emailCode:'000000'})).status,400);
 assert.equal((await query('SELECT attempts FROM account_contact_changes WHERE user_id=$1',[u.id])).rows[0].attempts,5);
 assert.equal((await verify(u,r)).status,409);assert.equal((await row(u)).email,u.email);
 const v=await user(),expired=await request(v);await query("UPDATE account_contact_changes SET expires_at=NOW()-INTERVAL '1 second' WHERE user_id=$1",[v.id]);
 assert.equal((await verify(v,expired)).status,409);assert.equal((await row(v)).email,v.email);
 const x=await user(),swapped=await request(x);assert.equal((await verify(x,swapped,{emailCode:'000000',phoneCode:swapped.codes.emailCode})).status,400);
});
test('resend cooldown and replacement invalidate old proposals; pending proposals cannot outlive address saves',async()=>{
 const u=await user(),r=await request(u);assert.equal((await call(u,'/profile/contact',proposal(u))).status,429);
 await query("UPDATE users SET contact_code_requested_at=NOW()-INTERVAL '61 seconds' WHERE id=$1",[u.id]);
 const newer=await request(u);assert.equal((await verify(u,r)).status,409);assert.equal((await verify(u,newer)).status,200);
 const v=await user(),pending=await request(v);
 assert.equal((await call(v,'/profile/contact',{...proposal(v),email:v.email,phone:v.phone})).status,200);
 assert.equal((await verify(v,pending)).status,409);
 assert.equal((await call(v,'/profile/contact',proposal(v))).status,429);
});
test('unconfirmed delivery cannot change contacts or claim to be verified',async()=>{
 const u=await user();delivery='dev_outbox';const r=await request(u);delivery='synthetic';
 assert.equal(r.pending.emailSent,false);assert.equal(r.pending.phoneSent,false);assert.equal((await verify(u,r)).status,409);assert.equal((await row(u)).email,u.email);
});
test('duplicate email at proposal or final verification never partially saves',async()=>{
 const u=await user(),other=await user();assert.equal((await call(u,'/profile/contact',{...proposal(u),email:other.email})).status,409);
 const r=await request(u);await query('UPDATE users SET email=$1 WHERE id=$2',[r.change.email,other.id]);
 assert.equal((await verify(u,r)).status,409);assert.equal((await row(u)).email,u.email);assert.equal((await row(u)).mobile_number,u.phone);
 assert.equal((await query('SELECT count(*)::int n FROM account_contact_changes WHERE user_id=$1',[u.id])).rows[0].n,1);
});
test('parallel confirmation applies once; failed audit rolls all contact, owner, session and challenge changes back',async()=>{
 const u=await user(),r=await request(u);const results=await Promise.all([verify(u,r),verify(u,r)]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 const v=await user(),pending=await request(v);
 await query(`CREATE FUNCTION reject_contact_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action LIKE 'Verified and updated%' THEN RAISE EXCEPTION 'synthetic contact audit failure'; END IF; RETURN NEW; END $$`);
 await query('CREATE TRIGGER reject_contact_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_contact_audit()');
 assert.equal((await verify(v,pending)).status,500);assert.equal((await row(v)).email,v.email);
 assert.equal((await query('SELECT email FROM owners WHERE user_id=$1',[v.id])).rows[0].email,v.email);
 assert.equal((await query('SELECT count(*)::int n FROM sessions WHERE user_id=$1',[v.id])).rows[0].n,2);
 assert.equal((await query('SELECT count(*)::int n FROM account_contact_changes WHERE user_id=$1',[v.id])).rows[0].n,1);
 await query('DROP TRIGGER reject_contact_audit ON audit_logs');assert.equal((await verify(v,pending)).status,200);
});
test('unverified or missing sessions cannot request or redeem proposals',async()=>{
 assert.equal((await call(null,'/profile/contact',{})).status,401);assert.equal((await call(null,'/profile/contact/verify',{})).status,401);
 const u=await user();await query('UPDATE users SET mobile_verified=false WHERE id=$1',[u.id]);assert.equal((await call(u,'/profile/contact',proposal(u))).status,403);
});

test('verifying only a staff mobile never certifies an unchanged unverified email',async()=>{
 const u=await user('vet');await query('UPDATE users SET email_verified_at=NULL WHERE id=$1',[u.id]);
 const r=await request(u,{...proposal(u),email:u.email});const saved=await verify(u,r);
 assert.equal(saved.status,200);assert.equal(saved.data.profile.emailVerified,false);assert.equal((await row(u)).email_verified_at,null);
});
