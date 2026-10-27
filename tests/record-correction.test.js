import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ownerDetailErrors, petDetailErrors, changedFields, phoneKey } from '../src/recordCorrection.js';

const owner = { name: 'Maria Santos', phone: '09171234567', email: 'maria@example.com', address: '12 Rizal Street, Quezon City' };
const pet = { name: 'Biscuit', breed: 'Shih Tzu', sex: 'Female', birth: '2021-03-04', color: 'Brown & White', neutered: 'Yes', notes: '' };

test('a correct owner record passes and optional fields may be blank', () => {
  assert.deepEqual(ownerDetailErrors(owner), {});
  assert.deepEqual(ownerDetailErrors({ ...owner, email: '', address: '' }), {});
});

test('owner fields are checked as the user types', () => {
  assert.match(ownerDetailErrors({ ...owner, name: '' }).name, /full name/);
  assert.ok(ownerDetailErrors({ ...owner, name: 'Maria 123' }).name);
  assert.ok(ownerDetailErrors({ ...owner, name: 'M' }).name);
  assert.ok(ownerDetailErrors({ ...owner, phone: '12345' }).phone);
  assert.deepEqual(ownerDetailErrors({ ...owner, phone: '+63 917-123-4567' }), {});
  assert.ok(ownerDetailErrors({ ...owner, email: 'not-an-email' }).email);
  assert.ok(ownerDetailErrors({ ...owner, address: '123' }).address);
});

test('phone numbers compare without spaces or dashes', () => {
  assert.equal(phoneKey('0917 123-4567'), '09171234567');
});

test('a correct patient record passes', () => {
  assert.deepEqual(petDetailErrors(pet, '2026-10-27'), {});
  assert.deepEqual(petDetailErrors({ ...pet, breed: '', color: '' }, '2026-10-27'), {});
});

test('patient birth dates must be real, past and not before 1990', () => {
  assert.ok(petDetailErrors({ ...pet, birth: '' }, '2026-10-27').birth);
  assert.ok(petDetailErrors({ ...pet, birth: '2021-02-31' }, '2026-10-27').birth);
  assert.match(petDetailErrors({ ...pet, birth: '2030-01-01' }, '2026-10-27').birth, /future/);
  assert.match(petDetailErrors({ ...pet, birth: '1980-01-01' }, '2026-10-27').birth, /1990/);
});

test('patient choices and lengths are enforced', () => {
  assert.ok(petDetailErrors({ ...pet, sex: 'Unknown' }, '2026-10-27').sex);
  assert.ok(petDetailErrors({ ...pet, neutered: 'Maybe' }, '2026-10-27').neutered);
  assert.ok(petDetailErrors({ ...pet, name: '###' }, '2026-10-27').name);
  assert.ok(petDetailErrors({ ...pet, name: 'A'.repeat(31) }, '2026-10-27').name);
  assert.ok(petDetailErrors({ ...pet, notes: 'x'.repeat(301) }, '2026-10-27').notes);
});

test('only edited fields are reported as changes', () => {
  assert.deepEqual(changedFields(pet, { ...pet, name: 'Biscuit  ' }, Object.keys(pet)), []);
  assert.deepEqual(changedFields(pet, { ...pet, name: 'Bisky', notes: 'Shy' }, Object.keys(pet)), ['name', 'notes']);
});
