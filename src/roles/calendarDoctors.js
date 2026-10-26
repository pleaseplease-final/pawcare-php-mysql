import { isVet } from './clinicValidation.js';

const doctorName = name => /^dr\.?\s/i.test(name) ? name : `Dr. ${name}`;

/** Match live appointment IDs and always include the signed-in doctor's column. */
export function calendarDoctors(db, me, fallback = []) {
  const doctors = new Map(db.vets?.length ? db.vets.map(v => [v.id, v.name]) : fallback);
  for (const [id, name] of fallback) {
    if (db.appts?.some(a => a.vetId === id) && !doctors.has(id)) doctors.set(id, name);
  }
  if (isVet(me?.role)) {
    const id = me.vetId || me.id;
    return id ? [[id, doctorName(me.name || doctors.get(id) || 'Veterinarian')]] : [];
  }
  return [...doctors];
}
