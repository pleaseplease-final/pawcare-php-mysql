import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ACCESS_REASONS, CATALOG_REASONS, reasonErrors, reasonText } from '../src/accessReasons.js';

// The browser rules (src/accessReasons.js) and the PHP console (php-backend/config/reasons.php) must offer the same reasons.
const php = readFileSync(new URL('../php-backend/config/reasons.php', import.meta.url), 'utf8');
const phpLists = Object.fromEntries([...php.matchAll(/'(\w+)' => \[((?:'\w+' => '[^']*',? ?)+)\]/g)].map(([, name, body]) => [name, [...body.matchAll(/'(\w+)' => '([^']*)'/g)].map(([, code, label]) => [code, label])]));
const jsLists = { ...ACCESS_REASONS, ...CATALOG_REASONS };

test('PHP and JavaScript offer identical reasons', () => {
  for (const name of ['deactivate', 'reactivate', 'unlock', 'retire', 'restore']) {
    assert.ok(phpLists[name], `PHP list ${name} exists`);
    assert.deepEqual(phpLists[name], jsLists[name], `list ${name}`);
  }
});

test('a reason must be on the list and Other needs an explanation', () => {
  const list = ACCESS_REASONS.deactivate;
  assert.deepEqual(reasonErrors(list, { reasonCode: 'left_clinic', reasonNote: '' }), {});
  assert.ok(reasonErrors(list, { reasonCode: '', reasonNote: '' }).reasonCode);
  assert.ok(reasonErrors(list, { reasonCode: 'invented', reasonNote: '' }).reasonCode);
  assert.ok(reasonErrors(list, { reasonCode: 'other', reasonNote: '' }).reasonNote);
  assert.ok(reasonErrors(list, { reasonCode: 'other', reasonNote: '12345' }).reasonNote);
  assert.deepEqual(reasonErrors(list, { reasonCode: 'other', reasonNote: 'Moved to another branch' }), {});
  assert.ok(reasonErrors(list, { reasonCode: 'security', reasonNote: 'x'.repeat(201) }).reasonNote);
});

test('the saved sentence combines the label and the note', () => {
  assert.equal(reasonText(ACCESS_REASONS.deactivate, { reasonCode: 'left_clinic', reasonNote: ' Moved   abroad ' }), 'Resigned or left the clinic: Moved abroad');
  assert.equal(reasonText(ACCESS_REASONS.deactivate, { reasonCode: 'security', reasonNote: '' }), 'Security concern or suspected misuse');
  assert.equal(reasonText(ACCESS_REASONS.deactivate, { reasonCode: 'other', reasonNote: 'Moved to another branch' }), 'Moved to another branch');
});
