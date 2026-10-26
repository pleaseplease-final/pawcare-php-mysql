import {chronologicalAppointments,upcomingAppointments} from './appointmentOrder.js';
import { ownerBill } from './ownerBilling.js';
import { today } from './booking.js';

// A visit date or a time-only legacy value cannot establish a payment date.
function paymentTimestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const date = new Date(value), calendar = new Date(value.slice(0, 10) + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && Number.isFinite(calendar.getTime()) && calendar.toISOString().slice(0,10) === value.slice(0,10) ? date : null;
}
export function paymentDate(value) {
  const date = paymentTimestamp(value);
  if (!date) return '';
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date).map(p => [p.type,p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
export function paymentTime(value) {
  const date = paymentTimestamp(value);
  return date ? date.toLocaleTimeString('en-PH', {timeZone:'Asia/Manila',hour:'2-digit',minute:'2-digit'}) : 'Not recorded';
}
export const money = value => value === null ? 'Not recorded' : `₱${value.toLocaleString('en-PH', {minimumFractionDigits:2,maximumFractionDigits:2})}`;
export function paymentMethod(value) {
  const name = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!name) return 'unrecorded';
  if (name === 'cash') return 'cash';
  if (name === 'gcash') return 'gcash';
  if (name === 'maya') return 'maya';
  if (['card','credit card','debit card','credit / debit card'].includes(name)) return 'card';
  return 'other';
}
function sumAmounts(appointments) {
  let cents = 0;
  for (const a of appointments) {
    const amount = ownerBill(a).amount;
    if (amount !== null) cents += Math.round(amount * 100);
  }
  return Number.isSafeInteger(cents) ? cents / 100 : null;
}
export function dailyCollections(appointments, date = today()) {
  const allPaid = appointments.filter(a => a.billingStatus === 'Paid');
  const paid = allPaid.filter(a => paymentDate(a.paidAt) && paymentDate(a.paidAt) === date).sort((a,b) => Date.parse(a.paidAt) - Date.parse(b.paidAt) || a.id.localeCompare(b.id));
  const undated = allPaid.filter(a => !paymentDate(a.paidAt));
  const methods = Object.fromEntries(['cash','gcash','maya','card','other','unrecorded'].map(key => [key, sumAmounts(paid.filter(a => paymentMethod(a.paymentMethod) === key))]));
  return {paid,undated,total:sumAmounts(paid),methods,missingAmounts:paid.filter(a => ownerBill(a).amount === null).length};
}
export function pendingCheckout(appointments, date = today()) {
  const visits = appointments.filter(a => a.date === date && a.status === 'Completed' && a.billingStatus !== 'Paid' && a.admissionStatus !== 'Admitted');
  return {visits, draftTotal:sumAmounts(visits), awaitingInvoice:visits.filter(a => ownerBill(a).amount === null).length};
}
export const overdueVisits = (appointments, date = today()) => appointments
  .filter(a => a.date < date && ['Scheduled','Pending Approval'].includes(a.status))
  .sort((a,b) => (b.date+b.time).localeCompare(a.date+a.time));
const priority = a => ({Emergency:0,Priority:1,Routine:2}[a.intakeVitals?.triageLevel] ?? 2);
export function assistantQueue(appointments, date = today()) {
  const visits = appointments.filter(a => a.date === date && a.status !== 'Cancelled');
  const chronological = chronologicalAppointments;
  const unfinished = appointments.filter(a => a.date < date && ['Checked-in','In consultation'].includes(a.status));
  const flow = [...unfinished, ...visits];
  const byStatus = statuses => flow.filter(a => statuses.includes(a.status)).sort(chronological);
  return {
    visits,
    arrivals:byStatus(['Scheduled']),
    waiting:byStatus(['Checked-in']).sort((a,b) => priority(a)-priority(b) || chronological(a,b)),
    consultation:byStatus(['In consultation']),
    completed:byStatus(['Completed']),
    missed:byStatus(['No-show']),
    // Earlier-day visits that were never checked in would otherwise sit unseen on the calendar.
    overdue:overdueVisits(appointments,date)
  };
}

// Keep future requests visible independently of today's arrival/triage queue.
export function pendingVisitApprovals(appointments, date = today()) {
  return appointments.filter(a => a.status === 'Pending Approval')
    .sort((a,b)=>upcomingAppointments(a,b,date));
}

export function registrationsWithoutVisit(db) {
 const booked=new Set((db.appts || []).filter(a=>a.status==='Pending Approval').map(a=>a.petId));
 return (db.petRequests || []).filter(r=>r.status==='Pending' && !booked.has(r.petId));
}

// Keep an earlier completed visit from hiding today's active arrival.
export function currentAppointmentsByPet(appointments, date = today()) {
  const rank = {'In consultation':0,'Checked-in':1,Scheduled:2,'Pending Approval':3,Completed:4};
  const rows = appointments.filter(a => a.date === date && rank[a.status] !== undefined)
    .sort((a,b) => rank[a.status]-rank[b.status] || chronologicalAppointments(a,b));
  return Object.fromEntries([...new Set(rows.map(a=>a.petId))].map(id=>[id,rows.find(a=>a.petId===id)]));
}
