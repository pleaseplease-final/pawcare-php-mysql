import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {birthdayError, latestBirthdayFor, toIsoDate} from '../src/ageRules.js';

test('an account holder must be at least 18 on the day they sign up', () => {
  assert.equal(birthdayError('2008-10-26', '2026-10-26'), '');
  assert.match(birthdayError('2008-10-27', '2026-10-26'), /at least 18/);
  assert.match(birthdayError('2015-01-01', '2026-10-26'), /at least 18/);
  assert.equal(latestBirthdayFor('2028-02-29'), '2010-02-28');
});
test('birthdays must be real calendar dates in range', () => {
  assert.match(birthdayError('', '2026-10-26'), /Choose/);
  assert.match(birthdayError('2001-02-30', '2026-10-26'), /real date/);
  assert.match(birthdayError('1899-12-31', '2026-10-26'), /1900/);
  assert.match(birthdayError('2030-01-01', '2026-10-26'), /future/);
  assert.equal(toIsoDate('10/26/2000'), '2000-10-26');
  assert.equal(birthdayError('10/26/2000', '2026-10-26'), '');
});

// Dates are always chosen from a calendar picker, never typed into a text box, and every picker has limits.
const files = [];
(function walk(dir) { for (const f of fs.readdirSync(dir, {withFileTypes: true})) { const p = path.join(dir, f.name); f.isDirectory() ? walk(p) : /\.jsx$/.test(f.name) && files.push(p); } })('src');
test('no date is typed into a plain text box', () => {
  const offenders = [];
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    for (const m of source.matchAll(/<input\b[^>]*>/g)) if (/(?:placeholder|name|id)=["'][^"']*(?:MM\/DD|DD\/MM|YYYY|birth|dob)/i.test(m[0]) && !/type=["'](?:date|datetime-local)["']/.test(m[0]) && !/readOnly/.test(m[0])) offenders.push(`${file}: ${m[0].slice(0, 80)}`);
  }
  assert.deepEqual(offenders, []);
});
test('every editable date picker has a limit', () => {
  const READ_ONLY_OK = /booster-due|admission|nextObservationAt|occurredAt/;
  const offenders = [];
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    for (const m of source.matchAll(/<(?:input|LiveControl|Field)\b[^>]*?type=["']date["'][\s\S]*?(?<!=)\/?>/g)) {
      if (!/\b(?:min|max|minDate|maxDate)=/.test(m[0]) && !READ_ONLY_OK.test(m[0])) offenders.push(`${file}: ${m[0].slice(0, 80).replace(/\s+/g, ' ')}`);
    }
  }
  assert.deepEqual(offenders, []);
});
