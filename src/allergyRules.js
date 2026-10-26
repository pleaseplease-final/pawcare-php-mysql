// Known allergies shown to every veterinarian who sees the patient. Same rules in the form and on the server.
export const MAX_ALLERGIES = 10;
export const allergyName = value => String(value ?? '').trim().replace(/\s{2,}/g, ' ');

// Message for one entry being added to `list`, or '' when it is fine.
export function allergyEntryError(value, list = []) {
  const name = allergyName(value);
  if (!name) return 'Enter an allergy.';
  if (name.length < 2) return 'Use at least 2 characters.';
  if (name.length > 40) return 'Keep each allergy under 40 characters.';
  if (!/\p{L}/u.test(name) || !/^[\p{L}0-9 .,'’()\/&+-]+$/u.test(name)) return 'Use a name, for example Chicken or Pollen. Letters and numbers only.';
  if (list.some(item => allergyName(item).toLowerCase() === name.toLowerCase())) return `${name} is already on the list.`;
  if (list.length >= MAX_ALLERGIES) return `List up to ${MAX_ALLERGIES} allergies. Remove one first.`;
  return '';
}
// Message for a whole list, or ''.
export function allergyListError(list) {
  if (!Array.isArray(list)) return 'Send the allergies as a list.';
  if (list.length > MAX_ALLERGIES) return `List up to ${MAX_ALLERGIES} allergies.`;
  for (let i = 0; i < list.length; i++) {
    if (typeof list[i] !== 'string') return 'Each allergy must be text.';
    const error = allergyEntryError(list[i], list.slice(0, i));
    if (error) return error;
  }
  return '';
}
