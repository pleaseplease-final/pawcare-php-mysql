import { currentVaccinationDue } from './vaccinationDue.js';

const priority = visit => ({Emergency: 0, Priority: 1}[visit.intakeVitals?.triageLevel] ?? 2);
const chronological = (a, b) => String(a.date || '').localeCompare(String(b.date || ''))
  || String(a.time || '').localeCompare(String(b.time || '')) || String(a.id).localeCompare(String(b.id));
export function vetQueue(appointments, date, vetIds = null) {
  // Keep unfinished arrivals visible across midnight; completed visits belong to their visit date.
  const visits = appointments.filter(a => (a.date === date || ['Checked-in', 'In consultation'].includes(a.status))
    && a.status !== 'Cancelled' && (!vetIds || vetIds.includes(a.vetId)));
  return {
    waiting: visits.filter(a => a.status === 'Checked-in').sort((a,b) => priority(a) - priority(b) || chronological(a,b)),
    active: visits.filter(a => a.status === 'In consultation').sort(chronological),
    completed: visits.filter(a => a.status === 'Completed').sort(chronological),
    expected: visits.filter(a => ['Pending Approval', 'Scheduled'].includes(a.status)).length,
  };
}
export const certifiedRecalls = (records, through) => currentVaccinationDue(records).filter(v => v.nextDue <= through);
export const completedVisitRecord = (records, visit) => records.find(r => r.apptId === visit.id && r.petId === visit.petId) || null;

export function consultationAppointment(appointments, record) {
  if (record.apptId) return appointments.find(a => a.id === record.apptId && a.petId === record.petId) || null;
  const matches = appointments.filter(a => a.petId === record.petId && a.date === record.date);
  return matches.length === 1 ? matches[0] : null;
}

export function vaccinationsForVisit(vaccinations, record) {
  return vaccinations.filter(v => v.petId === record.petId && v.done && v.vetId &&
    (v.consultationId ? v.consultationId === record.id : !!record.apptId && v.apptId === record.apptId));
}
