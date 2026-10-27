// Reasons an administrator can choose when an account or price-list item is deactivated, restored, unlocked or revoked.
// Choosing from a list keeps the audit trail consistent; "Other" needs a short explanation.
// The browser forms and the server use the same lists and checks. No imports, so Node can load this file directly.
export const OTHER = 'other';
const other = [OTHER, 'Other (explain below)'];

export const ACCESS_REASONS = {
  deactivate: [['left_clinic', 'Resigned or left the clinic'], ['contract_ended', 'Contract or employment ended'], ['role_change', 'Moved to a role without clinic access'], ['security', 'Security concern or suspected misuse'], ['leave', 'Extended leave of absence'], ['duplicate', 'Duplicate account'], other],
  reactivate: [['returned', 'Returned to work'], ['identity_verified', 'Identity re-verified'], ['by_mistake', 'Deactivated by mistake'], ['contract_renewed', 'Contract renewed'], other],
  unlock: [['forgot_password', 'Forgot their password'], ['identity_verified', 'Identity verified in person'], ['mistyped', 'Mistyped the password too many times'], other],
  archive: [['left_clinic', 'Left the clinic permanently'], ['duplicate', 'Duplicate account'], ['created_by_mistake', 'Created by mistake'], ['records_cleanup', 'Staff list clean-up'], other],
  unarchive: [['returned', 'Returning to the clinic'], ['by_mistake', 'Archived by mistake'], other],
  role: [['promotion', 'Promotion or new responsibilities'], ['reassigned', 'Reassigned to another team'], ['wrong_role', 'Wrong role chosen at invitation'], ['coverage', 'Temporary staffing coverage'], other],
  revoke: [['wrong_email', 'Sent to the wrong email address'], ['wrong_role', 'Wrong role selected'], ['not_joining', 'The person is no longer joining'], ['replace', 'Replacing it with a new invitation'], other],
};

export const CATALOG_REASONS = {
  retire: [['discontinued', 'Item discontinued'], ['not_stocked', 'No longer stocked or offered'], ['replaced', 'Replaced by another item'], ['mistake', 'Added by mistake'], ['price_review', 'Removed in a price list review'], other],
  restore: [['offered_again', 'Offered or stocked again'], ['by_mistake', 'Retired by mistake'], ['price_review', 'Brought back in a price list review'], other],
};

export const NOTE_MIN = 5, NOTE_MAX = 200;
export const reasonLabel = (list, code) => (list || []).find(([key]) => key === code)?.[1] || '';

/** Field errors for a chosen reason. `list` is one of the arrays above. */
export function reasonErrors(list, { reasonCode, reasonNote }) {
  const errors = {}, note = String(reasonNote ?? '').trim().replace(/\s{2,}/g, ' ');
  if (!(list || []).some(([key]) => key === reasonCode)) errors.reasonCode = 'Choose a reason from the list.';
  if (note.length > NOTE_MAX) errors.reasonNote = `Keep the note under ${NOTE_MAX} characters.`;
  else if (reasonCode === OTHER && note.length < NOTE_MIN) errors.reasonNote = `Explain the reason in at least ${NOTE_MIN} characters.`;
  else if (reasonCode === OTHER && !/[A-Za-zÀ-ÿ]{3}/.test(note)) errors.reasonNote = 'Use words, not only numbers or symbols.';
  else if (/[\u0000-\u001f\u007f]/.test(note)) errors.reasonNote = 'Remove special control characters.';
  return errors;
}

/** The sentence saved on the record and in the audit trail. */
export function reasonText(list, { reasonCode, reasonNote }) {
  const note = String(reasonNote ?? '').trim().replace(/\s{2,}/g, ' ');
  const label = reasonCode === OTHER ? '' : reasonLabel(list, reasonCode);
  return [label, note].filter(Boolean).join(': ') || reasonLabel(list, reasonCode);
}
