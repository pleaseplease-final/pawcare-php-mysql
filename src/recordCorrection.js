import { addressError } from './externalHistory.js';

// Rules for correcting an existing owner or patient record. The edit forms and the server use the same checks.
const LETTER_RE = /[A-Za-zÀ-ÿ]/;
const PH_MOBILE_RE = /^(09|\+639)\d{9}$/;
const OWNER_NAME_RE = /^[A-Za-zÀ-ÿ.'\- ]+$/;
const PET_NAME_RE = /^[A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9 .'\-]*$/;
const PET_TEXT_RE = /^[A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9 .,'’()\/&\-]*$/;

export const PET_SEXES = ['Male', 'Female'];
export const PET_NEUTERED = ['Yes', 'No', 'Not sure'];
export const PET_EARLIEST_BIRTH = '1990-01-01';
export const tidy = value => String(value ?? '').trim().replace(/\s{2,}/g, ' ');
export const phoneKey = value => String(value ?? '').replace(/[\s-]/g, '');

const realDay = value => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

export function ownerDetailErrors(input) {
  const errors = {}, name = tidy(input.name), email = String(input.email ?? '').trim(), phone = phoneKey(input.phone), address = tidy(input.address);
  if (!name) errors.name = 'Enter the owner’s full name.';
  else if (name.length < 2) errors.name = 'Use at least 2 characters.';
  else if (name.length > 60) errors.name = 'Keep the name under 60 characters.';
  else if (!OWNER_NAME_RE.test(name) || !LETTER_RE.test(name)) errors.name = 'Use letters, spaces, . \' and - only.';
  if (!phone) errors.phone = 'Enter the owner’s mobile number.';
  else if (!PH_MOBILE_RE.test(phone)) errors.phone = 'Use a valid PH mobile: 09XXXXXXXXX or +639XXXXXXXXX.';
  if (email && (email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email))) errors.email = 'Enter a valid email address.';
  const addressProblem = address ? addressError(address) : '';
  if (addressProblem) errors.address = addressProblem;
  return errors;
}

export function petDetailErrors(input, today) {
  const errors = {}, name = tidy(input.name), breed = tidy(input.breed), color = tidy(input.color), notes = String(input.notes ?? '').trim();
  if (!name) errors.name = 'Enter the pet’s name.';
  else if (name.length > 30) errors.name = 'Keep the name under 30 characters.';
  else if (!PET_NAME_RE.test(name) || !LETTER_RE.test(name)) errors.name = 'Use letters, numbers and . \' - only.';
  if (breed && (breed.length > 60 || !PET_TEXT_RE.test(breed))) errors.breed = breed.length > 60 ? 'Keep the breed under 60 characters.' : 'Use letters, numbers and basic punctuation only.';
  if (!PET_SEXES.includes(input.sex)) errors.sex = 'Choose male or female.';
  if (!input.birth) errors.birth = 'Enter the birth date.';
  else if (!realDay(input.birth)) errors.birth = 'Enter a real calendar date.';
  else if (input.birth > today) errors.birth = 'Birth date cannot be in the future.';
  else if (input.birth < PET_EARLIEST_BIRTH) errors.birth = 'Birth date must be 1990 or later.';
  if (!PET_NEUTERED.includes(input.neutered)) errors.neutered = 'Choose yes, no or not sure.';
  if (color && (color.length > 60 || !PET_TEXT_RE.test(color))) errors.color = color.length > 60 ? 'Keep the colour under 60 characters.' : 'Use letters, numbers and basic punctuation only.';
  if (notes.length > 300) errors.notes = 'Keep notes under 300 characters.';
  return errors;
}

/** Fields that differ from the record the form was opened with. */
export const changedFields = (before, after, keys) => keys.filter(key => tidy(before[key]) !== tidy(after[key]));
