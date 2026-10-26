import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dailyCollections, pendingCheckout, paymentDate, paymentTime, paymentMethod, assistantQueue } from '../src/assistantWorkflow.js';
const date = '2026-10-25';
const paid = {id:'paid', date:'2026-10-20',status:'Completed',billingStatus:'Paid',paidAt:'2026-10-24T16:30:00Z',amount:123.45,paymentMethod:'Cash'};

test('collections follow the actual payment date in Manila, independent of visit date', () => {
  const prior={...paid,id:'prior',date,paidAt:'2026-10-24T15:59:59Z',amount:500};
  const unpaid={...paid,id:'unpaid',billingStatus:'Unbilled'};
  const result=dailyCollections([paid,prior,unpaid],date);
  assert.deepEqual(result.paid,[paid]);assert.equal(result.total,123.45);
  assert.equal(paymentDate(paid.paidAt),date);
  assert.equal(paymentDate(prior.paidAt),'2026-10-24');
  assert.equal(paymentDate('2026-10-25T00:30:00+08:00'),date);
  assert.equal(paymentTime(null),'Not recorded');
});
test('missing or ambiguous legacy payment dates remain visible without assigning them to a day', () => {
  const invalid=[null,'','09:30:00 AM','2026-10-25','2026-10-25T10:00:00','invalid','2026-02-30T10:00:00Z'];
  const fixtures=invalid.map((paidAt,i)=>({...paid,id:`undated${i}`,paidAt}));
  const result=dailyCollections(fixtures,date);
  assert.deepEqual(result.undated,fixtures);assert.equal(result.total,0);
  assert.equal(dailyCollections(fixtures,'').paid.length,0);
  for(const input of invalid) assert.equal(paymentDate(input),'');
});
test('historical payments use saved amounts, precise cents and mutually exclusive method buckets', () => {
  const fixtures=[' Cash ','GCash','Maya','Credit Card','Debit Card',null,'Bank transfer'].map((paymentMethod,i)=>({...paid,id:`p${i}`,amount:0.1,paymentMethod,invoiceItems:[{name:'Historic custom item',qty:1,price:999}]}));
  const result=dailyCollections(fixtures,date);
  assert.equal(result.total,0.7);
  assert.deepEqual(result.methods,{cash:0.1,gcash:0.1,maya:0.1,card:0.2,other:0.1,unrecorded:0.1});
  assert.equal(paymentMethod('  '),'unrecorded');assert.equal(paymentMethod('card'),'card');
  assert.equal(fixtures[0].amount,0.1);
});
test('invalid saved payment amounts are disclosed, with no fallback to itemized charges', () => {
  const fixtures=[null,-1,'123.45',NaN,Infinity,0.001].map((amount,i)=>({...paid,id:`bad${i}`,amount}));
  const result=dailyCollections([paid,...fixtures],date);
  assert.equal(result.total,123.45);assert.equal(result.missingAmounts,6);
});
test('pending amounts only sum valid saved drafts after discount, never booking placeholders', () => {
  const missing={...paid,id:'missing',date,billingStatus:'Unbilled',amount:600,invoiceItems:[]};
  const draft={...missing,id:'draft',invoiceItems:[{name:'Saved item',qty:3,price:0.1}],discount:0.1};
  const invalid={...missing,id:'invalid',invoiceItems:[{name:'Bad draft',qty:1,price:100}],discount:101};
  const result=pendingCheckout([missing,draft,invalid,paid,{...draft,id:'future',date:'2026-10-26'},{...draft,id:'scheduled',status:'Pending Approval'}],date);
  assert.equal(result.draftTotal,0.2);assert.equal(result.awaitingInvoice,2);
  assert.deepEqual(result.visits,[missing,draft,invalid]);
});
test('patient stages separate arrivals, waiting, consultation, completed and missed visits', () => {
  const visits=['Pending Approval','Scheduled','Checked-in','In consultation','Completed','No-show','Cancelled'].map((status,i)=>({id:`v${i}`,date,status,time:'10:00'}));
  const result=assistantQueue([...visits,{...visits[2],id:'other-day',date:'2026-10-26'}],date);
  assert.deepEqual(result.arrivals,[visits[1]]);assert.deepEqual(result.waiting,[visits[2]]);
  assert.deepEqual(result.consultation,[visits[3]]);assert.deepEqual(result.completed,[visits[4]]);
  assert.deepEqual(result.missed,[visits[5]]);assert.equal(result.visits.length,6);
});
test('waiting patients show emergency then priority, using appointment time to break ties', () => {
  const visit=(id,triageLevel,time)=>({id,date,time,status:'Checked-in',intakeVitals:{triageLevel}});
  const routine=visit('routine','Routine','08:00'),p2=visit('p2','Priority','10:00'),p1=visit('p1','Priority','09:00'),emergency=visit('urgent','Emergency','11:00');
  const visits=[routine,p2,p1,emergency];
  assert.deepEqual(assistantQueue(visits,date).waiting,[emergency,p1,p2,routine]);
  assert.deepEqual(visits,[routine,p2,p1,emergency]);
});

