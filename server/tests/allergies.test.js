import { after, beforeEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {allergyEntryError, allergyListError} from '../../src/allergyRules.js';

let pet, activeVisit, audits;
async function query(sql, params = []) {
  const text = sql.replace(/\s+/g, ' ');
  if (/FROM pets WHERE id = \$1 FOR UPDATE/.test(text)) return {rows: pet && params[0] === pet.id ? [pet] : []};
  if (/FROM appointments WHERE pet_id/.test(text)) return {rows: activeVisit ? [{}] : []};
  if (/UPDATE pets SET allergies/.test(text)) { pet.allergies = params[1]; return {rows: []}; }
  if (/INSERT INTO audit_logs/.test(text)) { audits.push(params[2]); return {rows: []}; }
  throw new Error(`Unexpected SQL: ${text}`);
}
mock.module('../db.js', {namedExports: {query, withTransaction: async fn => fn({query})}});
const {saveAllergies} = await import('../allergies.js');
let user;
const app = express();
app.use(express.json());
app.use((req, res, next) => { req.user = user; next(); });
app.put('/pets/:id/allergies', saveAllergies);
const server = app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
after(() => new Promise(resolve => server.close(resolve)));
beforeEach(() => { pet = {id: 'p1', name: 'Mochi', allergies: ['Chicken']}; activeVisit = true; audits = []; user = {id: 'u1', vetId: 'v1', name: 'Dr. Ana', role: 'vet'}; });
const put = async (body, id = 'p1') => { const res = await fetch(`http://127.0.0.1:${server.address().port}/pets/${id}/allergies`, {method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)}); return {status: res.status, data: await res.json()}; };

test('allergy rules explain each problem', () => {
  assert.equal(allergyEntryError('Penicillin', ['Chicken']), '');
  assert.match(allergyEntryError('', []), /Enter/);
  assert.match(allergyEntryError('x', []), /2 characters/);
  assert.match(allergyEntryError('1234', []), /name/);
  assert.match(allergyEntryError('<b>', []), /name/);
  assert.match(allergyEntryError('CHICKEN', ['chicken']), /already/);
  assert.match(allergyEntryError('Pollen', Array.from({length: 10}, (_, i) => `Item ${i}`)), /up to 10/);
  assert.equal(allergyListError(['A1', 'B2']), '');
  assert.ok(allergyListError('Chicken') && allergyListError([1]) && allergyListError(['Beef', 'beef']));
});
test('a vet can update allergies during an active visit and the change is audited', async () => {
  const saved = await put({allergies: ['Chicken', '  Penicillin  '], expected: ['Chicken']});
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.data.allergies, ['Chicken', 'Penicillin']);
  assert.deepEqual(pet.allergies, ['Chicken', 'Penicillin']);
  assert.match(audits[0], /Updated allergies for Mochi.*Penicillin.*before: Chicken/);
});
test('a vet without an active visit with the patient is refused', async () => {
  activeVisit = false;
  assert.equal((await put({allergies: ['Chicken', 'Beef'], expected: ['Chicken']})).status, 403);
  assert.deepEqual(pet.allergies, ['Chicken']);
});
test('front desk staff may update without an active visit', async () => {
  user = {id: 'u2', name: 'Assistant', role: 'assistant'}; activeVisit = false;
  assert.equal((await put({allergies: [], expected: ['Chicken']})).status, 200);
  assert.deepEqual(pet.allergies, []);
});
test('invalid lists, stale lists and unknown pets are refused without changing anything', async () => {
  assert.equal((await put({allergies: ['Beef', 'beef'], expected: ['Chicken']})).status, 400);
  assert.equal((await put({allergies: 'Beef', expected: ['Chicken']})).status, 400);
  assert.equal((await put({allergies: ['Beef'], expected: ['Fish']})).status, 409, 'someone else changed the list');
  assert.equal((await put({allergies: ['Beef']})).status, 409, 'the list on screen is required');
  assert.equal((await put({allergies: ['Beef'], expected: ['Chicken']}, 'missing')).status, 404);
  assert.deepEqual(pet.allergies, ['Chicken']);
  assert.equal(audits.length, 0);
});
