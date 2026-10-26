import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateSoapFields} from '../src/soapValidation.js';
const today='2026-10-25';
const form={symptoms:'Saved history',objective:'Recorded examination',diagnosis:'Veterinarian assessment',treatment:'Recorded care',date:today,weight:'5.2',prescription:'',scheduleFollowUp:false};

test('all four SOAP sections reject blank and excessive notes before a request',()=>{
  assert.deepEqual(validateSoapFields(form,today),{});
  for(const field of ['symptoms','objective','diagnosis','treatment']) {
    for(const value of ['', '   ', 'x'.repeat(10001)]) assert.ok(validateSoapFields({...form,[field]:value},today)[field]);
    assert.equal(validateSoapFields({...form,[field]:'x'.repeat(10000)},today)[field],undefined);
  }
});
test('consultation dates reject missing, impossible and future dates, while accepting past and leap dates',()=>{
  for(const date of ['', 'invalid', '2026-02-30','2026-10-26']) assert.ok(validateSoapFields({...form,date},today).date);
  for(const date of [today,'2024-02-29']) assert.equal(validateSoapFields({...form,date},today).date,undefined);
});
test('optional weights respect the server finite positive maximum without inventing measurements',()=>{
  for(const weight of ['',null,'0.01','120']) assert.equal(validateSoapFields({...form,weight},today).weight,undefined);
  for(const weight of ['   ','0','-1','120.01','NaN','Infinity']) assert.ok(validateSoapFields({...form,weight},today).weight);
});
test('prescription notes retain the server 3000 character limit',()=>{
  assert.equal(validateSoapFields({...form,prescription:'x'.repeat(3000)},today).prescription,undefined);
  assert.ok(validateSoapFields({...form,prescription:'x'.repeat(3001)},today).prescription);
});
test('follow-up requires supported status, real current/future target and bounded instructions',()=>{
  const follow={...form,scheduleFollowUp:true,careStatus:'Recheck required',followUpDate:today,followUpReason:'Review healing'};
  assert.deepEqual(validateSoapFields(follow,today),{});
  for(const patch of [{careStatus:'Other'},{followUpDate:'2026-02-30'},{followUpDate:'2026-10-24'},{followUpReason:'   '},{followUpReason:'x'.repeat(2001)}]) assert.ok(Object.keys(validateSoapFields({...follow,...patch},today)).length);
  assert.ok(validateSoapFields({...follow,treatment:'x'.repeat(10000)},today).treatment,'appended instructions must fit the persisted plan limit');
  assert.deepEqual(validateSoapFields({...form,followUpDate:'bad',followUpReason:''},today),{},'disabled follow-up does not block routine care');
});
test('patient birth bounds consultation dates while allowing valid historical care',()=>{
 assert.ok(validateSoapFields({...form,date:'2010-01-01'},today,'2020-01-01').date);
 assert.equal(validateSoapFields({...form,date:'2024-02-29'},today,'2020-01-01').date,undefined);
});

test('vaccine requirements use field errors that recompute as staff correct the entries',()=>{
 const vaccine={...form,giveVaccine:true,vaccine:'Anti-rabies',doseNo:'',doseOf:'',intervalDays:'',scheduleApproved:false,brand:' ',batch:''};
 const errors=validateSoapFields(vaccine,today);
 for(const field of ['doseNo','doseOf','intervalDays','scheduleApproved','brand','batch'])assert.ok(errors[field],field);
 const valid={...vaccine,doseNo:'1',doseOf:'3',intervalDays:'21',scheduleApproved:true,brand:'Synthetic brand',batch:'Synthetic batch'};
 assert.deepEqual(validateSoapFields(valid,today),{});
 for(const [field,values] of [['doseNo',['0','21','1.5']],['doseOf',['0','21','1.5']],['intervalDays',['0','3651','1.5']]])for(const value of values)assert.ok(validateSoapFields({...valid,[field]:value},today)[field],`${field}:${value}`);
 assert.ok(validateSoapFields({...valid,doseNo:'4'},today).doseOf,'series total responds to a changed administered dose');
 assert.equal(validateSoapFields({...valid,doseNo:'2'},today).doseOf,undefined);
 assert.ok(validateSoapFields({...valid,date:'2026-02-30'},today).intervalDays,'interval responds to an invalid administration date');
 assert.equal(validateSoapFields({...valid,date:today},today).intervalDays,undefined);
 assert.deepEqual(validateSoapFields({...vaccine,giveVaccine:false},today),{},'hidden administration fields do not block routine care');
});
