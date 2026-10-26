// Shared by the sign-up form, the staff setup form and the server. Dates are plain YYYY-MM-DD text.
export const ADULT_AGE = 18;
const real = v => /^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;

// Accepts the older MM/DD/YYYY form and returns YYYY-MM-DD (anything else is returned unchanged).
export function toIsoDate(value) {
  const us = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(value ?? '').trim());
  return us ? `${us[3]}-${us[1]}-${us[2]}` : String(value ?? '').trim();
}

// The latest birth date that is still old enough on `today` (Feb 29 falls back to Feb 28).
export function latestBirthdayFor(today, age = ADULT_AGE) {
  const [y, m, d] = today.split('-').map(Number);
  const candidate = `${String(y - age).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return real(candidate) ? candidate : `${String(y - age).padStart(4, '0')}-02-28`;
}

export const EARLIEST_BIRTHDAY = '1900-01-01';

export function birthdayError(value, today, age = ADULT_AGE) {
  const v = toIsoDate(value);
  if (!v) return 'Choose your date of birth.';
  if (!real(v)) return 'Pick a real date from the calendar.';
  if (v < EARLIEST_BIRTHDAY) return 'Choose a date from 1900 onwards.';
  if (v > today) return 'Date of birth cannot be in the future.';
  if (v > latestBirthdayFor(today, age)) return `You must be at least ${age} years old to create an account.`;
  return '';
}

// Today in the clinic's time zone (Philippines), matching the server's clock.
export const clinicToday = () => new Date().toLocaleDateString('en-CA', {timeZone: 'Asia/Manila'});
