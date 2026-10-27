import { test } from 'node:test';
import assert from 'node:assert/strict';
import { closeVisitErrors, closeReasonText, openDays, openAgeLabel, openAgeTone, weightJump } from '../src/visitClosure.js';

test('closing a visit needs a listed reason and a real explanation', () => {
  assert.deepEqual(closeVisitErrors({ reasonCode: 'left', note: 'Owner left before the exam, no care given.' }), {});
  assert.ok(closeVisitErrors({ reasonCode: '', note: 'Owner left before the exam.' }).reasonCode);
  assert.ok(closeVisitErrors({ reasonCode: 'nonsense', note: 'Owner left before the exam.' }).reasonCode);
  assert.ok(closeVisitErrors({ reasonCode: 'left', note: 'short' }).note);
  assert.ok(closeVisitErrors({ reasonCode: 'left', note: '1234567890 !!!' }).note);
  assert.ok(closeVisitErrors({ reasonCode: 'left', note: 'x'.repeat(301) }).note);
});

test('the saved reason names the choice and keeps the explanation', () => {
  assert.equal(closeReasonText({ reasonCode: 'error', note: '  Opened  for the wrong pet. ' }), 'Closed without a visit record (Visit was opened by mistake): Opened for the wrong pet.');
});

test('open visits show their age and turn urgent after two days', () => {
  assert.equal(openDays({ date: '2026-10-25' }, '2026-10-27'), 2);
  assert.equal(openDays({ date: '2026-10-27' }, '2026-10-27'), 0);
  assert.equal(openDays({ date: '2026-10-28' }, '2026-10-27'), 0);
  assert.equal(openAgeLabel(0), 'Open today');
  assert.equal(openAgeLabel(1), 'Open 1 day');
  assert.equal(openAgeLabel(3), 'Open 3 days');
  assert.deepEqual([openAgeTone(0), openAgeTone(1), openAgeTone(2)], ['', 'wa', 'er']);
});

test('a weight far from the last measurement needs confirmation', () => {
  assert.deepEqual(weightJump(65, 15), { before: 65, after: 15, percent: 77 });
  assert.equal(weightJump(10, 12.5), null);
  assert.equal(weightJump(10, 13), null);
  assert.ok(weightJump(10, 13.1));
  assert.equal(weightJump(null, 15), null);
  assert.equal(weightJump(0, 15), null);
});
