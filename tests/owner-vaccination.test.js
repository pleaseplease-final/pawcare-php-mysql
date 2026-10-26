import { test } from 'node:test';
import assert from 'node:assert/strict';
import { currentVaccinationDue, vaccinationStatus, vaccinationAppointment, vaccinationBooking, nextVaccination } from '../src/ownerVaccination.js';

const dose = { id: 'dose1', petId: 'pet1', vaccine: 'Anti-rabies', date: '2026-09-01', createdAt: '2026-09-01T10:00:00Z', done: true, vetId: 'vet1', nextDue: '2026-10-25' };
const today = '2026-10-24';
test('an administered dose keeps its approved booster actionable, independent of completed-dose status', () => {
  const current = currentVaccinationDue([dose]);
  assert.equal(vaccinationStatus(dose, current, today), 'Due soon');
  assert.equal(vaccinationStatus(dose, current, '2026-10-26'), 'Overdue');
  assert.equal(vaccinationStatus(dose, current, '2026-10-01'), 'On track');
  assert.equal(vaccinationStatus(dose, current, '2026-10-25'), 'Due soon');
});
test('newer certification supersedes old dates, including when no next dose is requested', () => {
  const newer = { ...dose, id: 'newer', vaccine: 'Rabies booster', date: '2026-10-20', nextDue: '2027-10-20' };
  const current = currentVaccinationDue([dose, newer]);
  assert.deepEqual(current, [newer]);
  assert.equal(vaccinationStatus(dose, current, today), 'Completed');
  assert.deepEqual(currentVaccinationDue([dose, { ...newer, nextDue: null }]), []);
  assert.deepEqual(currentVaccinationDue([dose, { ...dose, id:'same-day', createdAt:'2026-09-01T11:00:00Z', nextDue:null }]), []);
});
test('uncertified protocols and imported history without a vet never become approved booster recalls', () => {
  const suggestion = { ...dose, done: false, vetId: '' };
  assert.equal(vaccinationStatus(suggestion, [], today), 'Vet review needed');
  assert.deepEqual(currentVaccinationDue([suggestion, { ...dose, vetId: '' }]), []);
});
test('appointment matching rejects unrelated, other-pet, cancelled, completed and past visits', () => {
  const visit = { petId: 'pet1', service:'vaccination', reason:'Vaccination – Anti-rabies', date: '2026-10-25', time:'10:00', status:'Pending Approval' };
  for (const changes of [{ service:'checkup' }, { reason:'Feline 4-in-1' }, { petId:'pet2' }, { status:'Cancelled' }, { status:'No-show' }, { status:'Completed' }, { date:'2026-10-23' }]) {
    assert.equal(vaccinationAppointment(dose, [{ ...visit, ...changes }], today), null);
  }
  assert.deepEqual(vaccinationAppointment(dose, [visit], today), visit);
  const later = { ...visit, date:'2026-10-27' };
  assert.deepEqual(vaccinationAppointment(dose, [later, visit], today), visit);
  const kennel={...dose,vaccine:'Kennel cough'};
  assert.ok(vaccinationAppointment(kennel,[{...visit,reason:'Vaccination – Kennel cough'}],today));
  assert.ok(vaccinationAppointment(kennel,[{...visit,reason:'Vaccination: Kennel cough'}],today));
  assert.equal(vaccinationAppointment(kennel,[{...visit,reason:'Vaccination: Feline 4-in-1'}],today), null);
});
test('booking carries the exact pet and approved due date, but moves overdue requests into the booking window', () => {
  const start = vaccinationBooking({ ...dose, nextDue:'2026-09-20' }, today, '2027-01-22');
  assert.equal(start.petId, 'pet1'); assert.equal(start.date, today); assert.equal(start.vaccineDueDate, '2026-09-20');
  assert.equal(start.service, 'vaccination');
  assert.equal(vaccinationBooking({ ...dose, nextDue:'2027-10-25' }, today, '2027-01-22').date, '');
  assert.equal(vaccinationBooking(dose, today, '2027-01-22').date, '2026-10-25');
  assert.equal(vaccinationBooking({ ...dose, vaccine:'Routine deworming' }, today, '2027-01-22').service, 'deworming');
});


test('next vaccine shows a booked vaccination even without a certified recall', () => {
  const visit = { id: 'v', petId: 'pet1', service: 'vaccination', reason: 'Vaccination – Anti-rabies', date: '2026-10-25', time: '10:00', status: 'Scheduled' };
  assert.deepEqual(nextVaccination('pet1', [], [visit], today), { recall: null, appointment: visit, matched: null });
  assert.equal(nextVaccination('pet1', [], [{ ...visit, service: '', reason: 'Vaccination – Anti-rabies' }], today).appointment.reason, visit.reason);
  for (const changes of [{ service: 'checkup' }, { petId: 'other' }, { status: 'Cancelled' }, { status: 'Completed' }, { date: '2026-10-23' }]) {
    assert.equal(nextVaccination('pet1', [], [{ ...visit, ...changes }], today).appointment, null);
  }
  assert.deepEqual(nextVaccination('pet1', [], [], today), { recall: null, appointment: null, matched: null });
});

test('reservation dates stay distinct from approved due dates, including unrelated vaccine bookings', () => {
  const visit = { petId: 'pet1', service: 'vaccination', reason: 'Vaccination – Anti-rabies', date: '2026-10-29', time: '10:00', status: 'Pending Approval' };
  const summary = nextVaccination('pet1', [dose], [visit], today);
  assert.equal(summary.recall.nextDue, '2026-10-25');
  assert.equal(summary.appointment.date, '2026-10-29');
  assert.equal(summary.matched.id, dose.id);
  const other = { ...visit, reason: 'Canine 5-in-1' };
  assert.equal(nextVaccination('pet1', [dose], [other], today).matched, null);
  assert.equal(nextVaccination('pet1', [dose], [other], today).recall.id, dose.id);
  const newer = { ...dose, id: 'newer', date: '2026-10-23', nextDue: null };
  assert.equal(nextVaccination('pet1', [dose, newer], [visit], today).recall, null);
  assert.equal(nextVaccination('pet1', [{ ...dose, done: false }], [], today).recall, null);
});

test('the earliest active vaccination booking wins without using unrelated routine visits', () => {
  const visit = { petId: 'pet1', service: 'vaccination', reason: 'Anti-rabies', date: '2026-10-29', time: '10:00', status: 'Pending Approval' };
  const earlier = { ...visit, reason: 'Canine 5-in-1', date: '2026-10-26' };
  const checkup = { ...earlier, service: 'checkup', reason: 'Routine checkup', date: today };
  assert.equal(nextVaccination('pet1', [dose], [visit, checkup, earlier], today).appointment, earlier);
});


test('deworming bookings and follow-ups remain separate from vaccination dates',()=>{
 const worm={...dose,id:'worm',vaccine:'Deworming',nextDue:'2026-11-26'};
 const visit={id:'followup',petId:worm.petId,service:'deworming',reason:'Deworming Follow-up',date:'2026-11-27',time:'09:00',status:'Scheduled'};
 assert.equal(vaccinationAppointment(worm,[visit],today),visit);
 assert.equal(nextVaccination(worm.petId,[],[visit],today).appointment,visit);
 assert.equal(nextVaccination(worm.petId,[worm],[visit],today).matched,worm);
 assert.equal(vaccinationAppointment(dose,[{...visit,reason:'Anti-rabies'}],today),null);
 assert.equal(vaccinationAppointment(worm,[{...visit,service:'vaccination',reason:'Deworming'}],today),null);
});
