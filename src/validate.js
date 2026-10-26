/* Validation rules matching login_registration and PawCare clinic hub.
   Name: first name and last name (2-50 letters, spaces, hyphens, apostrophes) and optional middle initial. Title Case enforced.
   Birthday: MM/DD/YYYY, real date, not in future, at least 13 years old.
   Password: 12-128 characters with upper, lower, number, special character; confirm password match.
   Address: house & street, country, state, city, ZIP code matching country/state/city rules.
   Mobile: country code + national number matching country format.
   Email: public email providers only (Gmail, Outlook, Yahoo, iCloud...), domain live check, not already registered.
*/

import { PUBLIC } from './domains.js';
import { birthdayError, clinicToday } from './ageRules.js';
import { countryInfo, checkMobile } from './geo.js';
export { PUBLIC };

export const CO = {
  PH: { name: 'Philippines', prefix: '+63', zip: /^\d{4}$/, mob: /^9\d{9}$/, trunk: true, ex: '9171234567' },
  US: { name: 'United States', prefix: '+1', zip: /^\d{5}(-\d{4})?$/, mob: /^[2-9]\d{2}[2-9]\d{6}$/, ex: '2025550123' },
  GB: { name: 'United Kingdom', prefix: '+44', zip: /^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$/i, mob: /^7[1-57-9]\d{8}$/, trunk: true, ex: '7912345678' },
  CA: { name: 'Canada', prefix: '+1', zip: /^[A-Za-z]\d[A-Za-z] ?\d[A-Za-z]\d$/, mob: /^[2-9]\d{2}[2-9]\d{6}$/, ex: '4165550123' },
  AU: { name: 'Australia', prefix: '+61', zip: /^\d{4}$/, mob: /^4\d{8}$/, trunk: true, ex: '412345678' },
  SG: { name: 'Singapore', prefix: '+65', zip: /^\d{6}$/, mob: /^[89]\d{7}$/, ex: '81234567' },
};

