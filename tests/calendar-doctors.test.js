import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calendarDoctors } from '../src/roles/calendarDoctors.js';
const demo = [['v1', 'Dr. Ana Cruz'], ['v2', 'Dr. Ben Lim']];

test('invited doctor sees their own real ID even before roster loads', () => {
  assert.deepEqual(calendarDoctors({}, { role: 'vet', vetId: 'v_invited', id: 'u_invited', name: 'Jane Doe' }, demo), [['v_invited', 'Dr. Jane Doe']]);
});
test('doctor view excludes other doctors and does not duplicate title', () => {
  assert.deepEqual(calendarDoctors({ vets: [{ id: 'v_other', name: 'Dr. Other' }] }, { role: 'vet', vetId: 'v1', name: 'Dr. Ana Cruz' }, demo), [demo[0]]);
});
test('legacy doctor without vetId uses their own account ID', () => {
  assert.deepEqual(calendarDoctors({}, { role: 'doctor', id: 'u_doctor', name: 'Test' }, demo), [['u_doctor', 'Dr. Test']]);
});
test('staff roster uses live IDs and retains named historical assignments', () => {
  assert.deepEqual(calendarDoctors({ vets: [{ id: 'v_real', name: 'Dr. Real' }], appts: [{ vetId: 'v1' }] }, { role: 'assistant' }, demo), [['v_real', 'Dr. Real'], demo[0]]);
});
test('demo calendar keeps original doctors when no live roster exists', () => {
  assert.deepEqual(calendarDoctors({}, { role: 'assistant' }, demo), demo);
});
