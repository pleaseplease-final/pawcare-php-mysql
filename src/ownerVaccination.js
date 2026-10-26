import { currentVaccinationDue, vaccineFamily } from './vaccinationDue.js';
import { today, lastDay } from './booking.js';

export { currentVaccinationDue };

export function vaccinationStatus(record, current, date = today()) {
  if (record.batch==='EXTERNAL-HIST' || /external history.*guide/i.test(record.protocolType || '')) return 'External reference · unverified';
  if (!record.done) return 'Vet review needed';
  if (!current.some(v => v.id === record.id)) return 'Completed';
  if (record.nextDue < date) return 'Overdue';
  const soon = new Date(`${date}T00:00:00Z`);
  soon.setUTCDate(soon.getUTCDate() + 14);
  return record.nextDue <= soon.toISOString().slice(0, 10) ? 'Due soon' : 'On track';
}

// A same-day visit for another service is not a vaccination reservation.
// Match only an active visit that explicitly names this vaccine family.
export function vaccinationAppointment(record, appointments, date = today()) {
  return appointments.filter(a => a.petId === record.petId && a.date >= date &&
    ['Pending Approval', 'Scheduled', 'Checked-in', 'In consultation'].includes(a.status) &&
    (!a.service || ['vaccination', 'deworming'].includes(a.service)) &&
    (/deworm/i.test(record.vaccine) ? (a.service==='deworming' || !a.service && /deworm/i.test(a.reason || '')) : a.service!=='deworming' && vaccineFamily((a.reason || '').replace(/^vaccination\s*[–:-]\s*/i, '')) === vaccineFamily(record.vaccine)))
    .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))[0] || null;
}

// A reservation can exist before a certified dose/booster date is recorded.
// Keep reservation details separate from the vet-approved recall.
export function nextVaccination(petId, records, appointments, date = today()) {
  const recalls = currentVaccinationDue(records).filter(v => v.petId === petId)
    .sort((a, b) => a.nextDue.localeCompare(b.nextDue));
  const recall = recalls[0] || null;
  const visits = appointments.filter(a => a.petId === petId && a.date >= date &&
    ['Pending Approval', 'Scheduled', 'Checked-in', 'In consultation'].includes(a.status));
  const appointment = visits
    .filter(a => ['vaccination','deworming'].includes(a.service) || (!a.service && /^(?:vaccination|deworming)\s*[–:-]/i.test(a.reason || '')) || recalls.some(v => vaccinationAppointment(v, [a], date)))
    .sort((a, b) => `${a.date}${a.time || ''}`.localeCompare(`${b.date}${b.time || ''}`))[0] || null;
  const matched = appointment ? recalls.find(v => vaccinationAppointment(v, [appointment], date)) || null : null;
  return { recall, appointment, matched };
}

export function vaccinationBooking(record, date = today(), last = lastDay()) {
  const target = record.nextDue || date;
  return {
    petId: record.petId,
    service: /deworm/i.test(record.vaccine) ? 'deworming' : 'vaccination',
    reason: record.vaccine || 'Vaccination',
    date: target > last ? '' : target < date ? date : target,
    vaccineDueDate: record.nextDue || '',
    fromVaccineCard: true,
    vaccineName: record.vaccine
  };
}
