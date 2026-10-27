// Rules and choices for a veterinarian medicine order. The browser form and the server use the same checks,
// so entries such as "646546" for a medicine, or a dose without a unit, can never be saved.
// No imports, so Node can load this file directly. Nothing here suggests a dose or a treatment.
export const OTHER = 'other';

export const MEDICINE_ROUTES = [
  ['oral', 'By mouth (oral)'], ['iv', 'Intravenous (IV)'], ['im', 'Intramuscular (IM)'], ['sc', 'Subcutaneous (SC)'],
  ['topical', 'On skin (topical)'], ['ear', 'In ear'], ['eye', 'In eye'], [OTHER, 'Other route (type it)'],
];
export const MEDICINE_FREQUENCIES = [
  ['once', 'Once only'], ['daily', 'Once daily'], ['bid', 'Twice daily (every 12 hours)'], ['tid', 'Three times daily (every 8 hours)'],
  ['qid', 'Four times daily (every 6 hours)'], ['q4h', 'Every 4 hours'], ['prn', 'Only when needed (PRN)'], [OTHER, 'Other schedule (type it)'],
];
export const MEDICINE_DOSE_UNITS = ['mg', 'mcg', 'g', 'mL', 'tablet', 'capsule', 'drop', 'IU', 'units'];

export const LIMITS = { medicine: 200, dose: 200, route: 100, frequency: 200 };
const NAME_RULE = /^[\p{L}\p{N}][\p{L}\p{N} .,'’"()\/&+%-]*$/u;
const CONTROL = /[\u0000-\u001f\u007f]/;
const letterCount = value => (String(value).match(/\p{L}/gu) || []).length;
const tidy = value => String(value ?? '').trim().replace(/\s{2,}/g, ' ');
export const choiceLabel = (list, key) => list.find(([code]) => code === key)?.[1] || '';

/** A medicine, route or schedule written in words. Returns the message to show, or '' when it is fine. */
export function medicineNameError(value, label = 'Medicine name', max = LIMITS.medicine) {
  if (typeof value !== 'string') return `${label} is required.`;
  const text = tidy(value);
  if (!text) return `${label} is required.`;
  if (text.length < 2) return `${label} must be at least 2 characters.`;
  if (text.length > max) return `${label} must be at most ${max} characters.`;
  if (CONTROL.test(text)) return 'Remove special control characters.';
  if (!NAME_RULE.test(text)) return 'Start with a letter or number. Use letters, numbers and . , \' " ( ) / & + % - only.';
  if (letterCount(text) < 2) return `${label} must include letters, not only numbers or symbols.`;
  return '';
}

/** The amount given each time: a number above 0 and up to 10,000, with at most four decimals. */
export function doseAmountError(value) {
  const text = String(value ?? '').trim();
  if (!text) return 'Enter the dose amount, for example 2.5.';
  if (!/^\d+(\.\d+)?$/.test(text)) return 'Use numbers only, for example 2.5.';
  if (!/^\d+(\.\d{1,4})?$/.test(text)) return 'Use at most four decimal places.';
  const amount = Number(text);
  if (!(amount > 0)) return 'The dose must be more than 0.';
  if (amount > 10000) return 'The dose cannot be more than 10,000.';
  return '';
}

/** The whole dose as saved: an amount followed by its unit, for example "2.5 mL". */
export function doseError(value, label = 'Dose') {
  if (typeof value !== 'string' || !value.trim()) return `${label} is required.`;
  const text = tidy(value);
  if (text.length > LIMITS.dose) return `${label} must be at most ${LIMITS.dose} characters.`;
  if (CONTROL.test(text)) return 'Remove special control characters.';
  const match = /^(\d[\d.]*)\s*(.*)$/.exec(text);
  if (!match) return `${label} must start with the amount, for example 2.5 mL.`;
  const amountProblem = doseAmountError(match[1]);
  if (amountProblem) return amountProblem;
  if (!/\p{L}/u.test(match[2])) return `Add the unit after the amount, for example ${match[1]} mL.`;
  return '';
}

/** What is saved with the order, built from the form's choices. */
export function orderParts(form, catalog = []) {
  const pick = (choice, other, list) => choice === OTHER ? tidy(other) : choiceLabel(list, choice);
  return {
    medicine: form.medicineChoice === OTHER ? tidy(form.medicineOther) : catalog.find(item => item.id === form.medicineChoice)?.name || '',
    dose: String(form.doseAmount ?? '').trim() && form.doseUnit ? `${String(form.doseAmount).trim()} ${form.doseUnit}` : '',
    route: pick(form.routeChoice, form.routeOther, MEDICINE_ROUTES),
    frequency: pick(form.frequencyChoice, form.frequencyOther, MEDICINE_FREQUENCIES),
  };
}

/** One message per control, so every field can explain itself while the person types. '' means fine. */
export function orderFieldErrors(form, catalog = []) {
  const errors = {};
  if (!form.medicineChoice) errors.medicineChoice = 'Choose a medicine, or add another one.';
  else if (form.medicineChoice !== OTHER && !catalog.some(item => item.id === form.medicineChoice)) errors.medicineChoice = 'Choose a medicine from the list.';
  errors.medicineOther = form.medicineChoice === OTHER ? medicineNameError(form.medicineOther, 'Medicine name', LIMITS.medicine) : '';
  errors.doseAmount = doseAmountError(form.doseAmount);
  errors.doseUnit = MEDICINE_DOSE_UNITS.includes(form.doseUnit) ? '' : 'Choose the unit.';
  for (const [key, list, label, max] of [['route', MEDICINE_ROUTES, 'route', LIMITS.route], ['frequency', MEDICINE_FREQUENCIES, 'schedule', LIMITS.frequency]]) {
    const choice = form[`${key}Choice`];
    errors[`${key}Choice`] = !choice ? `Choose the ${label}.` : list.some(([code]) => code === choice) ? '' : `Choose the ${label} from the list.`;
    errors[`${key}Other`] = choice === OTHER ? medicineNameError(form[`${key}Other`], key === 'route' ? 'Route' : 'Schedule', max) : '';
  }
  return errors;
}
