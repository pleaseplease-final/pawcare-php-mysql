import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateWalkInRegistration} from '../walkInRegistration.js';
const base={ownerName:'Synthetic Owner',phone:'09171112233',email:'',address:'',petName:'Milo',species:'Canine',sex:'Male',birth:'2023-01-01',weight:5.25,neutered:'Not sure',addToQueue:false};
test('walk-in validation preserves missing optional contacts and actual patient facts',()=>{
 const data=validateWalkInRegistration(base);assert.equal(data.email,'');assert.equal(data.address,'');assert.equal(data.patient.weight,5.25);assert.equal(data.patient.birth,base.birth);assert.equal(data.patient.breed,'');
});
test('walk-in validation rejects absent measurements/identity and malformed contacts',()=>{
 for(const change of [{weight:undefined},{weight:'5'},{weight:0},{birth:'2025-02-30'},{sex:''},{species:''},{phone:''},{phone:'123'},{email:'invalid'},{ownerName:''},{addToQueue:'yes'}]) assert.throws(()=>validateWalkInRegistration({...base,...change}));
});

test('queued registrations validate their visit before writing any patient records',()=>{
 const queued={...base,addToQueue:true,vetId:'vet',serviceCategory:'consultation',reason:'Walk-in consultation'};
 assert.equal(validateWalkInRegistration(queued).patient.name,'Milo');
 for(const change of [{reason:'12345'},{reason:''},{reason:'x'.repeat(301)},{serviceCategory:'unknown'},{vetId:''},{serviceCategory:'vaccination',vaccineId:'feline-core'},{serviceCategory:'vaccination',vaccineId:''}]) assert.throws(()=>validateWalkInRegistration({...queued,...change}));
 assert.equal(validateWalkInRegistration({...queued,serviceCategory:'vaccination',vaccineId:'canine-core',reason:''}).patient.name,'Milo');
});
