import {test} from 'node:test';
import assert from 'node:assert/strict';
import {vetQueue, certifiedRecalls, completedVisitRecord, consultationAppointment} from '../src/vetQueue.js';
const date = '2026-10-25';
const visit = (id, status = 'Checked-in', triageLevel = 'Routine', time = '08:00', extra = {}) => ({id, petId:'pet', vetId:'v1', date, time, status, intakeVitals:{triageLevel}, ...extra});

test('waiting queue prioritizes triage, then date/time and stable IDs without changing source', () => {
  const rows = [visit('routine'), visit('p2',undefined,'Priority','10:00'), visit('p1',undefined,'Priority','09:00'), visit('er',undefined,'Emergency','11:00'), visit('old',undefined,'Priority','15:00',{date:'2026-10-24'})];
  assert.deepEqual(vetQueue(rows,date).waiting.map(a=>a.id), ['er','old','p1','p2','routine']);
  assert.deepEqual(rows.map(a=>a.id), ['routine','p2','p1','er','old']);
});
test('separate stages preserve unfinished prior-day visits and respect doctor scope', () => {
  const rows = [visit('wait'), visit('active','In consultation'), visit('done','Completed'), visit('expected','Scheduled'), visit('scheduled','Pending Approval'), visit('cancelled','Cancelled'), visit('missed','No-show'), visit('old-active','In consultation',undefined,undefined,{date:'2026-10-24'}), visit('old-done','Completed',undefined,undefined,{date:'2026-10-24'}), visit('other',undefined,undefined,undefined,{vetId:'v2'})];
  const q = vetQueue(rows,date,['v1']);
  assert.deepEqual(q.waiting.map(a=>a.id),['wait']);
  assert.deepEqual(q.active.map(a=>a.id),['old-active','active']);
  assert.deepEqual(q.completed.map(a=>a.id),['done']);assert.equal(q.expected,2);
  assert.equal(vetQueue(rows,date).waiting.length,2);
});
test('recalls count latest certified dose per vaccine family, including overdue, never suggestions', () => {
  const dose={id:'old',petId:'pet',vaccine:'DHPP',date:'2026-01-01',nextDue:'2026-10-01',done:true,vetId:'v1'};
  const latest={...dose,id:'latest',vaccine:'5-in-1',date:'2026-10-24',nextDue:'2026-11-08'};
  const overdue={...dose,id:'rabies',vaccine:'Anti-rabies'};
  const suggestion={...dose,id:'suggestion',petId:'new',done:false};
  assert.deepEqual(certifiedRecalls([dose,latest,overdue,suggestion,{...dose,id:'uncertified',petId:'other',vetId:''}], '2026-11-08'),[latest,overdue]);
  assert.deepEqual(certifiedRecalls([dose,{...latest,nextDue:null}], '2026-11-08'),[]);
  assert.deepEqual(certifiedRecalls([latest], '2026-11-07'),[]);
});
test('completed notes require the exact visit and patient, with no fallback to another pet visit', () => {
  const v=visit('done','Completed');
  const wrong={id:'wrong',petId:'pet',apptId:'other',date};
  const exact={id:'saved',petId:'pet',apptId:'done',date};
  assert.equal(completedVisitRecord([wrong,exact],v),exact);
  assert.equal(completedVisitRecord([wrong,{...exact,petId:'other-pet'}],v),null);
});
test('summary intake uses explicit visit linkage; ambiguous legacy dates never supply vitals', () => {
  const exact=visit('exact'), other=visit('other');
  const record={petId:'pet',date,apptId:'exact'};
  assert.equal(consultationAppointment([other,exact],record),exact);
  assert.equal(consultationAppointment([other],record),null);
  assert.equal(consultationAppointment([other,{...exact,petId:'other-pet'}],record),null);
  assert.equal(consultationAppointment([other,exact],{...record,apptId:''}),null);
  assert.equal(consultationAppointment([exact],{...record,apptId:''}),exact);
});

test('saved visit doses use explicit linkage, never same-day coincidence', async()=>{
 const {vaccinationsForVisit}=await import('../src/vetQueue.js');
 const r={id:'r',petId:'p',apptId:'a',date};
 const dose={petId:'p',date,done:true,vetId:'v'};
 const rows=[{...dose,id:'exact',consultationId:'r'},{...dose,id:'appt',apptId:'a'},{...dose,id:'other',apptId:'a',consultationId:'other'},{...dose,id:'legacy'},{...dose,id:'wrong-pet',petId:'other',consultationId:'r'}];
 assert.deepEqual(vaccinationsForVisit(rows,r).map(v=>v.id),['exact','appt']);
});
