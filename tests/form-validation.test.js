import { test } from 'node:test';
import assert from 'node:assert/strict';
import { admissionErrors, medicineErrors, medicineEventTime, paymentErrors, intakeErrors, noteChoiceError } from '../src/formValidation.js';

const form={apptId:'visit',clinicalNote:'Observed care',carePlan:'Vet monitoring plan',ownerUpdate:'Under observation',temp:'',weight:'',dischargeInstructions:'',nextObservationAt:'2099-10-25T15:00',observationInstructions:'Check observations',consentConfirmed:true,consentName:'Synthetic owner',consentMethod:'Phone',emergencyName:'Synthetic contact',emergencyPhone:'+639170000001',emergencyRelationship:'Owner'};
test('admission required notes, optional measurements and discharge requirements follow action',()=>{
  assert.ok(Object.values(admissionErrors(form,{mode:'create',vet:true,visits:[{id:'visit'}]})).every(v=>!v));
  const errors=admissionErrors({...form,clinicalNote:'  ',temp:'32.9',weight:'120.01',ownerUpdate:''},{mode:'create',vet:true,visits:[]});
  for(const key of ['apptId','clinicalNote','temp','weight','ownerUpdate']) assert.ok(errors[key],key);
  assert.ok(admissionErrors(form,{mode:'discharge',vet:true}).dischargeInstructions);
  assert.equal(admissionErrors({...form,carePlan:'',temp:'99'},{mode:'release',vet:false}).temp,'');
});
const admission={admittedAt:'2026-10-25T00:00:00Z'},order={ordered_at:'2026-10-25T01:00:00.999Z',catalog_id:'medicine',supply_limit:2};
const medicine={clinicalNote:'Observed response',ownerUpdate:'',result:'Given',occurredAt:'2026-10-25T09:00:00',billableQuantity:'2'};
const context={action:'medication',admission,order,now:Date.parse('2026-10-25T02:00:00Z')};
test('medicine event time is strict, safe and explicitly Manila time',()=>{
  assert.equal(medicineEventTime(medicine.occurredAt),Date.parse('2026-10-25T01:00:00Z'));
  for(const value of ['', 'not-a-date','2026-02-30T12:00','2026-10-25T24:00','2026-10-25T09:00Z']) assert.ok(Number.isNaN(medicineEventTime(value)),value);
  assert.equal(medicineErrors(medicine,context).occurredAt,'');
  assert.ok(medicineErrors({...medicine,occurredAt:'2026-10-25T08:59:59'},context).occurredAt);
  assert.ok(medicineErrors({...medicine,occurredAt:'2026-10-25T10:00:01'},context).occurredAt);
});
test('medicine feedback follows actual result, authorization and shared corrections',()=>{
  for(const qty of ['', '-1','0.5','3','Infinity']) assert.ok(medicineErrors({...medicine,billableQuantity:qty},context).billableQuantity,qty);
  assert.equal(medicineErrors({...medicine,result:'Held',billableQuantity:'99'},context).billableQuantity,undefined);
  assert.ok(medicineErrors(medicine,{...context,action:'correct-medication',event:{ownerUpdate:'Shared'}}).ownerUpdate);
  const errors=medicineErrors({...medicine,medicine:'  ',dose:'',route:'',frequency:'',catalogId:'medicine',supplyLimit:'0'},{...context,action:'order'});
  for(const key of ['medicine','dose','route','frequency','supplyLimit'])assert.ok(errors[key],key);
});
const payment={items:[{catalogId:'home',price:100,qty:2}],method:'Cash',cashTendered:'200',refNo:'',prescribed:[{catalogId:'home',quantity:2}]};
test('billing rejects fractional and unauthorized quantities without changing typed values',()=>{
  for(const qty of ['', '0','1.5','3','1001']) {
    const data={...payment,items:[{...payment.items[0],qty}]};
    assert.ok(paymentErrors(data)['qty-0']);assert.equal(data.items[0].qty,qty);
  }
  assert.equal(paymentErrors(payment)['qty-0'],'');
});
test('billing immediately revalidates cash when invoice changes',()=>{
  assert.ok(Object.values(paymentErrors(payment)).every(v=>!v));
  assert.ok(paymentErrors({...payment,cashTendered:'199.99'}).cashTendered);
  assert.ok(paymentErrors({...payment,cashTendered:'200.001'}).cashTendered);
  assert.ok(paymentErrors({...payment,method:'Unknown'}).method);
  assert.equal(paymentErrors(payment).discount,undefined);
  assert.ok(paymentErrors({...payment,items:[{catalogId:'other',qty:1000,price:10001}]}).invoice);
  assert.ok(paymentErrors({...payment,method:'GCash',refNo:' a '}).refNo);
  assert.equal(paymentErrors({...payment,method:'GCash',refNo:'abcd'}).cashTendered,undefined);
  assert.ok(Object.values(paymentErrors({...payment,items:[{catalogId:'home',qty:1,price:0.1},{catalogId:'other',qty:1,price:0.2}],cashTendered:'0.30'})).every(v=>!v));
});
test('intake and editable clinic choices show required, range, length and duplicate errors',()=>{
  assert.ok(Object.values(intakeErrors({weight:'0.05',temp:'45',reason:'Checkup',notes:''})).every(v=>!v));
  const errors=intakeErrors({weight:'',temp:'45.01',reason:' ',notes:'x'.repeat(2001)});
  for(const key of ['weight','temp','reason','notes'])assert.ok(errors[key],key);
  assert.equal(noteChoiceError('Choice\nOther choice'),'');
  assert.ok(noteChoiceError('Choice\n choice '));
  assert.ok(noteChoiceError('x'.repeat(1001)));
  assert.ok(noteChoiceError(Array.from({length:101},(_,i)=>`Choice ${i}`).join('\n')));
});

test('assistant consent and vet observation tasks validate live independently',()=>{
  const context={mode:'create',vet:true,visits:[{id:'visit'}]};
  const errors=admissionErrors({...form,consentConfirmed:false,consentName:' ',consentMethod:'Guessed',emergencyName:'',emergencyPhone:'123',emergencyRelationship:'',nextObservationAt:'2026-02-30T12:00',observationInstructions:''},context);
  for(const key of ['nextObservationAt','observationInstructions'])assert.ok(errors[key],key);
  assert.equal(errors.consentConfirmed,undefined);
  const assistant=admissionErrors({...form,consentConfirmed:false,consentName:' ',consentMethod:'Guessed',emergencyName:'',emergencyPhone:'123',emergencyRelationship:''},{mode:'consent',vet:false});
  for(const key of ['consentConfirmed','consentName','consentMethod','emergencyName','emergencyPhone','emergencyRelationship'])assert.ok(assistant[key],key);
  assert.ok(Object.values(admissionErrors(form,{mode:'consent',vet:false})).every(v=>!v));
  assert.ok(admissionErrors({...form,nextObservationAt:'2000-01-01T12:00'},context).nextObservationAt);
  const kept=admissionErrors({...form,nextObservationAt:'',observationInstructions:'',consentConfirmed:false},{mode:'update',vet:true});
  assert.equal(kept.nextObservationAt,'');assert.equal(kept.consentName,undefined);
});

test('intake reasons reject numbers and punctuation while accepting clinical words and vaccine names',()=>{
 for(const reason of ['455555555555','...','123-456'])assert.match(intakeErrors({weight:'12',temp:'38.5',reason,notes:''}).reason,/words/);
 for(const reason of ['Vomiting for 2 days','5-in-1 vaccine','Pagsusuka'])assert.equal(intakeErrors({weight:'12',temp:'38.5',reason,notes:''}).reason,'');
});
