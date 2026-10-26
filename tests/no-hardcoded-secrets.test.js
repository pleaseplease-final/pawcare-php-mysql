import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const files = [];
(function walk(dir) {
  for (const f of fs.readdirSync(dir, {withFileTypes: true})) {
    if (['node_modules', 'tests', 'dist'].includes(f.name)) continue;
    const p = path.join(dir, f.name);
    f.isDirectory() ? walk(p) : /\.(js|jsx|sql|json)$/.test(f.name) && files.push(p);
  }
})('.');
const scanned = files.filter(f => /^(\.[\/])?(server|src|api)[\/]/.test(f));

test('no account password or signing secret is written in the code', () => {
  const banned = [/Admin1234567!/, /Vet123456789!/, /Assist123456!/, /Owner1234567!/, /change-in-production/i];
  const found = [];
  for (const file of scanned) {
    const text = fs.readFileSync(file, 'utf8');
    for (const pattern of banned) if (pattern.test(text)) found.push(`${file}: ${pattern}`);
  }
  assert.deepEqual(found, []);
});
test('every database call in route files uses bound values for request data', () => {
  const offenders = [];
  for (const file of scanned.filter(f => /routes[\/].*\.js$/.test(f))) {
    const text = fs.readFileSync(file, 'utf8');
    for (const m of text.matchAll(/query\(\s*`[^`]*\$\{\s*req\.(?:body|query|params)[^}]*\}/g)) offenders.push(`${file}: ${m[0].slice(0, 80)}`);
  }
  assert.deepEqual(offenders, []);
});
