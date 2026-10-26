import {test} from 'node:test';
import assert from 'node:assert/strict';
import {intakeFieldsError,checkInDateError,intakeVisitSnapshot,sameIntakeVisit,savedIntakeVisit} from '../src/intakeVisit.js';
const visit={id:'visit',petId:'pet',vetId:'vet',date:'2026-10-24',time:'09:00',reason:'Examination',status:'Checked-in',intakeVitals:{weight:5.25,temp:38.6,notes:'Saved observations',fasted:false}};
test('database and browser intake snapshots agree regardless of JSON property order',()=>{
 const raw={id:'visit',pet_id:'pet',vet_id:'vet',date:visit.date,time:visit.time,reason:visit.reason,status:visit.status,intake_vitals:{notes:'Saved observations',temp:38.6,fasted:false,weight:5.25}};
 assert.equal(sameIntakeVisit(raw,visit),true);
 assert.deepEqual(intakeVisitSnapshot(raw),intakeVisitSnapshot(visit));
 assert.equal(sameIntakeVisit({...visit,amount:600,billingStatus:'Paid'},visit),true);
});
test('changed measurements, visit ownership, assignment, slot, reason or stage invalidate intake',()=>{
 for(const change of [{id:'other'},{petId:'other'},{vetId:'other'},{date:'2026-10-25'},{time:'10:00'},{reason:'Changed'},{status:'In consultation'},{intakeVitals:{...visit.intakeVitals,weight:6}},{intakeVitals:{...visit.intakeVitals,notes:'Updated observations'}}]) assert.equal(sameIntakeVisit({...visit,...change},visit),false);
 assert.equal(sameIntakeVisit(null,visit),false);
});
test('intake acknowledgment retains server values and rejects incomplete or wrong visit responses',()=>{
 const response={success:true,appointment:{...visit,intakeVitals:{...visit.intakeVitals,weight:5.5},time:'09:03',booking_kind:'walk-in'}};
 assert.equal(savedIntakeVisit(response,visit).intakeVitals.weight,5.5);
 assert.equal(savedIntakeVisit(response,visit).time,'09:03');
 assert.equal(savedIntakeVisit(response,visit).bookingKind,'walk-in');
 for(const result of [{success:true},{success:false,appointment:visit},{success:true,appointment:{...visit,id:'wrong'}},{success:true,appointment:{...visit,petId:'wrong'}},{success:true,appointment:{...visit,status:'Pending Approval'}},{success:true,appointment:{...visit,intakeVitals:{weight:'5',temp:38}}}]) assert.throws(()=>savedIntakeVisit(result,visit),/did not confirm/);
});

test('initial intake requires the scheduled day while ongoing intake survives midnight',()=>{
 for(const status of ['Pending Approval','Scheduled']) {
   assert.equal(checkInDateError({...visit,status},visit.date),null);
   for(const date of ['2026-10-23','2026-10-25',undefined]) assert.match(checkInDateError({...visit,status,date},visit.date),/scheduled day/);
 }
 assert.equal(checkInDateError(visit,'2026-10-25'),null);
});


test('active consultation remeasurement acknowledgment preserves its visit stage after midnight',()=>{
 const active={...visit,status:'In consultation'};
 assert.equal(checkInDateError(active,'2026-10-26'),null);
 assert.equal(savedIntakeVisit({success:true,appointment:active},active).status,'In consultation');
 assert.throws(()=>savedIntakeVisit({success:true,appointment:visit},active),/did not confirm/);
});

test('server intake boundary rejects numeric-only visit reasons',()=>{
 const vitals={weight:12,temp:38.5,triageLevel:'Routine',fasted:false};
 assert.match(intakeFieldsError(vitals,'455555555'),/words/);
 assert.equal(intakeFieldsError(vitals,'5-in-1 vaccine'),null);
});
