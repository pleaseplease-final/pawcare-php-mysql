import { test } from 'node:test';
import assert from 'node:assert/strict';
import { samePet, findDuplicatePet, duplicatePetMessage, ownerContactConflicts, phoneKey, sameDose } from '../src/duplicateRules.js';
import { paymentErrors } from '../src/formValidation.js';

const pets = [
  { id: 'p1', ownerId: 'o1', name: 'Toby', species: 'Canine (Dog)', birth: '2019-05-01' },
  { id: 'p2', ownerId: 'o2', name: 'Toby', species: 'Dog', birth: '2019-05-01' },
];

test('the same name, species and birth date for one owner is a duplicate', () => {
  assert.ok(samePet(pets[0], { name: ' toby ', species: 'Canine (Dog)', birth: '2019-05-01' }));
  assert.equal(findDuplicatePet(pets, { ownerId: 'o1', name: 'TOBY', species: 'Dog', birth: '2019-05-01' })?.id, 'p1');
});

test('legacy and current species labels match, different species do not', () => {
  assert.ok(samePet(pets[0], pets[1]));
  assert.equal(findDuplicatePet(pets, { ownerId: 'o1', name: 'Toby', species: 'Feline (Cat)', birth: '2019-05-01' }), null);
});

test('another owner, another birth date, or the pet being edited is not a duplicate', () => {
  assert.equal(findDuplicatePet(pets, { ownerId: 'o3', name: 'Toby', species: 'Dog', birth: '2019-05-01' }), null);
  assert.equal(findDuplicatePet(pets, { ownerId: 'o1', name: 'Toby', species: 'Dog', birth: '2020-05-01' }), null);
  assert.equal(findDuplicatePet(pets, { ownerId: 'o1', name: 'Toby', species: 'Dog', birth: '2019-05-01' }, 'p1'), null);
  assert.match(duplicatePetMessage(pets[0]), /Toby \(Canine, born 2019-05-01\) is already registered/);
});

test('phone numbers match across 09 and +639 forms', () => {
  assert.equal(phoneKey('0917 123 4567'), phoneKey('+63 917-123-4567'));
  const owners = [{ id: 'o1', name: 'Ana', phone: '09171234567', email: 'Ana@Example.com' }, { id: 'o2', name: 'Ben', phone: '09998887777', email: '' }];
  const clash = ownerContactConflicts(owners, { phone: '+639171234567', email: 'ana@example.com' }, 'o2');
  assert.equal(clash.phone?.id, 'o1');
  assert.equal(clash.email?.id, 'o1');
  assert.deepEqual(ownerContactConflicts(owners, { phone: '09171234567', email: 'ana@example.com' }, 'o1'), { phone: null, email: null });
  assert.deepEqual(ownerContactConflicts(owners, { phone: '', email: '' }), { phone: null, email: null });
});

test('a vaccine given twice to one pet on one date is the same dose', () => {
  assert.ok(sameDose({ petId: 'p1', vaccine: 'Rabies', date: '2026-10-01' }, { petId: 'p1', vaccine: 'rabies ', date: '2026-10-01' }));
  assert.ok(!sameDose({ petId: 'p1', vaccine: 'Rabies', date: '2026-10-01' }, { petId: 'p1', vaccine: 'Rabies', date: '2026-10-02' }));
});

test('a digital payment reference cannot settle two invoices', () => {
  const base = { items: [{ source: 'performed', name: 'Consultation', price: 500, qty: 1 }], cashTendered: '', method: 'GCash', prescribed: [] };
  assert.equal(paymentErrors({ ...base, refNo: 'GC123456' }).refNo, '');
  assert.match(paymentErrors({ ...base, refNo: ' gc123456 ', usedReferences: ['gc123456'] }).refNo, /already used/);
  assert.equal(paymentErrors({ ...base, refNo: 'GC999999', usedReferences: ['gc123456'] }).refNo, '');
});
