import {test} from 'node:test';
import assert from 'node:assert/strict';
import {registrationReviewChanged, reviewedRequest, approvedRegistration} from '../src/registrationReview.js';
const request={id:'request',status:'Pending',revision:3};
const raw={id:'request',owner_id:'owner',name:'Milo',species:'Canine',breed:'Mixed',sex:'Male',birth:'2023-01-01',weight:'5.25',revision:4,status:'Approved',pet_id:'pet',card_id:'SAVED-CARD',requested_at:'2026-10-20T00:00:00Z',approved_at:'2026-10-24',approved_by:'Saved Reviewer',photo:'saved-photo',dental_occlusion:'Not Evaluated Yet'};
const data={success:true,request:raw,pet:{id:'pet',owner_id:'owner',name:'Milo',species:'Canine',weight:'5.25',birth:'2023-01-01',vaccination_card_id:'SAVED-CARD'},vaccs:[{id:'suggestion',pet_id:'pet',vaccine:'Anti-rabies',done:false,automated:true,next_due:'2026-11-01'}],appointment:null};
test('review invalidates when the latest revision, status or existence changes',()=>{
 assert.equal(registrationReviewChanged(request,[request]),false);
 for(const current of [{...request,revision:4},{...request,status:'Approved'},{...request,status:'Declined'}]) assert.equal(registrationReviewChanged(request,[current]),true);
 assert.equal(registrationReviewChanged(request,[]),true);
 assert.equal(registrationReviewChanged({...request,revision:undefined},[{...request,revision:0}]),false);
});
test('server request snapshot preserves revision and recorded approval metadata',()=>{
 const result=reviewedRequest(raw);
 assert.equal(result.revision,4);assert.equal(result.approvedAt,'2026-10-24');assert.equal(result.approvedBy,'Saved Reviewer');
 assert.equal(result.petId,'pet');assert.equal(result.cardId,'SAVED-CARD');assert.equal(result.ownerId,'owner');assert.equal(result.weight,5.25);
 assert.equal(result.photo,'saved-photo');assert.equal(result.dentalOcclusion,'Not Evaluated Yet');
});
test('approval uses persisted card/pet identity and leaves unrecorded clinical history empty',()=>{
 const result=approvedRegistration(data);
 assert.equal(result.pet.id,'pet');assert.equal(result.pet.ownerId,'owner');assert.equal(result.cardId,'SAVED-CARD');
 assert.equal(result.pet.vaccinationCardId,'SAVED-CARD');assert.deepEqual(result.pet.weights,[]);
 assert.equal(result.request.revision,4);assert.equal(result.appointment,null);
 assert.equal(result.vacc[0].date,'');assert.equal(result.vacc[0].vetId,'');assert.equal(result.vacc[0].done,false);
 assert.equal(result.vacc[0].nextDue,'2026-11-01');assert.equal(result.vacc[0].brand,'');
});
test('incomplete approval acknowledgments cannot create local patients or substitute IDs',()=>{
 for(const invalid of [null,{}, {...data,success:false},{...data,request:null},{...data,request:{...raw,status:'Pending'}},{...data,pet:{...data.pet,vaccination_card_id:''}}]) assert.throws(()=>approvedRegistration(invalid),/did not confirm/);
});
test('declined snapshot preserves saved correction reason and does not invent review dates',()=>{
 const result=reviewedRequest({...raw,status:'Declined',revision:5,decline_reason:'Please verify birth date.',approved_at:null,approved_by:null,pet_id:null,card_id:null});
 assert.equal(result.status,'Declined');assert.equal(result.revision,5);assert.equal(result.declineReason,'Please verify birth date.');assert.equal(result.approvedAt,null);assert.equal(result.approvedBy,'');assert.equal(result.cardId,'');
});
