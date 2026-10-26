import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validWalkInBirth,walkInBirthWindow,savedWalkInRegistration} from '../src/walkInRegistration.js';
test('birth dates use the clinic window and reject normalized impossible dates',()=>{
 const window=walkInBirthWindow();
 assert.equal(validWalkInBirth(window.yesterday),true);assert.equal(validWalkInBirth(window.today),false);
 assert.equal(validWalkInBirth('2025-02-30'),false);assert.equal(validWalkInBirth(''),false);
 assert.equal(validWalkInBirth('1900-01-01'),false);
});
test('saved walk-in vaccine rows use application field names without certifying imported history',()=>{
 const result=savedWalkInRegistration({success:true,owner:{id:'owner'},pet:{id:'pet',vaccinationCardId:'SERVER-CARD'},appointment:{id:'visit',status:'Scheduled'},vaccs:[{id:'dose',pet_id:'pet',card_id:'SERVER-CARD',vaccine:'External rabies history',done:true,date:'2026-10-20',next_due:null}]});
 assert.equal(result.vacc[0].petId,'pet');assert.equal(result.vacc[0].cardId,'SERVER-CARD');assert.equal(result.vacc[0].vetId,'');assert.equal(result.vacc[0].nextDue,null);
 assert.equal(result.pet.vaccinationCardId,'SERVER-CARD');assert.equal(result.appointment.status,'Scheduled');
});
test('incomplete server response cannot produce fallback people, patients or cards',()=>{
 for(const data of [null,{}, {success:true,owner:{id:'owner'},pet:{id:'pet'}}]) assert.throws(()=>savedWalkInRegistration(data),/did not confirm/);
});

import {validateWalkInFields,walkInVisitErrors,walkInReasonError,savedWalkInArrival} from '../src/walkInRegistration.js';
const registration={ownerName:'Synthetic Owner',phone:'09171112233',email:'',address:'',petName:'Milo',species:'Canine (Dog)',breed:'',sex:'Male',birth:'2023-01-01',weight:'5.25',neutered:'Not sure',addToQueue:true,vetId:'vet',serviceCategory:'consultation',reason:'Routine checkup'};
test('walk-in inline feedback covers patient facts, visit purpose, vet, reasons and external notes',()=>{
 assert.deepEqual(validateWalkInFields(registration,{vets:[{id:'vet'}]}),{});
 for(const [key,value] of [['species',''],['vetId','missing'],['serviceCategory','invented'],['reason','12345'],['reason','x'.repeat(301)],['otherSpecies','12'],['customBreed','123'],['customColor','123'],['externalClinicNotes','123']]) {
  const v={...registration,[key]:value,...(key==='otherSpecies'?{species:'Other / Exotic'}:key==='customBreed'?{breed:'Other / Mixed'}:key==='customColor'?{color:'Other'}:key==='externalClinicNotes'?{hasExternalHistory:true}: {})};
  assert.ok(validateWalkInFields(v,{vets:[{id:'vet'}]})[key],key);
 }
 for(const reason of ['Vomiting for 2 days','5-in-1 vaccine','Pagsusuka']) assert.equal(walkInReasonError(reason),'');
 assert.deepEqual(walkInVisitErrors({...registration,addToQueue:false,reason:'',vetId:'',serviceCategory:'invalid'}),{});
 const vaccine=validateWalkInFields({...registration,serviceCategory:'vaccination',vaccineId:'feline-core'});
 assert.ok(vaccine.vaccineId);assert.equal(vaccine.reason,undefined);
});
test('every walk-in purpose requires a matching durable arrival before intake opens',()=>{
 for(const [serviceCategory,service] of [['consultation','checkup'],['vaccination','vaccination'],['deworming','deworming'],['grooming','grooming'],['emergency','checkup']]) {
  const expected={addToQueue:true,vetId:'vet',serviceCategory,reason:'Requested care'};
  const data={success:true,owner:{id:'owner'},pet:{id:'pet',vaccinationCardId:'card'},appointment:{id:'arrival',petId:'pet',vetId:'vet',service,reason:expected.reason,status:'Scheduled',bookingKind:'walk-in',date:'2026-10-26'}};
  assert.equal(savedWalkInRegistration(data,expected).appointment.id,'arrival');
  for(const change of [{appointment:null},{appointment:{...data.appointment,service:'wrong'}},{appointment:{...data.appointment,reason:'Different reason'}},{appointment:{...data.appointment,status:'Checked-in'}}]) assert.throws(()=>savedWalkInRegistration({...data,...change},expected),/did not confirm/);
  assert.equal(savedWalkInArrival(data,{...data.appointment}).id,'arrival');
 }
});


test('arrival review survives unrelated measurement refresh but detects changed identity, purpose or availability',async()=>{
 const {walkInReviewContext}=await import('../src/walkInRegistration.js');
 const input={pet:{id:'pet',ownerId:'owner',name:'Milo',species:'Feline',registrationStatus:'Verified',weights:[]},owner:{id:'owner',name:'Owner'},vetId:'vet',reason:'Routine examination',service:'checkup',vaccineId:'',date:'2026-10-26',estimate:'',activeVisits:[],doctors:[['vet','Doctor']]};
 const original=walkInReviewContext(input);
 assert.deepEqual(walkInReviewContext({...input,pet:{...input.pet,weights:[{kg:4}],weightOrigin:'registration'}}),original);
 for(const change of [{pet:{...input.pet,registrationStatus:'Pending'}},{pet:{...input.pet,ownerId:'another-owner'}},{reason:'Vomiting'},{activeVisits:[{id:'new-arrival',status:'Scheduled'}]},{doctors:[]},{date:'2026-10-27'},{estimate:'New price'}])assert.notDeepEqual(walkInReviewContext({...input,...change}),original);
});
