import {test} from 'node:test';
import assert from 'node:assert/strict';
import {needsFirstPetSetup,registrationPatient} from '../src/ownerOnboarding.js';
const me={id:'user',role:'owner',ownerId:'owner'};
const db={owners:[{id:'owner'}],pets:[],petRequests:[]};
test('first-pet setup requires loaded owner records, excludes other accounts and stops after saved registration',()=>{
 assert.equal(needsFirstPetSetup(db,me),true);
 assert.equal(needsFirstPetSetup({...db,owners:[]},me),false);
 assert.equal(needsFirstPetSetup(db,{...me,role:'assistant'}),false);
 assert.equal(needsFirstPetSetup({...db,petRequests:[{ownerId:'other',status:'Pending'}]},me),true);
 for(const status of ['Pending','Declined','Approved'])assert.equal(needsFirstPetSetup({...db,petRequests:[{ownerId:'owner',status}]},me),false);
 assert.equal(needsFirstPetSetup({...db,pets:[{ownerId:'owner',registrationStatus:'Pending'}]},me),false);
 assert.equal(needsFirstPetSetup({...db,owners:[{id:'owner',firstPetRegisteredAt:'2026-10-25T00:00:00Z'}]},me),false,'withdrawal does not restart first-time setup');
});
test('saved provisional patient carries pending status without invented clinical measurements or a card',()=>{
 const pet=registrationPatient({id:'p',owner_id:'owner',name:'Pet',birth:'2025-01-01T00:00:00Z',weight:'4.25',registration_status:'Pending'});
 assert.equal(pet.registrationStatus,'Pending');assert.equal(pet.birth,'2025-01-01');assert.equal(pet.weight,4.25);assert.equal(pet.vaccinationCardId,'');assert.deepEqual(pet.weights,[]);
});
