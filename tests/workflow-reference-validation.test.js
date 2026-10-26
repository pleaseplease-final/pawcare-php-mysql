import {test} from 'node:test';
import assert from 'node:assert/strict';
import {externalHistoryErrors,addressError} from '../src/externalHistory.js';
import {admissionErrors} from '../src/formValidation.js';
import {admissionChoiceErrors,carePlanTemplates} from '../src/admissionTemplates.js';
import {validateSoapFields} from '../src/soapValidation.js';
import {registrationsWithoutVisit} from '../src/assistantWorkflow.js';
import {validateWalkInRegistration} from '../server/walkInRegistration.js';
test('external references and addresses reject junk while accepting meaningful free text live',()=>{
 for(const value of ['123','@#$','X'.repeat(121)])assert.ok(externalHistoryErrors({priorVaccines:[value]}).priorVaccines);
 assert.ok(externalHistoryErrors({priorVaccines:['Rabies',' rabies ']}).priorVaccines);
 assert.ok(externalHistoryErrors({externalClinicNotes:'666666'}).externalClinicNotes);
 assert.deepEqual(externalHistoryErrors({priorVaccines:['Anti-rabies'],externalClinicNotes:'Previous clinic in Cebu; date unknown.'}),{});
 assert.equal(addressError('66666666666666666666').length>0,true);assert.equal(addressError('12 Mabini Street, Cebu'),'');assert.equal(addressError(''),'');
 const body={ownerName:'Synthetic Owner',phone:'+639170000001',petName:'Luna',species:'Feline',sex:'Female',birth:'2025-01-01',weight:4,neutered:'Not sure',addToQueue:false,address:'666666666'};
 assert.throws(()=>validateWalkInRegistration(body),/street or locality/);assert.equal(validateWalkInRegistration({...body,address:'12 Mabini Street'}).address,'12 Mabini Street');
});
test('booked registrations are reviewed once while a separate second pet without a visit remains visible',()=>{
 const db={petRequests:[{id:'r1',petId:'p1',status:'Pending'},{id:'r2',petId:'p2',status:'Pending'},{id:'old',petId:'old',status:'Approved'}],appts:[{petId:'p1',status:'Pending Approval'}]};
 assert.deepEqual(registrationsWithoutVisit(db).map(r=>r.id),['r2']);
});
test('reason Other and generated plan review errors follow current values',()=>{
 assert.ok(admissionChoiceErrors({reasonChoice:'Other',clinicalNote:'123'},{create:true}).clinicalNote);
 assert.ok(admissionErrors({reasonChoice:'Other',clinicalNote:'123'},{mode:'create',vet:true}).clinicalNote,'specific reason validation must survive the general notes validator');
 assert.equal(admissionErrors({reasonChoice:'Other',clinicalNote:'Requires observation'},{mode:'create',vet:true}).clinicalNote,'');
 assert.deepEqual(admissionChoiceErrors({reasonChoice:'Other',clinicalNote:'Needs specialized monitoring'},{create:true}),{});
 assert.ok(admissionChoiceErrors({reasonChoice:'Guessed'},{create:true}).reasonChoice);
 assert.ok(admissionChoiceErrors({carePlan:carePlanTemplates['General observation'],planConfirmed:false},{vet:true}).planConfirmed);
 assert.deepEqual(admissionChoiceErrors({carePlan:carePlanTemplates['General observation'],planConfirmed:true},{vet:true}),{});
 assert.ok(admissionChoiceErrors({planTemplate:'Guessed'}).planTemplate);
 assert.ok(admissionChoiceErrors({planTemplate:'General observation',carePlan:'Patient-specific plan'},{vet:true}).planConfirmed,'template metadata requires confirmation even if the checkbox field is omitted');
 const consent={consentConfirmed:true,consentName:'Synthetic owner',consentMethod:'Phone',emergencyName:'Synthetic Contact',emergencyPhone:'123',emergencyRelationship:'Owner'};
 assert.ok(admissionErrors(consent,{mode:'consent',vet:false}).emergencyPhone);
 assert.ok(Object.values(admissionErrors({...consent,emergencyPhone:'+639170000001'},{mode:'consent',vet:false})).every(v=>!v));
});
test('historical dates require an explanation and stay inside the actual visit window',()=>{
 const form={date:'2026-10-24',symptoms:'History',objective:'Exam',diagnosis:'Assessment',treatment:'Plan',prescription:'',weight:''};
 assert.ok(validateSoapFields(form,'2026-10-25','2020-01-01','2026-10-24').backdateReason);
 assert.ok(validateSoapFields({...form,backdateReason:'12345'},'2026-10-25','2020-01-01','2026-10-24').backdateReason);
 assert.deepEqual(validateSoapFields({...form,backdateReason:'Care provided during overnight observation.'},'2026-10-25','2020-01-01','2026-10-24'),{});
 assert.ok(validateSoapFields({...form,backdateReason:'Historical care'},'2026-10-25','2020-01-01','2026-10-25').date);
 assert.deepEqual(validateSoapFields({...form,date:'2026-10-25'},'2026-10-25','2020-01-01','2026-10-25'),{});
});
