import {visitFormType} from './visitForm.js';

// Visit History and the vaccination card read the same saved visit. This ties a record to
// the kind of visit it was and to the doses certified during it.
export const VISIT_TYPES = {consultation: 'Check-up / consultation', vaccination: 'Vaccination', deworming: 'Deworming', grooming: 'Grooming'};

export function recordKind(record, appointments = []) {
  const visit = appointments.find(a => a.id === record.apptId);
  return visit ? visitFormType(visit) : 'consultation';
}
export const recordDoses = (record, vaccinations = []) =>
  vaccinations.filter(v => v.done && (v.consultationId === record.id || (record.apptId && v.apptId === record.apptId)));

// What the visit was about, in plain words, instead of the standard confirmation sentence for preventive care.
export function recordHeadline(record, kind, doses) {
  if (kind === 'consultation') return record.diagnosis || 'Not recorded';
  if (doses.length) return `${doses.map(d => d.vaccine).join(', ')} given`;
  if (kind === 'grooming') return 'Grooming visit';
  return `${VISIT_TYPES[kind]} visit`;
}
