import {test} from 'node:test';
import assert from 'node:assert/strict';
import {vitalValueError,correctionErrors} from '../src/vitalValidation.js';
import {weightSourceLabel} from '../src/vitalLabels.js';
import {intakeErrors,admissionErrors} from '../src/formValidation.js';
test('vital fields reject malformed and unsafe values, update immediately and preserve the typed value',()=>{
 for(const [kind,values] of [['weight',['',0,-1,' ','.','Infinity','NaN','1e2',120.01,0.049,2.123]],['temp',['',0,' ','.','Infinity',32.99,45.01,38.123]]])for(const value of values)assert.ok(vitalValueError(value,kind),`${kind}:${value}`);
 for(const value of [0.05,'0.05',10.25,120,'120'])assert.equal(vitalValueError(value,'weight'),'');
 for(const value of [33,38.55,'38.55',45])assert.equal(vitalValueError(value,'temp'),'');
 const typed={weight:'10.123',temp:'38.5',reason:'Exam',notes:''};assert.ok(intakeErrors(typed).weight);typed.weight='10.12';assert.equal(intakeErrors(typed).weight,'');assert.equal(typed.weight,'10.12');
 assert.equal(vitalValueError('','temp',false),'');
 assert.ok(admissionErrors({weight:'10.123',temp:'38.123'},{mode:'update',vet:false}).temp);
});
test('correction reason and numeric value validate on each change, including corrected valid input',()=>{
 let fields={value:'200',reason:'  '};assert.ok(Object.values(correctionErrors(fields.value,fields.reason,'weight')).every(Boolean));
 fields={value:'10.25',reason:'Entered wrong scale reading'};assert.ok(Object.values(correctionErrors(fields.value,fields.reason,'weight')).every(e=>!e));
 assert.ok(correctionErrors('10.25','x'.repeat(501),'weight').reason);
 assert.ok(correctionErrors('10.25',null,'weight').reason);
 assert.equal(correctionErrors('0.01','Correct tiny patient weight','weight').value,'');
});
test('weight labels do not present owner reports or unknown sources as clinic measurements',()=>{
 assert.equal(weightSourceLabel({weightOrigin:'registration'}),'Registration weight (reported)');
 assert.equal(weightSourceLabel({registrationStatus:'Pending'}),'Registration weight (reported)');
 assert.equal(weightSourceLabel({weightOrigin:'clinic'}),'Latest clinic weight');
 assert.equal(weightSourceLabel({}),'Weight (source unrecorded)');
});
