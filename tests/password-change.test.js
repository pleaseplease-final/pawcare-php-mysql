import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validatePasswordChange, PW_RULE_MESSAGE, identityPart } from '../src/passwordChange.js';

const good = 'Brand-New#Pass42';
const current = 'Current#Pass1234';

test('a valid change has no errors', () => {
  assert.deepEqual(validatePasswordChange({ cur: current, next: good, conf: good }, 'maria@example.com'), {});
});

test('the current password is required', () => {
  assert.ok(validatePasswordChange({ cur: '', next: good, conf: good }).cur);
});

test('a new password equal to the current one is declined, even before the rules are met', () => {
  assert.match(validatePasswordChange({ cur: current, next: current, conf: current }).next, /different from your current/);
  assert.match(validatePasswordChange({ cur: 'weak', next: 'weak', conf: 'weak' }).next, /different from your current/);
});

test('the password rules are enforced', () => {
  for (const next of ['short1A!', 'alllowercase#12345', 'ALLUPPERCASE#12345', 'NoDigitsHere#####', 'NoSymbols1234567']) {
    assert.equal(validatePasswordChange({ cur: current, next, conf: next }).next, PW_RULE_MESSAGE, next);
  }
});

test('the email name cannot appear in the password', () => {
  assert.match(validatePasswordChange({ cur: current, next: 'Maria-Strong#2026', conf: 'Maria-Strong#2026' }, 'maria@example.com').next, /email name/);
  assert.equal(validatePasswordChange({ cur: current, next: 'Joe-Strong#20266', conf: 'Joe-Strong#20266' }, 'joe@example.com').next, undefined, 'short names are ignored');
  assert.equal(identityPart('Maria@Example.com'), 'maria');
});

test('the confirmation is required and must match', () => {
  assert.match(validatePasswordChange({ cur: current, next: good, conf: '' }).conf, /Retype/);
  assert.match(validatePasswordChange({ cur: current, next: good, conf: good + 'x' }).conf, /do not match/);
});
