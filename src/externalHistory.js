// Owner/previous-clinic reports are a guide, never certified administered doses.
export const externalVaccineChoices = species => /dog|canine/i.test(species || '') ? ['Puppy Dose 1 (5-in-1)','Puppy Dose 2 (5-in-1)','Puppy Dose 3 (5-in-1)','Completed Puppyhood Series (Adult)','Anti-Rabies Vaccine','Kennel Cough (Bordetella)','Prior Deworming'] : /cat|feline/i.test(species || '') ? ['FVRCP 4-in-1 Dose 1','FVRCP 4-in-1 Dose 2','Anti-Rabies Vaccine','Prior Deworming'] : ['Prior vaccination','Prior parasite treatment'];
export function externalHistoryErrors({priorVaccines = [],externalClinicNotes = ''}) {
  const errors = {};
  if (!Array.isArray(priorVaccines) || priorVaccines.length>20 || priorVaccines.some(v=>typeof v!=='string' || !v.trim() || v.trim().length>120 || !/[\p{L}]/u.test(v) || /[\u0000-\u001f\u007f]/.test(v)) || new Set(priorVaccines.map(v=>typeof v==='string'?v.trim().toLowerCase():v)).size!==priorVaccines.length) errors.priorVaccines='Use up to 20 different vaccine names, each with words and at most 120 characters.';
  if (typeof externalClinicNotes!=='string' || externalClinicNotes.length>1000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(externalClinicNotes) || externalClinicNotes.trim() && !/[\p{L}]/u.test(externalClinicNotes)) errors.externalClinicNotes='Use words for the previous clinic, dates or notes (up to 1,000 characters).';
  return errors;
}
export const addressError = value => value && (value.length>150 || !/[\p{L}]/u.test(value) || value.trim().length<5) ? 'Enter an address with a street or locality name (5–150 characters), or leave it blank.' : '';
