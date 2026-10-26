import { after, beforeEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

// An in-memory stand-in for the users table, so the real routes and SQL strings run.
let users, audits;
async function query(sql, params = []) {
  const text = sql.replace(/\s+/g, ' ');
  if (/pg_advisory_xact_lock/.test(text)) return {rows: []};
  if (/FROM users WHERE role IN \('vet','assistant','admin'\)/.test(text)) return {rows: users.filter(u => ['vet', 'assistant', 'admin'].includes(u.role))};
  if (/FROM staff_invitations/.test(text)) return {rows: []};
  if (/SELECT COUNT\(\*\)::int AS count FROM users/.test(text)) return {rows: [{count: users.length}]};
  if (/SELECT \* FROM users WHERE id = \$1 FOR UPDATE/.test(text)) return {rows: users.filter(u => u.id === params[0])};
  if (/SELECT 1 FROM users WHERE role='admin' AND is_active AND id<>\$1/.test(text)) return {rows: users.filter(u => u.role === 'admin' && u.is_active && u.id !== params[0]).map(() => ({}))};
  if (/UPDATE users SET is_active=\$2/.test(text)) { const u = users.find(x => x.id === params[0]); u.is_active = params[1]; u.access_revision++; return {rows: []}; }
  if (/DELETE FROM sessions/.test(text)) return {rows: []};
  if (/INSERT INTO audit_logs/.test(text)) { audits.push(params[2]); return {rows: []}; }
  throw new Error(`Unexpected SQL: ${text}`);
}
mock.module('../db.js', {namedExports: {query, withTransaction: async fn => fn({query})}});
mock.module('../staffAccess.js', {namedExports: {ensureStaffAccessSchema: async () => {}}});
mock.module('../admissions.js', {namedExports: {ensureAdmissionsSchema: async () => {}}});
const {adminRouter} = await import('../routes/admin.js');
const me = {id: 'a1', name: 'Clinic Admin', role: 'admin'};
const app = express();
app.use(express.json());
app.use((req, res, next) => { req.user = me; next(); });
app.use('/api/admin', adminRouter);
const server = app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
after(() => new Promise(resolve => server.close(resolve)));
const row = (id, role, extra = {}) => ({id, first_name: id, last_name: 'Test', email: `${id}@example.test`, role, vet_id: null, is_active: true, is_locked: false, lockout_until: null, mobile_verified: true, access_revision: 0, access_reason: '', ...extra});
beforeEach(() => { users = [row('a1', 'admin'), row('a2', 'admin'), row('v1', 'vet')]; audits = []; });
const call = async (method, path, body) => { const res = await fetch(`http://127.0.0.1:${server.address().port}/api/admin${path}`, {method, headers: {'Content-Type': 'application/json'}, ...(body ? {body: JSON.stringify(body)} : {})}); return {status: res.status, data: await res.json()}; };
const act = (id, action) => call('POST', `/staff/${id}/access`, {action, reason: 'Synthetic review', revision: 0});

test('the staff list includes administrators and marks the signed-in account', async () => {
  const {data} = await call('GET', '/staff');
  assert.deepEqual(data.staff.map(s => [s.id, s.role, s.self]).sort(), [['a1', 'admin', true], ['a2', 'admin', false], ['v1', 'vet', false]]);
});
test('an administrator can deactivate another administrator, with a reason in the audit trail', async () => {
  assert.equal((await act('a2', 'deactivate')).status, 200);
  assert.equal(users.find(u => u.id === 'a2').is_active, false);
  assert.match(audits.at(-1), /Staff access deactivate: a2 \(admin\).*Synthetic review/);
});
test('nobody can change their own access', async () => {
  const result = await act('a1', 'deactivate');
  assert.equal(result.status, 403);
  assert.match(result.data.error, /your own access/);
  assert.equal(users.find(u => u.id === 'a1').is_active, true);
});
test('the clinic always keeps at least one active administrator', async () => {
  users.find(u => u.id === 'a2').is_active = false;
  users = users.filter(u => u.id !== 'a1');
  users.push(row('a3', 'admin'));
  // The signed-in account (a1) no longer exists in the table, so a3 is the only admin left to protect.
  const result = await act('a3', 'deactivate');
  assert.equal(result.status, 409);
  assert.match(result.data.error, /At least one active administrator/);
});
test('owners and unknown accounts are not managed here', async () => {
  users.push(row('o1', 'owner'));
  assert.equal((await act('o1', 'deactivate')).status, 403);
  assert.equal((await act('missing', 'deactivate')).status, 403);
});
