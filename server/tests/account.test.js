import { after, beforeEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import cookieParser from 'cookie-parser';
import { hashPassword, verifyPassword, sha256 } from '../security.js';

let steps = [];
async function query(sql, params = []) {
  const step = steps.shift();
  assert.ok(step, `Unexpected SQL: ${sql}`);
  assert.match(sql.replace(/\s+/g, ' '), step.sql);
  if (step.params) assert.deepEqual(params, step.params);
  if (step.check) await step.check(params);
  if (step.error) throw step.error;
  return { rows: step.rows || [] };
}
mock.module('../db.js', { namedExports: { query, withTransaction: async fn => fn({ query }) } });
mock.module('../services.js', { namedExports: { sendMail: async () => {}, sendSms: async () => {}, serverOutbox: [] } });
const { accountRouter } = await import('../routes/account.js');
const app = express();
app.use(express.json({ limit: '10mb' }), cookieParser());
app.use('/api/auth', accountRouter);
const server = app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
after(() => new Promise(resolve => server.close(resolve)));
beforeEach(() => { steps = []; });
const sid = 'synthetic-account-session';
const user = role => ({ id: `test-${role}`, first_name: 'Test', last_name: 'Account', role, email: `${role}@example.test`, mobile_number: '+639170000001', birthday: '1990-01-02', email_verified_at: '2026-10-24', mobile_verified: true });
const session = (role = 'vet') => ({ sql: /FROM sessions s JOIN users u/, params: [sha256(sid)], rows: [user(role)] });
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB1sAAAAASUVORK5CYII=';
async function request(path, body, signedIn = true) {
  const res = await fetch(`http://127.0.0.1:${server.address().port}/api/auth${path}`, {
    method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...(signedIn ? { Authorization: `Bearer ${sid}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await res.json();
  assert.equal(steps.length, 0, 'All expected queries ran');
  return { status: res.status, data };
}

test('account endpoints reject missing/expired/unverified sessions before writes', async () => {
  for (const [path, body] of [['/profile'], ['/profile/photo', { photo: png }], ['/profile/contact', {}], ['/password', {}]]) {
    assert.equal((await request(path, body, false)).status, 401);
  }
  steps = [{ ...session(), rows: [] }];
  assert.equal((await request('/profile')).status, 401);
  steps = [{ ...session(), rows: [{ ...user('vet'), mobile_verified: false }] }];
  assert.equal((await request('/profile/photo', { photo: png })).status, 403);
});
test('profile initializes persistent storage and reads only the authenticated account', async () => {
  steps = [session(), { sql: /CREATE TABLE IF NOT EXISTS account_photos/ }, { sql: /SELECT photo FROM account_photos WHERE user_id = \$1/, params: ['test-vet'], rows: [{ photo: png }] }];
  const result = await request('/profile');
  assert.equal(result.status, 200);
  assert.equal(result.data.profile.photo, png);
  assert.equal(result.data.profile.id, 'test-vet');
  assert.equal(result.data.profile.birthday, '1990-01-02');
  assert.equal(result.data.profile.password_hash, undefined);
});
for (const role of ['owner', 'assistant', 'vet', 'admin']) {
  test(`${role} saves and removes only their own photo, ignoring supplied account IDs`, async () => {
    for (const photo of [png, '']) {
      steps = [session(role), { sql: /INSERT INTO account_photos .*ON CONFLICT/, params: [`test-${role}`, photo] }];
      const result = await request('/profile/photo', { photo, userId: 'someone-else' });
      assert.equal(result.status, 200);
      assert.equal(result.data.photo, photo);
    }
  });
}
test('invalid and oversized pictures are rejected without a write', async () => {
  for (const photo of [null, 'https://example.test/image.jpg', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,aGVsbG8=', 'x'.repeat(700001)]) {
    steps = [session()];
    assert.equal((await request('/profile/photo', { photo })).status, 400);
  }
});
test('photo storage errors return a failure instead of success', async () => {
  steps = [session(), { sql: /INSERT INTO account_photos/, error: new Error('synthetic failure') }];
  assert.equal((await request('/profile/photo', { photo: png })).status, 500);
});
for (const role of ['owner', 'assistant', 'vet', 'admin']) {
  test(`${role} saves address without changing trusted contacts`, async () => {
    steps = [session(role), ...(role === 'owner' ? [{sql:/CREATE TABLE IF NOT EXISTS account_contact_changes/}] : []),
      {sql:/SELECT \* FROM users WHERE id=.*FOR UPDATE/,rows:[user(role)]},
      {sql:/UPDATE users SET email=/,params:[`${role}@example.test`,'+639170000001',`test-${role}`,false,false]},
      {sql:/SELECT id FROM addresses/,rows:[]},
      {sql:/INSERT INTO addresses/,params:['12 Test Street','Philippines','Test City','Test State','1000',`test-${role}`]}];
    if(role==='owner')steps.push({sql:/UPDATE owners SET email=/,check:p=>assert.equal(p[3],'test-owner')});
    steps.push({sql:/DELETE FROM account_contact_changes/,params:[`test-${role}`]},{sql:/INSERT INTO audit_logs/});
    const result = await request('/profile/contact', {email:`${role}@example.test`,phone:'+63 917 000 0001',houseStreet:'12 Test Street',city:'Test City',state:'Test State',country:'Philippines',zipCode:'1000',userId:'someone-else'});
    assert.equal(result.status,200);assert.equal(result.data.profile.email,`${role}@example.test`);assert.equal(result.data.profile.id,`test-${role}`);
  });
}
test('invalid contact fields and duplicate email report field errors',async()=>{
 steps=[session()];assert.equal((await request('/profile/contact',{email:'bad',phone:'abc'})).status,400);
 steps=[session(),{sql:/SELECT \* FROM users WHERE id=.*FOR UPDATE/,rows:[user('vet')]},{sql:/SELECT id FROM users WHERE LOWER\(email\)=/,rows:[{id:'other'}]}];
 const duplicate=await request('/profile/contact',{email:'duplicate@example.test',phone:'+639170000002',houseStreet:'12 Test Street',city:'Test City',state:'Test State',country:'Philippines',zipCode:'1000'});
 assert.equal(duplicate.status,409);assert.ok(duplicate.data.errors.email);
});
test('weak, unchanged and mismatched passwords are rejected', async () => {
  for (const body of [{ cur: 'old', next: 'weak', conf: 'weak' }, { cur: 'SamePassword12!', next: 'SamePassword12!', conf: 'SamePassword12!' }, { cur: 'old', next: 'NewPassword12!', conf: 'different' }]) {
    steps = [session()];
    assert.equal((await request('/password', body)).status, 400);
  }
});
test('wrong current password cannot update the stored hash', async () => {
  steps = [session(), { sql: /SELECT password_hash FROM users .*FOR UPDATE/, params: ['test-vet'], rows: [{ password_hash: await hashPassword('OriginalPassword12!') }] }];
  const result = await request('/password', { cur: 'WrongPassword12!', next: 'NewPassword12!', conf: 'NewPassword12!' });
  assert.equal(result.status, 400);
  assert.ok(result.data.errors.cur);
});
test('password success hashes new password and revokes other sessions for this user', async () => {
  steps = [session('admin'), { sql: /SELECT password_hash FROM users .*FOR UPDATE/, rows: [{ password_hash: await hashPassword('OriginalPassword12!') }] }, { sql: /UPDATE users SET password_hash/, check: async p => { assert.equal(p[1], 'test-admin'); assert.notEqual(p[0], 'NewPassword12!'); assert.ok(await verifyPassword('NewPassword12!', p[0])); } }, { sql: /DELETE FROM sessions WHERE user_id = \$1 AND token_hash <> \$2/, params: ['test-admin', sha256(sid)] }];
  assert.equal((await request('/password', { cur: 'OriginalPassword12!', next: 'NewPassword12!', conf: 'NewPassword12!' })).status, 200);
});
