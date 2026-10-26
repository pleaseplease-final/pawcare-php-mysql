import {test} from 'node:test';
import assert from 'node:assert/strict';
import {savedHandoff,removeHandedOffVisit} from '../src/vetHandoff.js';
const me={id:'account',vetId:'v1'},visit={id:'visit',petId:'patient',vetId:'v1'};
const result={success:true,appointment:{id:'visit',petId:'patient',vetId:'v2',status:'Checked-in'},handoff:{fromId:'v1',toId:'v2',to:'Receiving Vet',note:'Monitor hydration',at:'2026-10-24T10:00:00Z'}};
test('handoff acknowledges the exact patient, recipient, sender and saved instructions',()=>{
 assert.deepEqual(savedHandoff(result,visit,'v2','  Monitor hydration  ',me),result.handoff);
 for(const patch of [{success:false},{appointment:{...result.appointment,id:'other'}},{appointment:{...result.appointment,petId:'other'}},{appointment:{...result.appointment,vetId:'other'}},{appointment:{...result.appointment,status:'Completed'}},{handoff:{...result.handoff,fromId:'other'}},{handoff:{...result.handoff,toId:'other'}},{handoff:{...result.handoff,note:'Unrelated instructions'}},{handoff:{...result.handoff,at:'invalid'}},{handoff:{...result.handoff,to:''}}]) assert.throws(()=>savedHandoff({...result,...patch},visit,'v2','Monitor hydration',me),/did not confirm/);
});
test('a confirmed transfer removes unassigned patient data but preserves other assignments and their history',()=>{
 const state={appts:[visit,{id:'other-visit',petId:'retained',vetId:'account'},{id:'unrelated',petId:'other-vet',vetId:'v3'}],pets:[{id:'patient',ownerId:'o1'},{id:'retained',ownerId:'o2'},{id:'other-vet',ownerId:'o3'}],owners:[{id:'o1'},{id:'o2'},{id:'o3'}]};
 for(const key of ['vacc','vaccs','records','consults'])state[key]=[{petId:'patient'},{petId:'retained'},{petId:'other-vet'}];
 const scoped=removeHandedOffVisit(state,'visit',me);
 assert.deepEqual(scoped.pets,[state.pets[1]]);assert.deepEqual(scoped.owners,[{id:'o2'}]);
 for(const key of ['vacc','vaccs','records','consults'])assert.deepEqual(scoped[key],[{petId:'retained'}]);
 assert.equal(state.appts.length,3,'does not mutate original store');
 const retained=removeHandedOffVisit({...state,appts:[...state.appts,{id:'prior-completed',petId:'patient',vetId:'v1',status:'Completed'}]},'visit',me);
 assert.ok(retained.pets.some(p=>p.id==='patient'),'another historic assignment still grants patient history');
 assert.ok(retained.records.some(r=>r.petId==='patient'));
});