test('unfinished arrivals survive midnight while daily statistics stay on their visit date', () => {
  const yesterday='2026-10-24';
  const visit=(id,status,day,triageLevel='Routine')=>({id,status,date:day,time:'10:00',intakeVitals:{triageLevel}});
  const waiting=visit('older-waiting','Checked-in',yesterday), active=visit('older-active','In consultation',yesterday);
  const emergency=visit('today-emergency','Checked-in',date,'Emergency');
  const completed=visit('older-completed','Completed',yesterday), scheduled=visit('older-scheduled','Pending Approval',yesterday);
  const todayDone=visit('today-completed','Completed',date);
  const result=assistantQueue([completed,scheduled,waiting,active,todayDone,emergency],date);
  assert.deepEqual(result.waiting,[emergency,waiting]);assert.deepEqual(result.consultation,[active]);
  assert.deepEqual(result.completed,[todayDone]);assert.deepEqual(result.arrivals,[]);
  assert.deepEqual(result.visits,[todayDone,emergency]);
});

test('approval inbox includes today and future Pending Approval visits independently of the daily queue', async () => {
  const { pendingVisitApprovals } = await import('../src/assistantWorkflow.js');
  const visit = {id:'today',date,time:'11:00',status:'Pending Approval'};
  const future = {...visit,id:'future',date:'2026-11-05',time:'08:00'};
  const early = {...visit,id:'early',time:'08:00'};
  const all = [future, visit, {...visit,id:'past',date:'2026-10-24'}, {...future,id:'confirmed',status:'Scheduled'}, {...future,id:'cancelled',status:'Cancelled'}, early];
  assert.deepEqual(pendingVisitApprovals(all,date).map(a => a.id), ['early','today','future','past']);
  assert.deepEqual(assistantQueue(all,date).arrivals.map(a => a.id), []);
  assert.equal(all[0], future, 'does not reorder the clinic store');
  assert.equal(pendingVisitApprovals(all.map(a => a.id === 'future' ? {...a,status:'Scheduled'} : a),date).some(a => a.id === 'future'),false);
});

test('checkout summary holds admitted pets until discharge approval and preserves outpatient checkout',()=>{
 const base={id:'outpatient',date,status:'Completed',billingStatus:'Unbilled',invoiceItems:[{name:'Consultation',price:500,qty:1}]};
 const rows=[base,{...base,id:'admitted',admissionStatus:'Admitted'},{...base,id:'ready',admissionStatus:'Ready for discharge'}];
 assert.deepEqual(pendingCheckout(rows,date).visits.map(a=>a.id),['outpatient','ready']);
});

 test('masterlist keeps later active arrival visible after an earlier completed visit', async () => {
  const {currentAppointmentsByPet}=await import('../src/assistantWorkflow.js');
  const base={petId:'p',date:'2026-10-26'};
  const rows=[{...base,id:'done',status:'Completed',time:'08:00'},{...base,id:'arrive',status:'Scheduled',time:'10:00'},{...base,id:'cancel',status:'Cancelled',time:'07:00'}];
  assert.equal(currentAppointmentsByPet(rows,base.date).p.id,'arrive');
  assert.equal(currentAppointmentsByPet(rows.slice(0,1),base.date).p.id,'done');
  assert.deepEqual(currentAppointmentsByPet(rows,'2026-10-27'),{});
 });
