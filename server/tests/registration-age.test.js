import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateOwnerRegistration} from '../registrationValidation.js';
import {clinicClock} from '../scheduling.js';

const yearsAgo = (years, dayOffset = 0) => {
  const [y, m, d] = clinicClock().date.split('-').map(Number);
  const date = new Date(Date.UTC(y - years, m - 1, d + dayOffset));
  return date.toISOString().slice(0, 10);
};
const body = birthday => ({first_name: 'Maria', last_name: 'Santos', birthday, email: 'maria@gmail.com', password: 'Str0ng!Passw0rd', confirm_password: 'Str0ng!Passw0rd', country: 'PH', state: 'Metro Manila', city: 'Quezon City', zip_code: '1100', house_street: '12 Rizal Street', mobile: '+639171234567'});

test('sign-up refuses anyone under 18, even by one day', async () => {
  for (const birthday of [yearsAgo(17), yearsAgo(18, 1), yearsAgo(5)]) {
    const result = await validateOwnerRegistration(body(birthday));
    assert.match(result.errors.birthday, /at least 18/, birthday);
  }
});
test('sign-up accepts a person who turns 18 today, in either date format', async () => {
  const iso = yearsAgo(18);
  assert.equal((await validateOwnerRegistration(body(iso))).errors.birthday, undefined);
  const [y, m, d] = iso.split('-');
  assert.equal((await validateOwnerRegistration(body(`${m}/${d}/${y}`))).errors.birthday, undefined);
});
test('sign-up refuses impossible and future dates', async () => {
  for (const birthday of ['2001-02-30', '1899-01-01', '2999-01-01', 'not a date', '']) {
    assert.ok((await validateOwnerRegistration(body(birthday))).errors.birthday, birthday);
  }
});
