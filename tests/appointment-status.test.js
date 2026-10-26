import {test} from 'node:test';
import assert from 'node:assert/strict';
import {changeAppointmentStatus,approvalVisit} from '../src/appointmentStatus.js';
const visit={id:'visit',petId:'pet',vetId:'vet',date:'2026-10-25',time:'10:00',reason:'Examination',status:'Pending Approval',notes:'Keep these notes'};
const store=()=>{let state={appts:[{...visit},{...visit,id:'other'}]};return {get:()=>state,set:up=>state=up(state)};};
const response=(status='Scheduled',extra={})=>({success:true,appointment:{id:'visit',pet_id:'pet',vet_id:'vet',date:'2026-10-25',time:'10:00',reason:'Saved examination',status,intake_vitals:null,...extra}});
test('duplicate cross-view status actions share one request and lock by appointment',async()=>{
 const s=store();let release,calls=0;
 const request=async()=>{calls++;return new Promise(r=>release=r)};
 const pending=changeAppointmentStatus(s.set,'visit','Scheduled',()=>{},visit,request);
 assert.equal(await changeAppointmentStatus(s.set,'visit','Scheduled',()=>{},visit,request),false);assert.equal(calls,1);
 release(response());assert.equal(await pending,true);assert.equal(s.get().appts[0].status,'Scheduled');
});
test('requests carry their baseline and apply saved values without losing unrelated records',async()=>{
 const s=store();let sent;
 const request=async(...args)=>{sent=args;return response()};
 assert.equal(await changeAppointmentStatus(s.set,'visit','Scheduled',()=>{},visit,request),true);
 assert.equal(sent[0],'PATCH');assert.equal(sent[2].expectedVisit.status,'Pending Approval');assert.equal(sent[2].expectedVisit.petId,'pet');
 assert.equal(s.get().appts[0].reason,'Saved examination');assert.equal(s.get().appts[0].notes,'Keep these notes');assert.equal(s.get().appts[1].status,'Pending Approval');
});
test('failures release the lock and unconfirmed responses cannot change local state',async()=>{
 const s=store();let error;
 for(const result of [{success:true},response('Pending Approval'),response('Scheduled',{id:'wrong'}),response('Scheduled',{pet_id:'wrong'}),{...response(),success:false}]) {
  assert.equal(await changeAppointmentStatus(s.set,'visit','Scheduled',e=>error=e,visit,async()=>result),false);assert.equal(s.get().appts[0].status,'Pending Approval');
 }
 assert.match(error,/did not confirm/);
 assert.equal(await changeAppointmentStatus(s.set,'visit','Scheduled',e=>error=e,visit,async()=>{throw Error('Offline')}),false);assert.equal(error,'Offline');
 assert.equal(await changeAppointmentStatus(s.set,'visit','Scheduled',()=>{},visit,async()=>response()),true);
});
test('an older acknowledgment cannot replace a newer local visit or resurrect a removed visit',async()=>{
 const s=store();let release;
 const pending=changeAppointmentStatus(s.set,'visit','Scheduled',()=>{},visit,async()=>new Promise(r=>release=r));
 s.set(p=>({...p,appts:p.appts.map(a=>a.id==='visit'?{...a,status:'In consultation'}:a)}));release(response());assert.equal(await pending,true);assert.equal(s.get().appts[0].status,'In consultation');
 s.set(p=>({...p,appts:p.appts.filter(a=>a.id!=='visit')}));
 assert.equal(await changeAppointmentStatus(s.set,'visit','Scheduled',()=>{},visit,async()=>response()),true);assert.equal(s.get().appts.length,1);
});
test('legacy helper calls without a snapshot still require an acknowledged status change',async()=>{
 const s=store();let body;
 assert.equal(await changeAppointmentStatus(s.set,'visit','In consultation',()=>{},undefined,async(m,p,b)=>{body=b;return response('In consultation')}),true);
 assert.deepEqual(body,{status:'In consultation'});assert.equal(s.get().appts[0].status,'In consultation');
});
test('cancellation forwards the reviewed reason and retains the server reason',async()=>{
 const s=store();let sent;
 const request=async(m,p,b)=>{sent=b;return response('Cancelled',{cancel_reason:'Schedule conflict'})};
 assert.equal(await changeAppointmentStatus(s.set,'visit','Cancelled',()=>{},visit,request,{cancelReason:'Schedule conflict'}),true);
 assert.equal(sent.cancelReason,'Schedule conflict');assert.equal(sent.expectedVisit.status,'Pending Approval');
 assert.equal(s.get().appts[0].cancelReason,'Schedule conflict');
});

test('combined approval sends the reviewed revision and reconciles stable patient, request, protocols and audit fields',async()=>{
 let state={appts:[visit],pets:[{id:'pet',registrationStatus:'Pending',weights:[{kg:4,by:'Earlier measurement'}]}],petRequests:[{id:'registration',petId:'pet',status:'Pending',revision:2}],vacc:[{id:'existing',petId:'other'}],vaccs:[]};
 const set=up=>state=up(state);const expected=approvalVisit(state,visit);let sent;
 const registration={request:{id:'registration',pet_id:'pet',status:'Approved',revision:3},pet:{id:'pet',registration_status:'Verified',vaccination_card_id:'CARD',weight:'5'},vaccs:[{id:'protocol',pet_id:'pet',done:false}]};
 const request=async(m,p,b)=>{sent=b;return {...response('Scheduled',{approved_at:'2026-10-25T08:00:00Z',approved_by:'Saved assistant',approved_by_user_id:'staff'}),registration}};
 assert.equal(await changeAppointmentStatus(set,'visit','Scheduled',()=>{},expected,request),true);
 assert.deepEqual(sent.expectedRegistration,{id:'registration',revision:2});assert.equal(state.pets.length,1);assert.equal(state.pets[0].registrationStatus,'Verified');
 assert.equal(state.petRequests[0].revision,3);assert.equal(state.pets[0].weights[0].kg,4);assert.equal(state.vacc.length,2);assert.equal(state.vaccs,state.vacc);
 assert.equal(state.appts[0].approvedByUserId,'staff');assert.equal(state.appts[0].approvedAt,'2026-10-25T08:00:00Z');
 assert.equal(await changeAppointmentStatus(set,'visit','Scheduled',()=>{},expected,request),true);assert.equal(state.vacc.length,2);assert.equal(state.pets.length,1);
});
test('unconfirmed linked registration does not apply a partial local approval',async()=>{
 const s=store();const expected={...visit,expectedRegistration:{id:'registration',revision:0}};let error;
 assert.equal(await changeAppointmentStatus(s.set,'visit','Scheduled',e=>error=e,expected,async()=>response()),false);
 assert.match(error,/linked registration/);assert.equal(s.get().appts[0].status,'Pending Approval');
});
