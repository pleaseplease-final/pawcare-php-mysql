import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ownerFollowUp, ownerFollowUpBooking } from '../src/ownerCare.js';
const record = { id:'care1', petId:'pet1', careStatus:'Recheck required', followUpDate:'2026-10-28', followUpReason:'Return for examination.' };
const date = '2026-10-24';
const visit = { id:'visit1', petId:'pet1', followUpId:record.id, date:'2026-10-28', time:'10:00', status:'Pending Approval' };

test('follow-up status uses the explicit request and pet, ignoring unrelated visits', () => {
  for (const other of [{...visit,followUpId:null},{...visit,followUpId:'another-care'},{...visit,petId:'pet2'}]) {
    assert.equal(ownerFollowUp(record, [other], date).status, 'Needs booking');
  }
  assert.equal(ownerFollowUp(record, [visit], date).status, 'Booked');
  assert.equal(ownerFollowUp({...record,followUpDate:null}, [], date), null);
  assert.equal(ownerFollowUp({...record,careStatus:'Routine care'}, [], date), null);
});
test('cancelled/no-show follow-ups reopen, rescheduling stays linked and only linked completion finishes care', () => {
  for (const status of ['Cancelled','Rejected','No-show']) assert.equal(ownerFollowUp(record, [{...visit,status}], date).status, 'Needs booking');
  const rescheduled={...visit,date:'2026-10-30',status:'Scheduled'};
  assert.equal(ownerFollowUp(record,[rescheduled],date).visit.date,'2026-10-30');
  assert.equal(ownerFollowUp(record,[{...visit,status:'Completed'}],date).status,'Completed');
  assert.equal(ownerFollowUp(record,[{...visit,followUpId:null,status:'Completed'}],date).status,'Needs booking');
});
test('overdue is an unbooked action, and historic completed requests remain completed', () => {
  assert.equal(ownerFollowUp(record, [], '2026-10-29').overdue, true);
  assert.equal(ownerFollowUp(record, [], '2026-10-28').overdue, false);
  assert.equal(ownerFollowUp(record, [visit], '2026-10-29').overdue, false);
  assert.equal(ownerFollowUp(record, [{...visit,status:'Completed'}], '2026-11-01').overdue, false);
});
test('booking keeps the exact request and pet while adapting only the appointment date to the booking window', () => {
  const start=ownerFollowUpBooking(record,date,'2027-01-22');
  assert.equal(start.followUpId,record.id);assert.equal(start.petId,record.petId);assert.equal(start.date,record.followUpDate);
  assert.equal(start.service,'checkup');
  assert.equal(ownerFollowUpBooking(record,'2026-11-01','2027-01-30').date,'2026-11-01');
  assert.equal(ownerFollowUpBooking({...record,followUpDate:'2027-06-01'},date,'2027-01-22').date,'');
  assert.equal(record.followUpDate,'2026-10-28');
});
