import { followUpVisit } from './clinicalWorkflow.js';
import { today, lastDay } from './booking.js';

export function ownerFollowUp(record, appointments, date = today()) {
  if (!record.followUpDate || record.careStatus === 'Routine care') return null;
  const visit = followUpVisit(record, appointments.filter(a => a.petId === record.petId));
  const completed = visit?.status === 'Completed';
  const booked = visit && ['Pending Approval', 'Scheduled', 'Checked-in', 'In consultation'].includes(visit.status);
  return { visit, status: completed ? 'Completed' : booked ? 'Booked' : 'Needs booking', overdue: !completed && !booked && record.followUpDate < date };
}

export function ownerFollowUpBooking(record, date = today(), last = lastDay()) {
  return {
    petId: record.petId,
    followUpId: record.id,
    service: 'checkup',
    reason: 'Consultation',
    date: record.followUpDate > last ? '' : record.followUpDate < date ? date : record.followUpDate
  };
}
