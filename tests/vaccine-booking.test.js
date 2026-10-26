import {savedWalkInRegistration} from '../src/walkInRegistration.js';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {vaccineChoiceError,vaccineIdFromReason,vaccinePrice,vaccineReason} from '../src/vaccineBooking.js';
import {requestedVaccineReason} from '../server/vaccineBooking.js';
import {priceCatalog} from '../server/priceCatalog.js';
import {confirmedBooking} from '../src/receptionSaves.js';

test('known vaccine estimates come only from the current official catalog',()=>{
 const catalog=priceCatalog();
 assert.equal(vaccinePrice('rabies',catalog),350);
 assert.equal(vaccinePrice('canine-core',catalog),650);
 assert.equal(vaccinePrice('feline-core',catalog),700);
 for(const id of ['canine-six','canine-eight','felv','bordetella','vet-review','unknown'])assert.equal(vaccinePrice(id,catalog),null);
 assert.equal(vaccinePrice('rabies',[]),null);
});
test('saved purposes identify the request without conflating different vaccine products',()=>{
 for(const [reason,id] of [['Vaccination: Anti-rabies','rabies'],['Vaccination: Vaccination: DHPP (5-in-1 Core Vaccine)','canine-core'],['FVRCP Annual Booster','feline-core'],['6-in-1 DHPP combination','canine-six'],['8-in-1 DHPP combination','canine-eight'],['Vaccination consultation',''],['Examination for rabies exposure','']])assert.equal(vaccineIdFromReason(reason),id,reason);
 assert.equal(vaccineReason('feline-core'),'Vaccination: Feline 4-in-1');
});
test('server rejects unknown, missing and incompatible explicit requests and mismatched services',()=>{
 const base={service:'vaccination',reason:'Vaccination',species:'Canine'};
 for(const vaccineId of ['',null,{},'made-up','feline-core','felv'])assert.throws(()=>requestedVaccineReason({...base,vaccineId}),e=>e.status===400);
 assert.throws(()=>requestedVaccineReason({...base,service:'checkup',vaccineId:'rabies'}),e=>e.status===400);
 assert.equal(vaccineChoiceError('canine-core','Cat').length>0,true);
 assert.equal(vaccineChoiceError('vet-review','Rodent'),'');
});
test('server canonicalizes explicit vaccine requests and preserves legacy generic purposes',()=>{
 assert.equal(requestedVaccineReason({service:'vaccination',vaccineId:'rabies',species:'Canine',reason:'Free vaccine',price:0}),'Vaccination: Anti-rabies');
 assert.equal(requestedVaccineReason({service:'vaccination',species:'Canine',reason:'Routine vaccine consultation'}),'Routine vaccine consultation');
 assert.equal(requestedVaccineReason({service:'vaccination',vaccineId:'canine-eight',species:'Canine',reason:'8-in-1'}),'Vaccination: 8-in-1');
 assert.throws(()=>requestedVaccineReason({service:'vaccination',species:'Feline',reason:'Vaccination: DHPP'}));
});
test('a booking acknowledgment must confirm the selected vaccine purpose',()=>{
 const expected={id:'a',petId:'p',vetId:'v',date:'2026-10-26',time:'10:00',service:'vaccination',status:'Pending Approval',vaccineId:'rabies',reason:'Vaccination: Anti-rabies'};
 assert.equal(confirmedBooking({success:true,appointment:{...expected}},expected).reason,expected.reason);
 assert.throws(()=>confirmedBooking({success:true,appointment:{...expected,reason:'Generic vaccine'}},expected));
});

test('walk-in acknowledgment confirms the vaccine arrival before proceeding to intake',()=>{
 const expected={vaccineId:'rabies',vetId:'v',reason:'Vaccination: Anti-rabies'};
 const response={success:true,owner:{id:'o'},pet:{id:'p',vaccinationCardId:'card'},appointment:{id:'a',petId:'p',vetId:'v',reason:expected.reason,service:'vaccination',status:'Scheduled'}};
 assert.equal(savedWalkInRegistration(response,expected).appointment.reason,expected.reason);
 for(const appointment of [null,{...response.appointment,reason:'Generic vaccine'},{...response.appointment,service:'checkup'}])assert.throws(()=>savedWalkInRegistration({...response,appointment},expected));
});
