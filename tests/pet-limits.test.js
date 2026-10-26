import test from 'node:test';
import assert from 'node:assert/strict';
import {petPlausibility} from '../src/petLimits.js';
import {validatePetPlausibility} from '../server/petRegistration.js';

const today='2026-10-26';
test('species limits catch typos in weight and birth year', () => {
  assert.deepEqual(petPlausibility({species:'Canine (Dog)',weight:'110',birth:'2020-01-01',today}),{},'giant breeds are allowed');
  assert.ok(petPlausibility({species:'Rodent (Hamster / Guinea Pig / etc.)',weight:'5',birth:'2025-01-01',today}).weight);
  assert.ok(petPlausibility({species:'Feline',weight:22,birth:'2020-01-01',today}).weight);
  assert.ok(petPlausibility({species:'Rodent',weight:'0.1',birth:'2010-01-01',today}).birth);
  assert.deepEqual(petPlausibility({species:'Other',weight:'90',birth:'1990-01-01',today}),{},'unknown species only keep the general limits');
});
test('the server refuses implausible new registrations with the same message', () => {
  assert.throws(()=>validatePetPlausibility({species:'Rodent'},{weight:5,birth:'2025-01-01'}),/heavier than expected for a rodent/);
  assert.doesNotThrow(()=>validatePetPlausibility({species:'Canine'},{weight:30,birth:'2020-01-01'}));
});

import {validateSoapFields} from '../src/soapValidation.js';
import {ADMINISTERED_VACCINES} from '../src/vaccineSchedule.js';
test('a certified vaccine must come from the clinic list, in the form and on the server list', () => {
  const form=vaccine=>({date:today,symptoms:'s',objective:'o',diagnosis:'d',treatment:'t',weight:'',prescription:'',visitAnswers:{},giveVaccine:true,vaccine,brand:'B',batch:'L',doseNo:'1',doseOf:'1',intervalDays:'365',scheduleApproved:true});
  assert.ok(validateSoapFields(form('Homemade serum'),today,'2020-01-01').vaccine);
  assert.equal(validateSoapFields(form('Anti-rabies'),today,'2020-01-01').vaccine,undefined);
  assert.ok(ADMINISTERED_VACCINES.includes('Deworming') && ADMINISTERED_VACCINES.includes('Feline Leukemia (FeLV)'));
});

import {readFileSync} from 'node:fs';
import {formatSpeciesLabel} from '../src/preventiveSchedule.js';
import {validateStaffSetupField} from '../src/staffSetupValidation.js';
import {recordKind,recordDoses,recordHeadline,VISIT_TYPES} from '../src/ownerVisitType.js';
test('the species choice is plain "Other", never "Exotic"', () => {
  for (const file of ['src/validate.js', 'src/roles/owner/Pets.jsx']) assert.ok(!/Other \/ Exotic/.test(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')), `${file} still offers Other / Exotic`);
  assert.equal(formatSpeciesLabel('Other'), 'Other');
  assert.equal(formatSpeciesLabel('Other / Exotic'), 'Other', 'pets saved with the old label still show correctly');
  assert.equal(formatSpeciesLabel('Dog'), 'Canine (Dog)');
});
test('staff setup rules the server now shares: adults only, a real address', () => {
  const age = years => { const d = new Date(); d.setFullYear(d.getFullYear() - years); return d.toISOString().slice(0, 10); };
  assert.ok(validateStaffSetupField('birthday', age(17), {}));
  assert.equal(validateStaffSetupField('birthday', age(30), {}), '');
  assert.ok(validateStaffSetupField('houseStreet', '', {}) && validateStaffSetupField('city', 'x', {}) && validateStaffSetupField('state', '', {}));
  assert.ok(validateStaffSetupField('firstName', 'Ana2', {}));
});
test('visit history ties each record to its visit type and the doses given', () => {
  const visits = [{id: 'a1', service: 'vaccination', reason: 'Vaccination: Anti-rabies'}, {id: 'a2', service: 'checkup', reason: 'Annual check-up'}, {id: 'a3', service: 'deworming', reason: 'Deworming'}];
  const vacc = [{id: 'd1', consultationId: 'r1', apptId: 'a1', vaccine: 'Anti-rabies', done: true}, {id: 'd2', apptId: 'zzz', vaccine: 'Other pet', done: true}, {id: 'd3', consultationId: 'r1', vaccine: 'Planned', done: false}];
  const record = {id: 'r1', apptId: 'a1', diagnosis: 'Veterinarian confirmed suitability for vaccination.'};
  assert.equal(recordKind(record, visits), 'vaccination');
  assert.equal(recordKind({id: 'r2', apptId: 'a2'}, visits), 'consultation');
  assert.equal(recordKind({id: 'r9', apptId: 'missing'}, visits), 'consultation');
  const doses = recordDoses(record, vacc);
  assert.deepEqual(doses.map(d => d.id), ['d1'], 'only administered doses from this visit');
  assert.equal(recordHeadline(record, 'vaccination', doses), 'Anti-rabies given');
  assert.equal(recordHeadline({diagnosis: 'Otitis externa'}, 'consultation', []), 'Otitis externa');
  assert.equal(recordHeadline({}, 'deworming', []), 'Deworming visit');
  assert.deepEqual(Object.keys(VISIT_TYPES), ['consultation', 'vaccination', 'deworming', 'grooming']);
});
