import { after, beforeEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import cookieParser from 'cookie-parser';
import { sha256, hashPassword } from '../security.js';

// Real HTTP routes, with isolated database/mail/SMS boundaries: no customer data or delivery.
let steps = [];
const sentSms = [];
const sentMail = [];
async function query(sql, params = []) {
  if(sql.includes('ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_requested_at'))return {rows:[]};
  const step = steps.shift();
  assert.ok(step, `Unexpected SQL: ${sql}`);
  assert.match(sql.replace(/\s+/g, ' '), step.sql);
  if (step.params) assert.deepEqual(params, step.params);
  if (step.check) step.check(params);
  return { rows: step.rows || [] };
}
mock.module('../db.js', { namedExports: { query, withTransaction: async fn => fn({ query }) } });
mock.module('../services.js', { namedExports: {
  sendSms: async (...args) => {sentSms.push(args);return{ok:true,via:"synthetic"};},
  sendMail: async (...args) => {sentMail.push(args);return{ok:true,via:"synthetic"};},
  serverOutbox: [],
} });
const { authRouter } = await import('../routes/auth.js');
const app = express();
app.use(express.json(), cookieParser());
app.use('/api/auth', authRouter);
const server = app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}/api/auth`;
after(() => new Promise(resolve => server.close(resolve)));
beforeEach(() => { steps = []; sentSms.length = 0; sentMail.length = 0; });
const sid = 'synthetic-verification-session';
const user = { id: 'signup-a', first_name: 'Test', last_name: 'Owner', email: 'signup-a@example.test', role: 'owner', mobile_number: '+639170000001', email_verified_at: '2026-10-24', mobile_verified: false };
const session = (u = user) => ({ sql: /FROM sessions s JOIN users u/, params: [sha256(sid)], rows: u ? [u] : [] });
async function request(path, { body, session: hasSession = false, accept = 'application/json' } = {}) {
  const res = await fetch(base + path, { method: body ? 'POST' : 'GET', redirect: 'manual', headers: {
    Accept: accept, 'Content-Type': 'application/json', ...(hasSession ? { Cookie: `sid=${sid}` } : {}),
  }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text();
  assert.equal(steps.length, 0, 'All expected database operations must run');
  return { res, data };
}

test('registration sends an email link without signing in or sending SMS', async () => {
  steps = [
    { sql: /SELECT id FROM users/, rows: [] },
    { sql: /INSERT INTO users/, check: p => { assert.equal(p[11], null); assert.equal(p[12], false); } },
    { sql: /INSERT INTO addresses/ }, { sql: /INSERT INTO owners/ },
    { sql: /UPDATE users SET email_verification_requested_at/ },
    { sql: /INSERT INTO verification_tokens.*'email_verify'/ },
    { sql: /UPDATE verification_tokens SET delivery_confirmed/,rows:[{id:'issued'}] },
  ];
  const { res, data } = await request('/register', { body: { firstName: 'Test', lastName: 'Owner', email: 'synthetic.signup@gmail.com', password: 'Synthetic123!', confirm_password:'Synthetic123!', birthday:'01/01/1990', country:'PH', state:'Metro Manila', city:'Quezon City', zip_code:'1100', house_street:'12 Synthetic St', mobile: user.mobile_number } });
  assert.equal(res.status, 200);
  assert.equal(data.token, undefined);
  assert.equal(res.headers.get('set-cookie'), null);
  assert.equal(sentMail.length, 1);
  assert.match(sentMail[0][2], /\?verify=/);
  assert.equal(sentSms.length, 0);
});

test('password login cannot skip email verification', async () => {
  const password = 'Synthetic123!';
  steps = [{ sql: /SELECT \* FROM users/, rows: [{ ...user, email_verified_at: null, password_hash: await hashPassword(password) }] }, { sql: /UPDATE users SET failed_login_attempts = 0/ }];
  const { res, data } = await request('/login', { body: { email: user.email, password } });
  assert.equal(res.status, 403);
  assert.equal(data.unverified, true);
  assert.equal(res.headers.get('set-cookie'), null);
});

test('verification session cannot open the portal before OTP', async () => {
  steps = [{ sql: /FROM sessions s JOIN users u/, params: [sha256(sid)], rows: [user] }];
  const { res, data } = await request('/me', { session: true });
  assert.equal(res.status, 403);
  assert.equal(data.user, undefined);
});

test('invalid email link never selects a recent pending signup, even with a cookie', async () => {
  steps = [{ sql: /t.token_hash = \$1 AND t.type = 'email_verify' AND t.expired_at > NOW\(\)/, params: [sha256('invalid')] }];
  const { res } = await request('/verify-email?token=invalid', { session: true });
  assert.equal(res.status, 400);
  assert.equal(res.headers.get('set-cookie'), null);
});

test('HTML invalid email links redirect to a clear error', async () => {
  steps = [{ sql: /FROM verification_tokens t/ }];
  const { res } = await request('/verify-email?token=expired', { accept: 'text/html' });
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), '/?verified=invalid');
});

test('valid email link verifies only its owner and sends that account an OTP', async () => {
  steps = [
    { sql: /FROM verification_tokens t/, params: [sha256('valid-link')], rows: [{ ...user, user_id: user.id, id: 'email-token-a' }] },
    { sql: /UPDATE users SET email_verified_at/, params: [user.id] },
    { sql: /DELETE FROM verification_tokens WHERE id/, params: ['email-token-a'] },
    { sql: /INSERT INTO sessions/, check: p => assert.equal(p[1], user.id) },
    { sql: /SELECT .*retry_after FROM users WHERE id=\$1 FOR UPDATE/, rows:[user] },
    { sql: /UPDATE users SET mobile_otp_requested_at/ },
    { sql: /DELETE FROM verification_tokens WHERE user_id=\$1 AND type=\$2/,params:[user.id,'mobile_otp'] },
    { sql: /INSERT INTO verification_tokens/, check:p=>assert.equal(p[0],user.id) },
    { sql: /UPDATE verification_tokens SET delivery_confirmed/,rows:[{id:'issued'}],check:p=>assert.equal(p[1],user.id) },
  ];
  const { res, data } = await request('/verify-email?token=valid-link');
  assert.equal(res.status, 200);
  assert.ok(data.token);
  assert.equal(data.user, undefined);
  assert.equal(data.devCode, undefined);
  assert.equal(sentSms[0][0], user.mobile_number);
  assert.match(sentSms[0][1], /\d{6}/);
});

test('OTP info, resend and verify require a session instead of guessing an account', async () => {
  for (const [path, body] of [['/otp/info', undefined], ['/otp/resend', {}], ['/otp/verify', { code: '123456' }]]) {
    const { res } = await request(path, { body });
    assert.equal(res.status, 401);
  }
});

test('OTP info is scoped to the session account', async () => {
  steps = [session(), { sql: /WHERE user_id = \$1 AND type = 'mobile_otp'/, params: [user.id,user.mobile_number], rows: [{ id: 'otp-a' }] }];
  const { data } = await request('/otp/info', { session: true });
  assert.equal(data.phone, user.mobile_number);
  assert.equal(data.hasActiveOtp, true);
});

test('resend sends to the session account only', async () => {
  steps = [session(), {sql:/SELECT .*retry_after FROM users WHERE id=\$1 FOR UPDATE/,rows:[user]}, {sql:/UPDATE users SET mobile_otp_requested_at/}, {sql:/DELETE FROM verification_tokens WHERE user_id=\$1 AND type=\$2/,params:[user.id,'mobile_otp']}, {sql:/INSERT INTO verification_tokens/,check:p=>assert.equal(p[0],user.id)}, {sql:/UPDATE verification_tokens SET delivery_confirmed/,rows:[{id:'issued'}],check:p=>assert.equal(p[1],user.id)}];
  const { res } = await request('/otp/resend', { body: {}, session: true });
  assert.equal(res.status, 200);
  assert.equal(sentSms[0][0], user.mobile_number);
});

test('another account code fails and consumes an attempt on this account only', async () => {
  steps = [session(), {sql:/SELECT \* FROM users WHERE id=\$1 FOR UPDATE/,rows:[user]}, {sql:/FROM verification_tokens WHERE user_id=\$1 AND type='mobile_otp'/,params:[user.id,user.mobile_number],rows:[{id:'otp-a',token_hash:sha256('111111'),attempts:0}]},{sql:/UPDATE verification_tokens SET attempts=attempts\+1/,params:['otp-a']}];
  const { res } = await request('/otp/verify', { body: { code: '222222' }, session: true });
  assert.equal(res.status, 400);
});

test('expired codes cannot fall back to a code belonging to someone else', async () => {
  steps = [session(),{sql:/SELECT \* FROM users WHERE id=\$1 FOR UPDATE/,rows:[user]}, { sql: /WHERE user_id=\$1 AND type='mobile_otp'/, params: [user.id,user.mobile_number] }];
  const { res } = await request('/otp/verify', { body: { code: '222222' }, session: true });
  assert.equal(res.status, 400);
});

test('three wrong attempts invalidate the OTP', async () => {
  steps = [session(),{sql:/SELECT \* FROM users WHERE id=\$1 FOR UPDATE/,rows:[user]}, { sql: /FROM verification_tokens WHERE user_id/, rows: [{ id: 'otp-a', token_hash: sha256('111111'), attempts: 2 }] }, { sql: /UPDATE verification_tokens SET attempts=attempts\+1/, params: ['otp-a'] }];
  const { res, data } = await request('/otp/verify', { body: { code: '222222' }, session: true });
  assert.equal(res.status, 400);
  assert.match(data.error, /three attempts/);
});

test('successful OTP completes verification and revokes sessions, requiring password login', async () => {
  steps = [session(),{sql:/SELECT \* FROM users WHERE id=\$1 FOR UPDATE/,rows:[user]}, { sql: /FROM verification_tokens WHERE user_id/, rows: [{ id: 'otp-a', token_hash: sha256('111111') }] },
    { sql: /DELETE FROM verification_tokens WHERE id=\$1/, params: ['otp-a'] },
    { sql: /UPDATE users SET mobile_verified = true/, params: [user.id] },
    { sql: /DELETE FROM verification_tokens WHERE user_id/, params: [user.id] },
    { sql: /DELETE FROM sessions WHERE user_id/, params: [user.id] },
  ];
  const { res, data } = await request('/otp/verify', { body: { code: '111111' }, session: true });
  assert.equal(res.status, 200);
  assert.equal(data.requiresLogin, true);
  assert.equal(data.user, undefined);
  assert.equal(data.token, undefined);
  assert.match(res.headers.get('set-cookie'), /sid=;/);
  steps = [session(null)];
  const expired = await request('/me', { session: true });
  assert.equal(expired.res.status, 401);
});

test('a concurrently consumed or expired OTP cannot complete registration again', async () => {
  steps=[session(),{sql:/SELECT \* FROM users WHERE id=\$1 FOR UPDATE/,rows:[user]},{sql:/FROM verification_tokens WHERE user_id/,rows:[]}];
  const {res}=await request('/otp/verify',{body:{code:'111111'},session:true});assert.equal(res.status,400);
});

test('fully verified account can log in normally and receive a new session', async () => {
  const password = 'Synthetic123!';
  steps = [{ sql: /SELECT \* FROM users/, rows: [{ ...user, mobile_verified: true, password_hash: await hashPassword(password) }] }, { sql: /UPDATE users SET failed_login_attempts = 0/ }, { sql: /SELECT \* FROM users WHERE id=\$1 FOR SHARE/, rows: [{ ...user, mobile_verified:true, password_hash: '' }] }, { sql: /INSERT INTO sessions/, check: p => assert.equal(p[1], user.id) }, { sql: /INSERT INTO audit_logs/, check: p => { assert.equal(p[1], 'owner'); assert.match(p[2], /Signed in/); } }];
  steps[2].rows = steps[0].rows;
  const { res, data } = await request('/login', { body: { email: user.email, password } });
  assert.equal(res.status, 200);
  assert.equal(data.user.id, user.id);
  assert.ok(data.token);
});

// Delivery bodies contain activation links and OTPs and must never be public.
test('development outbox is unavailable to anonymous and authenticated callers', async () => {
  for (const hasSession of [false, true]) {
    const { res, data } = await request('/outbox', { session: hasSession });
    assert.equal(res.status, 404);
    assert.equal(data.outbox, undefined);
  }
});


test('inactive account cannot sign in or use an existing session', async () => {
  steps=[{sql:/SELECT \* FROM users/,rows:[{...user,is_active:false}]}];
  assert.equal((await request('/login',{body:{email:user.email,password:'Synthetic123!'}})).res.status,403);
  steps=[session({...user,mobile_verified:true,is_active:false})];
  assert.equal((await request('/me',{session:true})).res.status,403);
});
test('invitation response preserves the admin login token and reports provider status', async () => {
  steps=[session({...user,role:'admin',mobile_verified:true}),{sql:/SELECT id FROM users/,rows:[]},{sql:/INSERT INTO staff_invitations/},{sql:/INSERT INTO audit_logs/}];
  const result=await request('/staff/invite',{session:true,body:{name:'Synthetic Staff',email:'staff@example.test',role:'vet'}});
  assert.equal(result.res.status,200);assert.equal(result.data.token,undefined);assert.match(result.data.inviteLink,/\?invite=/);assert.equal(result.data.delivery,'accepted');
});

test('a second clinic administrator can be invited, but only with explicit confirmation', async () => {
  const admin = session({...user,role:'admin',mobile_verified:true});
  const body = {name:'Maria Dela Cruz',email:'second.admin@example.test',role:'admin'};
  steps=[admin];
  const unconfirmed = await request('/staff/invite',{session:true,body});
  assert.equal(unconfirmed.res.status,400);assert.match(unconfirmed.data.error,/Confirm/);assert.equal(steps.length,0,'nothing is written before the confirmation');
  steps=[admin,{sql:/to_regclass/,rows:[{migrations:'pawcare_schema_migrations'}]},{sql:/staff-access-v1|SELECT version/,rows:[{version:'x'}]},{sql:/SELECT version/,rows:[{version:'x'}]},
    {sql:/SELECT id FROM users/,rows:[]},{sql:/INSERT INTO staff_invitations/,check:params=>assert.equal(params[2],'admin')},{sql:/INSERT INTO audit_logs/,check:params=>assert.match(params[2],/FULL ADMINISTRATOR access/)}];
  const confirmed = await request('/staff/invite',{session:true,body:{...body,confirmAdmin:true}});
  assert.equal(confirmed.res.status,200);assert.match(sentMail.at(-1)[1],/Clinic Administrator/);
});
test('only an administrator can invite staff, and unknown roles are refused', async () => {
  steps=[session({...user,role:'assistant',mobile_verified:true})];
  assert.equal((await request('/staff/invite',{session:true,body:{name:'Someone Else',email:'x@example.test',role:'admin',confirmAdmin:true}})).res.status,403);
  steps=[session({...user,role:'admin',mobile_verified:true})];
  assert.equal((await request('/staff/invite',{session:true,body:{name:'Someone Else',email:'x@example.test',role:'owner'}})).res.status,400);
});

test('a login using a credential snapshot from before reset cannot create a new session',async()=>{
 const password='Synthetic123!',snapshot={...user,mobile_verified:true,password_hash:await hashPassword(password)};
 steps=[{sql:/SELECT \* FROM users/,rows:[snapshot]},{sql:/UPDATE users SET failed_login_attempts = 0/},{sql:/SELECT \* FROM users WHERE id=\$1 FOR SHARE/,rows:[{...snapshot,password_hash:'changed-after-recovery'}]}];
 const result=await request('/login',{body:{email:user.email,password}});assert.equal(result.res.status,401);assert.equal(result.data.token,undefined);assert.equal(result.res.headers.get('set-cookie'),null);
});

test('a lock applied after password verification prevents session creation',async()=>{
 const password='Synthetic123!',snapshot={...user,mobile_verified:true,password_hash:await hashPassword(password)};
 steps=[{sql:/SELECT \* FROM users/,rows:[snapshot]},{sql:/UPDATE users SET failed_login_attempts = 0/},{sql:/SELECT \* FROM users WHERE id=\$1 FOR SHARE/,rows:[{...snapshot,is_locked:true}]}];
 const result=await request('/login',{body:{email:user.email,password}});
 assert.equal(result.res.status,401);assert.equal(result.data.token,undefined);assert.equal(result.res.headers.get('set-cookie'),null);
});
