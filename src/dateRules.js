// One set of date rules for the browser forms and the server.
// Dates are clinic-day strings "YYYY-MM-DD" in Asia/Manila. Date maths uses UTC midnight so the
// browser's own time zone can never shift a day. No imports beyond booking.js, so Node can load it.
import { today } from './booking.js';

/** Earliest date the clinic accepts on records, filters and pet birth dates. */
export const EARLIEST_DATE = '2000-01-01';
export const PET_BIRTH_EARLIEST = EARLIEST_DATE;

/** True for a real calendar day written as YYYY-MM-DD (rejects 2026-02-30, 2026-13-01, "2026-1-5"). */
export function isRealDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** The clinic day `days` away from `date` (default today). */
export function addDays(date, days) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Pet birth date: required, a real date, from 2000-01-01 up to and including today. */
export function petBirthError(value, date = today()) {
  if (!value) return 'Enter the birth date.';
  if (!isRealDate(value)) return 'Enter a real calendar date (YYYY-MM-DD).';
  if (value > date) return 'Birth date cannot be in the future.';
  if (value < PET_BIRTH_EARLIEST) return 'Birth date must be on or after January 1, 2000.';
  return '';
}

/**
 * A past-or-present date such as a vaccination, measurement or report filter date.
 * `notBefore` lets a form require the date to follow another (e.g. the pet's birth date).
 */
export function pastDateError(value, { label = 'Date', required = true, date = today(), notBefore = '', notBeforeLabel = '' } = {}) {
  if (!value) return required ? `Enter the ${label.toLowerCase()}.` : '';
  if (!isRealDate(value)) return `${label}: enter a real calendar date (YYYY-MM-DD).`;
  if (value > date) return `${label} cannot be in the future.`;
  if (value < EARLIEST_DATE) return `${label} must be on or after January 1, 2000.`;
  if (notBefore && value < notBefore) return `${label} cannot be before ${notBeforeLabel || notBefore}.`;
  return '';
}

/** A from/to filter pair. Either side may be empty; both must be real, in range, and in order. */
export function dateRangeErrors(from, to, { date = today(), allowFuture = false } = {}) {
  const errors = {}, latest = allowFuture ? '9999-12-31' : date;
  for (const [key, value, label] of [['from', from, 'From date'], ['to', to, 'To date']]) {
    if (!value) continue;
    if (!isRealDate(value)) errors[key] = `${label}: enter a real calendar date.`;
    else if (value < EARLIEST_DATE) errors[key] = `${label} must be on or after January 1, 2000.`;
    else if (value > latest) errors[key] = `${label} cannot be in the future.`;
  }
  if (!errors.from && !errors.to && from && to && from > to) errors.to = 'To date must be on or after the From date.';
  return errors;
}
