import {test} from 'node:test';
import assert from 'node:assert/strict';
import {upcomingAppointments,chronologicalAppointments} from '../src/appointmentOrder.js';
import {bookingReason,bookingReasonErrors} from '../src/bookingReason.js';

test('nearest upcoming date takes precedence across statuses; history follows newest first',()=>{
 const visits=[{id:'far',date:'2026-11-20',time:'10:00',status:'Scheduled'},{id:'old',date:'2026-10-01',time:'10:00',status:'Pending Approval'},{id:'near',date:'2026-10-26',time:'10:00',status:'Pending Approval'},{id:'today',date:'2026-10-25',time:'08:00',status:'Completed'},{id:'yesterday',date:'2026-10-24',time:'10:00',status:'Cancelled'}];
 assert.deepEqual(visits.sort((a,b)=>upcomingAppointments(a,b,'2026-10-25')).map(a=>a.id),['today','near','far','yesterday','old']);
});
test('calendar times sort chronologically with legacy AM/PM and untimed events last',()=>{
 const visits=['1:00 PM','09:30','8:00 AM','12:00 PM','11:30 AM',''].map(time=>({date:'2026-10-26',time}));
 assert.deepEqual(visits.sort(chronologicalAppointments).map(a=>a.time),['8:00 AM','09:30','11:30 AM','12:00 PM','1:00 PM','']);
});
test('reason choices validate Other as it is edited and clear when choice changes',()=>{
 assert.ok(bookingReasonErrors('checkup','','').reasonChoice);
 assert.ok(bookingReasonErrors('missing','Other','Skin concern').service);
 for(const text of ['', 'ab', '123', {}, ['fever'], 'x'.repeat(201)])assert.ok(bookingReasonErrors('checkup','Other',text).otherReason);
 assert.deepEqual(bookingReasonErrors('checkup','Other','Nangangati ang balat'),{});
 assert.deepEqual(bookingReasonErrors('checkup','Skin or ear problem','123'),{});
 assert.deepEqual(bookingReasonErrors('vaccination','',''),{});
 assert.ok(bookingReasonErrors('grooming','Annual check-up','').reasonChoice);
 assert.equal(bookingReason('surgery','Other','  Dental pain  '),'Surgery – Dental pain');
});
