// Rules for closing a visit that was opened but never produced a clinical record.
// The dialog and the server use the same checks.
export const CLOSE_REASONS = [
  ['left', 'Patient left before being seen'],
  ['error', 'Visit was opened by mistake'],
  ['duplicate', 'Duplicate of another open visit'],
  ['other', 'Other reason'],
];
export const CLOSE_NOTE_MIN = 10, CLOSE_NOTE_MAX = 300;
export const OPEN_STATUSES = ['Checked-in', 'In consultation'];
export const closeReasonLabel = code => CLOSE_REASONS.find(([key]) => key === code)?.[1] || '';

export function closeVisitErrors({ reasonCode, note }) {
  const errors = {}, text = String(note ?? '').trim().replace(/\s{2,}/g, ' ');
  if (!CLOSE_REASONS.some(([key]) => key === reasonCode)) errors.reasonCode = 'Choose why this visit is being closed.';
  if (text.length < CLOSE_NOTE_MIN) errors.note = `Explain in at least ${CLOSE_NOTE_MIN} characters what happened.`;
  else if (text.length > CLOSE_NOTE_MAX) errors.note = `Keep the explanation under ${CLOSE_NOTE_MAX} characters.`;
  else if (!/[A-Za-zÀ-ÿ]{3}/.test(text)) errors.note = 'Use words, not only numbers or symbols.';
  return errors;
}

/** The text stored on the visit so everyone can see why it was closed. */
export const closeReasonText = ({ reasonCode, note }) =>
  `Closed without a visit record (${closeReasonLabel(reasonCode)}): ${String(note).trim().replace(/\s{2,}/g, ' ')}`;

const dayNumber = value => Math.floor(Date.parse(`${value}T00:00:00Z`) / 86400000);
/** Whole days a visit has been waiting since its booked date (0 for today). */
export const openDays = (visit, today) => Number.isFinite(dayNumber(visit?.date)) && Number.isFinite(dayNumber(today)) ? Math.max(0, dayNumber(today) - dayNumber(visit.date)) : 0;
export const openAgeLabel = days => days <= 0 ? 'Open today' : days === 1 ? 'Open 1 day' : `Open ${days} days`;
export const openAgeTone = days => days >= 2 ? 'er' : days >= 1 ? 'wa' : '';

/** A weight far from the last measured one needs a second look before it is saved. */
export const WEIGHT_CHANGE_LIMIT = 0.3;
export function weightJump(previous, next) {
  const before = Number(previous), after = Number(next);
  if (!(before > 0) || !(after > 0)) return null;
  const change = Math.abs(after - before) / before;
  return change > WEIGHT_CHANGE_LIMIT ? { before, after, percent: Math.round(change * 100) } : null;
}