// Title Case enforcement for names and addresses (O'Brien, Mary-Jane, 5th Ave)
export const tc = (s) => String(s ?? '').toLowerCase()
  .replace(/(^|[\s\-/.(])(\p{L})/gu, (m, a, b) => a + b.toUpperCase())
  .replace(/(^|[\s-])(\p{L}['’])(\p{L})/gu, (m, a, b, c) => a + b + c.toUpperCase());

export const TCF = ['first_name', 'last_name', 'middle_initial', 'house_street', 'city'];

export const clean = (s) => String(s ?? '').trim().replace(/\s{2,}/g, ' ');
export const normEmail = (s) => String(s ?? '').trim().toLowerCase();
export const normPhone = (s) => String(s ?? '').replace(/\s|-/g, '');

export const PW_RULES = [
  [(p) => p.length >= 12, '12+ characters'],
  [(p) => /[A-Z]/.test(p), 'Uppercase letter'],
  [(p) => /[a-z]/.test(p), 'Lowercase letter'],
  [(p) => /\d/.test(p), 'Number'],
  [(p) => /[^A-Za-z0-9]/.test(p), 'Special character'],
];

export const pwStrength = (p) => {
  const str = String(p || '');
  return [str.length >= 12, /[A-Z]/.test(str), /[a-z]/.test(str), /\d/.test(str), /[^A-Za-z0-9]/.test(str)].filter(Boolean).length;
};

import { pn, pwOk } from './textRules.js';
export { pn, pwOk };
export const emOk = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && v.length <= 255;

export function vPassword(v, { username = '', name = '' } = {}) {
  const p = String(v ?? '');
  if (!p) return 'Enter a password';
  if (!pwOk(p)) return '12+ characters with upper, lower, number and special character.';
  const low = p.toLowerCase();
  if (username && username.length >= 3 && low.includes(username.toLowerCase())) return 'Your password can’t contain your email or username';
  return '';
}

// Reference validate function
export function validate(b) {
  const e = {}, s = (k) => String(b[k] ?? '').trim();
  for (const k of ['first_name', 'last_name']) if (!/^(?=.*\p{L})[\p{L}\p{M}'’ -]{2,50}$/u.test(s(k))) e[k] = '2-50 letters, spaces, hyphens or apostrophes only.';
  if (s('middle_initial') && !/^[\p{L}]\.?$/u.test(s('middle_initial'))) e.middle_initial = 'Use one letter, optionally followed by a period (A or A.).';
  const bd = birthdayError(s("birthday"), clinicToday());
  if (bd) e.birthday = bd;
  const p = String(b.password ?? '');
  if (!pwOk(p)) e.password = '12+ characters with upper, lower, number and special character.';
  if (p !== String(b.confirm_password ?? '')) e.confirm_password = 'Passwords do not match.';
  if (!/^[\p{L}0-9 .,#'’\/-]{3,255}$/u.test(s('house_street'))) e.house_street = 'Enter a valid house number and street.';
  const ci = countryInfo(s('country')), c = ci && { name: ci.name, prefix: ci.dial };
  if (!ci) e.country = 'Select a country.';
  for (const k of ['city', 'state']) if (!/^[\p{L}\p{M}0-9 .,'’()\/&-]{2,100}$/u.test(s(k))) e[k] = 'Enter a valid name (2-100 characters).';
  if (ci && !new RegExp(ci.zipFormat, ci.zipFlags).test(s('zip_code'))) e.zip_code = `Invalid ZIP/postal code for ${c.name}.`;
  const em = s('email').toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em) || em.length > 255) e.email = 'Enter a valid email address.';
  else if (!PUBLIC.has(em.split('@')[1])) e.email = 'Only public email providers (Gmail, Outlook, Yahoo, iCloud...) are allowed.';
  let mob = '';
  if (ci) {
    const mb = checkMobile(ci.code, s('mobile'));
    if (mb.ok) mob = mb.national;
    else e.mobile = mb.error;
  }
  return { e, em, mob, c };
}

export const validateRegistration = validate;

export function validateLogin(d) {
  const e = {};
  const em = String(d.email ?? d.identifier ?? '').trim();
  if (!em) e.email = 'Email is required.';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) e.email = 'Enter a valid email (user@domain.com).';
  if (!d.password) e.password = 'Password is required.';
  return e;
}

export function validateCode(d) {
  const c = String(d?.code ?? '').trim();
  return !c ? { code: 'Enter the 6-digit code' } : !/^\d{6}$/.test(c) ? { code: 'The code is 6 digits' } : {};
}

export function validateReset(d) {
  const e = validateCode(d);
  const email = typeof d.identifier === 'string' ? d.identifier.trim() : '';
  if (!emOk(email)) e.identifier = 'Enter your registered email address.';
  if (!pwOk(String(d.password ?? ''))) e.password = '12+ characters with upper, lower, number and special character.';
  if (d.confirm !== d.password) e.confirm = 'Passwords do not match.';
  return e;
}

export function validateContact(d) {
  const e = {};
  if (!d.email) e.email = 'Email is required';
  if (!d.phone) e.phone = 'Mobile number is required';
  if (!d.address) e.address = 'Address is required';
  return e;
}

export function validatePasswordChange(d) {
  const e = {};
  if (!d.cur) e.cur = 'Enter your current password';
  if (!pwOk(String(d.next ?? ''))) e.next = '12+ characters with upper, lower, number and special character.';
  if (d.next && d.next === d.cur) e.next = 'New password must be different from current password';
  if (d.conf !== d.next) e.conf = 'Passwords do not match';
  return e;
}

export const SPECIES = [
  "Canine (Dog)",
  "Feline (Cat)",
  "Lagomorph (Rabbit)",
  "Rodent (Hamster / Guinea Pig / etc.)",
  "Avian (Bird)",
  "Canine", "Dog",
  "Feline", "Cat",
  "Lagomorph", "Rabbit",
  "Rodent",
  "Avian", "Bird",
  "Other"
];
export const MAX_ALLERGIES = 10, MAX_NOTE = 300;
export const NAME_RE = /^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ .'\-]*$/;

export function validateFirstVisit(d, { today, last }) {
  const e = {}, n = clean(d.petName);
  if (!n) e.petName = "Enter your pet’s name"; else if (n.length > 40) e.petName = "Keep it under 40 characters"; else if (!NAME_RE.test(n)) e.petName = "Letters only, and start with a letter";
  if (!SPECIES.includes(d.species)) e.species = "Choose the kind of animal";
  if (!d.date) e.date = "Pick a preferred date"; else if (isNaN(new Date(d.date + "T00:00:00"))) e.date = "Enter a valid date";
  else if (d.date < today) e.date = "Date can’t be in the past"; else if (d.date > last) e.date = `Pick a date up to ${last}`;
  if (!["Morning", "Afternoon"].includes(d.part)) e.part = "Choose morning or afternoon";
  const nt = clean(d.note); if (nt.length > 200) e.note = "Keep it under 200 characters"; else if (nt && !/[A-Za-zÀ-ÿ]/.test(nt)) e.note = "Write a few words, not only numbers or symbols";
  return e;
}

export function vAllergy(t, list) {
  const s = clean(t);
  if (!s) return "Enter an allergy";
  if (s.length < 2) return "At least 2 characters";
  if (s.length > 40) return "Keep it under 40 characters";
  if (!/[A-Za-zÀ-ÿ]/.test(s)) return "Use a name, for example Chicken or Pollen";
  if (list.some(x => x.toLowerCase() === s.toLowerCase())) return `${s} is already on the list`;
  if (list.length >= MAX_ALLERGIES) return `You can list up to ${MAX_ALLERGIES} allergies`;
  return "";
}

export function vNote(t) {
  const s = String(t ?? "").trim();
  if (s.length > MAX_NOTE) return `Keep it under ${MAX_NOTE} characters`;
  if (s && !/[A-Za-zÀ-ÿ]/.test(s)) return "Write a few words, not only numbers or symbols";
  return "";
}

export function vWeight(d, { today, birth, existing }) {
  const e = {};
  if (!d.date) e.date = "Pick the date it was weighed"; else if (d.date > today) e.date = "Date can’t be in the future";
  else if (birth && d.date < birth) e.date = "Your pet wasn’t born yet on that date"; else if (existing.some(w => w.date === d.date)) e.date = "There is already a weight for this date";
  const kg = String(d.kg ?? "");
  if (!kg) e.kg = "Enter the weight in kg"; else if (!/^(\d{1,3}(\.\d{1,2})?|\.\d{1,2})$/.test(kg)) e.kg = "Use numbers only, like 14.5"; else if (+kg < 0.1 || +kg > 120) e.kg = "Weight must be between 0.1 and 120 kg";
  return e;
}
