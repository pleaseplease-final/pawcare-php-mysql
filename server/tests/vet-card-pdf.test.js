import test from 'node:test';
import assert from 'node:assert/strict';
import {vetCardPdf} from '../vetCardPdf.js';

const base = (events = [], pet = {}) => ({reference: 'DVC-test', revision: 2, snapshot: {pet: {name: 'Mochi', species: 'Canine', breed: 'Shih Tzu', sex: 'Male', birth: '2022-03-14', neutered: 'Yes', color: 'White', ...pet}, owner: {name: 'Cza Ybanez', address: '12 Rizal St, Makati', phone: '+639171234567', email: 'owner@gmail.com'}, events}});
const pages = bytes => (bytes.toString('latin1').match(/\/Type \/Page\b(?!s)/g) || []).length;
const dose = i => ({id: `v${i}`, kind: 'vaccination', date: `2025-0${1 + (i % 9)}-1${i % 9}`, vaccine: 'Anti-rabies', brand: 'Defensor 3', manufacturer: 'Zoetis', batch: `LOT-${i}`, serialNumber: `SN-${i}`, nextDue: `2026-0${1 + (i % 9)}-1${i % 9}`, vetName: 'Dr. Ana Cruz'});

test('an empty card still produces a complete one-page PDF', async () => {
  const bytes = await vetCardPdf(base());
  assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
  assert.equal(pages(bytes), 1);
});
test('a long record flows onto more pages without failing', async () => {
  const events = [...Array.from({length: 30}, (_, i) => dose(i)), {id: 'd', kind: 'deworming', date: '2026-01-01', vaccine: 'Deworming', brand: 'Canex', nextDue: '2026-04-01', vetName: 'Dr. Ben Lim'}, ...[12.1, 13.4, 14.2].map((value, i) => ({id: `w${i}`, kind: 'weight', date: `2026-0${i + 1}-01`, value}))];
  const bytes = await vetCardPdf(base(events), {clinic: {name: 'PawCare Veterinary Clinic', address: 'Manila', phone: '(02) 8123-4567', email: 'care@pawcare.ph', registration: 'BAI-1'}});
  assert.ok(pages(bytes) >= 3, `pages: ${pages(bytes)}`);
});
test('accents, very long values, a missing photo and an unreadable photo do not break the card', async () => {
  const pet = {name: 'Niño-José Ñandú', breed: 'Mixed '.repeat(30), color: 'x'.repeat(200)};
  const events = [{...dose(1), vaccine: 'Anti-rabies', brand: 'B'.repeat(120), vetName: 'Dr. Ñoño Peña'}];
  for (const photo of ['', 'data:image/webp;base64,AAAA', 'data:image/png;base64,not-a-real-image']) assert.equal((await vetCardPdf(base(events, pet), {photo})).subarray(0, 5).toString(), '%PDF-');
});
