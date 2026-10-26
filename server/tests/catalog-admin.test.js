import { after, beforeEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

// A small in-memory stand-in for the catalog table, so the real routes and SQL strings run.
let table = new Map(), audits = [];
async function query(sql, params = []) {
  const text = sql.replace(/\s+/g, ' ');
  if (/to_regclass/.test(text)) return {rows: [{migrations: 'pawcare_schema_migrations'}]};
  if (/FROM pawcare_schema_migrations/.test(text)) return {rows: [{version: 'clinic-catalog-v1'}]};
  if (/pg_advisory_xact_lock/.test(text)) return {rows: []};
  if (/INSERT INTO audit_logs/.test(text)) { audits.push(params[2]); return {rows: []}; }
  if (/SELECT \* FROM clinic_catalog_items WHERE id=\$1 FOR UPDATE/.test(text)) return {rows: table.has(params[0]) ? [table.get(params[0])] : []};
  if (/SELECT \* FROM clinic_catalog_items/.test(text)) return {rows: [...table.values()]};
  if (/INSERT INTO clinic_catalog_items \(id,name,category,price,unit,description,updated_by\)/.test(text)) {
    if ([...table.values()].some(row => row.name.toLowerCase() === params[1].toLowerCase())) throw Object.assign(new Error('duplicate'), {code: '23505'});
    table.set(params[0], {id: params[0], name: params[1], category: params[2], price: String(params[3]), unit: params[4], description: params[5], active: true, built_in: false, previous_prices: [], revision: 0, updated_by: params[6]});
    return {rows: []};
  }
  if (/INSERT INTO clinic_catalog_items \(id,name,category,price,unit,description,active,built_in/.test(text)) {
    table.set(params[0], {id: params[0], name: params[1], category: params[2], price: String(params[3]), unit: params[4], description: params[5], active: params[6], built_in: true, previous_prices: params[7], revision: 1, updated_by: params[8]});
    return {rows: []};
  }
  if (/UPDATE clinic_catalog_items SET price=\$2/.test(text)) {
    const row = table.get(params[0]);
    Object.assign(row, {price: String(params[1]), unit: params[2], description: params[3], active: params[4], previous_prices: params[5], revision: row.revision + 1, updated_by: params[6]});
    return {rows: []};
  }
  throw new Error(`Unexpected SQL: ${text}`);
}
mock.module('../db.js', {namedExports: {query, withTransaction: async fn => fn({query})}});
mock.module('../staffAccess.js', {namedExports: {ensureStaffAccessSchema: async () => {}}});
mock.module('../admissions.js', {namedExports: {ensureAdmissionsSchema: async () => {}}});
const {adminRouter} = await import('../routes/admin.js');
const {priceCatalog, canonicalInvoice} = await import('../priceCatalog.js');
const {resetManagedCatalog} = await import('../clinicCatalog.js');
let role = 'admin';
const app = express();
app.use(express.json());
app.use((req, res, next) => { req.user = {name: 'Test Admin', role}; next(); });
app.use('/api/admin', adminRouter);
const server = app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
after(() => new Promise(resolve => server.close(resolve)));
beforeEach(() => { table = new Map(); audits = []; role = 'admin'; resetManagedCatalog(); });
async function request(method, path, body) {
  const res = await fetch(`http://127.0.0.1:${server.address().port}/api/admin${path}`, {method, headers: {'Content-Type': 'application/json'}, ...(body ? {body: JSON.stringify(body)} : {})});
  return {status: res.status, data: await res.json()};
}
const good = {name: 'Joint chews', category: 'Pet vitamins', price: '250.50', unit: 'item / package', description: 'Daily chew'};

test('only administrators reach the price list', async () => {
  role = 'assistant';
  assert.equal((await request('GET', '/catalog')).status, 403);
  assert.equal((await request('POST', '/catalog', good)).status, 403);
});
test('the list shows built-in items and anything added', async () => {
  const {data} = await request('GET', '/catalog');
  assert.ok(data.items.length > 20);
  const consult = data.items.find(i => i.id === 'srv_consult');
  assert.deepEqual([consult.kind, consult.active, consult.builtIn, consult.price], ['service', true, true, 500]);
});
test('adding validates on the server, blocks duplicates and records an audit entry', async () => {
  const bad = await request('POST', '/catalog', {...good, name: '', price: '12.345', category: 'Furniture'});
  assert.equal(bad.status, 400);
  assert.ok(bad.data.errors.name && bad.data.errors.price && bad.data.errors.category);
  const added = await request('POST', '/catalog', good);
  assert.equal(added.status, 201);
  assert.equal(added.data.item.id, 'product_joint_chews');
  assert.equal(priceCatalog().find(i => i.id === 'product_joint_chews').price, 250.5);
  assert.match(audits.at(-1), /Added price list item product_joint_chews/);
  const again = await request('POST', '/catalog', {...good, name: 'JOINT chews'});
  assert.equal(again.status, 400);
  assert.ok(again.data.errors.name);
  assert.equal((await request('POST', '/catalog', {...good, name: 'Routine General Consultation & Exam'})).status, 400, 'built-in names are protected too');
});
test('repricing keeps the earlier price valid for visits already recorded', async () => {
  const edit = await request('PUT', '/catalog/srv_consult', {price: '650', unit: 'visit', description: '', active: true, revision: 0});
  assert.equal(edit.status, 200);
  assert.equal(edit.data.item.price, 650);
  const line = price => ({catalogId: 'srv_consult', name: 'Routine General Consultation & Exam', price, qty: 1, source: 'performed'});
  const catalog = priceCatalog({includeRetired: true});
  assert.equal(canonicalInvoice([line(500)], catalog)[0].price, 500);
  assert.equal(canonicalInvoice([line(650)], catalog)[0].price, 650);
  assert.equal(canonicalInvoice([line(700)], catalog), null);
  assert.match(audits.at(-1), /price ₱500\.00 to ₱650\.00/);
  const stale = await request('PUT', '/catalog/srv_consult', {price: '700', unit: 'visit', description: '', active: true, revision: 0});
  assert.equal(stale.status, 409, 'a stale revision is refused');
  assert.equal((await request('PUT', '/catalog/srv_consult', {price: '700', unit: 'visit', description: '', active: true, revision: 1})).status, 200);
});
test('products can be retired and restored; clinical services cannot be retired', async () => {
  const blocked = await request('PUT', '/catalog/srv_consult', {price: '500', unit: 'visit', description: '', active: false, revision: 0});
  assert.equal(blocked.status, 400);
  assert.match(blocked.data.error, /cannot be retired/);
  const retired = await request('PUT', '/catalog/product_probiotic', {price: '750', unit: 'item / package', description: '', active: false, revision: 0});
  assert.equal(retired.status, 200);
  assert.equal(retired.data.item.active, false);
  assert.ok(!priceCatalog().some(i => i.id === 'product_probiotic'), 'retired items are not offered');
  const old = {catalogId: 'product_probiotic', name: 'Veterinary Probiotic & Prebiotic Paste', price: 750, qty: 1};
  assert.ok(canonicalInvoice([old], priceCatalog({includeRetired: true})), 'but they stay billable on visits that carry them');
  assert.equal((await request('PUT', '/catalog/product_probiotic', {price: '750', unit: 'item / package', description: '', active: true, revision: 1})).status, 200);
  assert.ok(priceCatalog().some(i => i.id === 'product_probiotic'));
  assert.equal((await request('PUT', '/catalog/not_real', {price: '1', unit: 'x', description: '', active: true, revision: 0})).status, 404);
  assert.equal((await request('PUT', '/catalog/product_probiotic', {price: '-1', unit: 'x', description: '', active: true, revision: 2})).status, 400);
});
