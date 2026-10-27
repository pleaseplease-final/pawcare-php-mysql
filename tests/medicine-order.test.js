import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OTHER, MEDICINE_ROUTES, MEDICINE_FREQUENCIES, MEDICINE_DOSE_UNITS, medicineNameError, doseAmountError, doseError, orderParts, orderFieldErrors } from '../src/medicineOrder.js';
import { medicineErrors } from '../src/formValidation.js';
import { admissionInput } from '../server/admissions.js';

test('a medicine, route or schedule must be words, not just numbers', () => {
  for (const bad of ['', '   ', '646546', '5354', '534543', '!!', '--', 'A', '12 34', '#Medicine', 'x'.repeat(201)]) assert.ok(medicineNameError(bad), JSON.stringify(bad));
  for (const good of ['Metronidazole', 'Vitamin C (Sodium Ascorbate)', 'Omega-3 Fish Oil (EPA/DHA)', 'Twice daily (every 12 hours)', 'Maropitant 10 mg']) assert.equal(medicineNameError(good), '', good);
  assert.match(medicineNameError('646546'), /letters/);
  assert.match(medicineNameError('x'.repeat(201), 'Route', 100), /at most 100/);
});

test('the dose amount is a positive number with at most four decimals', () => {
  for (const bad of ['', 'abc', '2,5', '-1', '0', '0.0', '10000.01', '2.12345', '1e3', '2.']) assert.ok(doseAmountError(bad), JSON.stringify(bad));
  for (const good of ['2.5', '0.25', '1', '10000', '0.0001']) assert.equal(doseAmountError(good), '', good);
});

test('the whole dose needs an amount and a unit', () => {
  assert.match(doseError('45'), /unit/);
  assert.match(doseError('45334'), /10,000/, 'a typo-sized amount is refused');
  for (const bad of ['', '   ', 'two tablets', '0 mL', '2.12345 mL', '10001 mg', '5 5']) assert.ok(doseError(bad), JSON.stringify(bad));
  for (const good of ['2.5 mL', '2.5mL', '1 tablet', '1 vet-entered unit', '250 mg']) assert.equal(doseError(good), '', good);
});

test('choices build the saved medicine, dose, route and schedule', () => {
  const catalog = [{ id: 'srv_nexgard', name: 'NexGard Spectra Chewable Tablet' }];
  const form = { medicineChoice: 'srv_nexgard', doseAmount: ' 2.5 ', doseUnit: 'mL', routeChoice: 'iv', frequencyChoice: 'bid' };
  assert.deepEqual(orderParts(form, catalog), { medicine: 'NexGard Spectra Chewable Tablet', dose: '2.5 mL', route: 'Intravenous (IV)', frequency: 'Twice daily (every 12 hours)' });
  const other = { medicineChoice: OTHER, medicineOther: '  Metronidazole  ', doseAmount: '1', doseUnit: 'tablet', routeChoice: OTHER, routeOther: 'Nebulized', frequencyChoice: OTHER, frequencyOther: 'Every 36 hours' };
  assert.deepEqual(orderParts(other, catalog), { medicine: 'Metronidazole', dose: '1 tablet', route: 'Nebulized', frequency: 'Every 36 hours' });
  assert.equal(orderParts({}, catalog).dose, '', 'no dose until both the amount and the unit are chosen');
});

test('every control explains itself while the person fills it in', () => {
  const catalog = [{ id: 'srv_nexgard', name: 'NexGard' }];
  const empty = orderFieldErrors({}, catalog);
  for (const key of ['medicineChoice', 'doseAmount', 'doseUnit', 'routeChoice', 'frequencyChoice']) assert.ok(empty[key], key);
  const garbage = orderFieldErrors({ medicineChoice: OTHER, medicineOther: '646546', doseAmount: '45334x', doseUnit: '', routeChoice: OTHER, routeOther: '5354', frequencyChoice: OTHER, frequencyOther: '534543' }, catalog);
  for (const key of ['medicineOther', 'doseAmount', 'doseUnit', 'routeOther', 'frequencyOther']) assert.ok(garbage[key], key);
  assert.equal(orderFieldErrors({ medicineChoice: 'not-in-the-list' }, catalog).medicineChoice, 'Choose a medicine from the list.');
  const ok = orderFieldErrors({ medicineChoice: 'srv_nexgard', doseAmount: '1', doseUnit: 'tablet', routeChoice: 'oral', frequencyChoice: 'daily' }, catalog);
  assert.ok(Object.values(ok).every(v => v === ''), JSON.stringify(ok));
  assert.ok(MEDICINE_ROUTES.length && MEDICINE_FREQUENCIES.length && MEDICINE_DOSE_UNITS.includes('mL'));
});

test('the combined order check rejects the numbers-only entries from the form', () => {
  const ctx = { action: 'order' };
  const errors = medicineErrors({ medicine: '646546', dose: '45334', route: '5354', frequency: '534543', clinicalNote: 'Reason', catalogId: '', supplyLimit: '0' }, ctx);
  for (const key of ['medicine', 'dose', 'route', 'frequency']) assert.ok(errors[key], key);
  const fine = medicineErrors({ medicine: 'Metronidazole', dose: '1 tablet', route: 'By mouth (oral)', frequency: 'Once daily', clinicalNote: 'Reason', catalogId: '', supplyLimit: '0' }, ctx);
  for (const key of ['medicine', 'dose', 'route', 'frequency']) assert.equal(fine[key], '', key);
});

test('the server applies the same rules to a medicine order', () => {
  const body = { requestId: crypto.randomUUID(), revision: 1, clinicalNote: 'Reason', medicine: 'Metronidazole', dose: '1 tablet', route: 'By mouth (oral)', frequency: 'Once daily' };
  const data = admissionInput(body, 'order', 'vet');
  assert.equal(data.medicine, 'Metronidazole'); assert.equal(data.dose, '1 tablet'); assert.equal(data.supplyLimit, 0);
  assert.equal(admissionInput({ ...body, medicine: '  Metronidazole   B  ', dose: '2.5   mL' }, 'order', 'vet').dose, '2.5 mL', 'extra spaces are tidied');
  for (const [field, value, pattern] of [['medicine', '646546', /letters/], ['dose', '45334', /10,000/], ['dose', '45', /unit/], ['route', '5354', /letters/], ['frequency', '534543', /letters/], ['dose', 'a lot', /amount/], ['medicine', 42, /required/]])
    assert.throws(() => admissionInput({ ...body, [field]: value }, 'order', 'vet'), pattern, `${field}=${value}`);
});
