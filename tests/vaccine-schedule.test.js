import test from 'node:test';
import assert from 'node:assert/strict';
import {vaccineSchedule} from '../src/vaccineSchedule.js';

test('adult rabies is one annual dose', () => {
  const s=vaccineSchedule({vaccine:'Anti-rabies',date:'2026-10-01',birth:'2022-01-01',species:'Dog'});
  assert.deepEqual([s.intervalDays,s.doseNo,s.doseOf,s.warning],['365','1','1','']);
});
test('puppy series advances by prior doses and ends with a yearly booster', () => {
  const base={vaccine:'5-in-1',birth:'2026-08-20',species:'Dog'};
  assert.equal(vaccineSchedule({...base,date:'2026-10-01',prior:[]}).doseNo,'1');
  const prior=[{done:true,vaccine:'5-in-1',date:'2026-09-10'},{done:true,vaccine:'5-in-1',date:'2026-09-20'}];
  const last=vaccineSchedule({...base,date:'2026-10-05',prior});
  assert.deepEqual([last.doseNo,last.doseOf,last.intervalDays],['3','3','365']);
});
test('under-age rabies warns; unknown vaccines stay manual', () => {
  assert.ok(vaccineSchedule({vaccine:'Anti-rabies',date:'2026-10-01',birth:'2026-08-20',species:'Dog'}).warning);
  assert.equal(vaccineSchedule({vaccine:'Other',date:'2026-10-01',birth:'2022-01-01',species:'Dog'}),null);
});

import {procedureErrors,procedureNote,procedureRequired} from '../src/procedureDecision.js';
test('surgery assessments need a recorded vet decision', () => {
  assert.ok(procedureRequired({service:'surgery',reason:'Surgery – Surgical assessment'},true));
  assert.ok(!procedureRequired({service:'surgery',reason:'Surgery – Follow-up'},true));
  assert.ok(!procedureRequired({service:'checkup',reason:'Annual check-up'},true));
  assert.ok(procedureErrors({procedureRequired:true,procedureDecision:''}).procedureDecision);
  assert.ok(procedureErrors({procedureDecision:'Suitable - book the procedure',procedureType:''}).procedureType);
  assert.deepEqual(procedureErrors({procedureDecision:'Not needed'}),{});
  assert.match(procedureNote({procedureDecision:'Owner declined',procedureType:'Dental procedure'}),/Dental procedure: Owner declined/);
});
