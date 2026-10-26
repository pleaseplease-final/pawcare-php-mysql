import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateReminderCall,savedReminderCall} from '../src/reminderCall.js';
const body={requestId:'11111111-2222-4333-8444-555555555555',vaccinationId:'dose',petId:'pet',ownerId:'owner',dueDate:'2026-10-25',expectedPhone:'09171112233',outcome:'No answer',notes:'  Call again tomorrow.\nOwner requested morning calls.  '};
test('call records require a real outcome, matching saved references and bounded notes',()=>{
 const valid=validateReminderCall(body);assert.equal(valid.notes,'Call again tomorrow.\nOwner requested morning calls.');
 for(const change of [{outcome:''},{outcome:'Message sent'},{notes:'x'.repeat(2001)},{notes:null},{notes:'bad\u0000text'},{requestId:'invented'},{vaccinationId:''},{petId:''},{ownerId:''},{dueDate:'2025-02-30'},{dueDate:['2026-10-25']},{expectedPhone:12}]) assert.throws(()=>validateReminderCall({...body,...change}));
});
test('missing contact can be recorded without inventing a phone call or a contact number',()=>{
 const unavailable=validateReminderCall({...body,expectedPhone:'',outcome:'Contact unavailable'});assert.equal(unavailable.expectedPhone,'');
 assert.throws(()=>validateReminderCall({...body,expectedPhone:''}),/No phone/);
});
test('only the exact acknowledged call can be shown as saved',()=>{
 const request=validateReminderCall(body),call={id:body.requestId,petId:'pet',ownerId:'owner',vaccinationId:'dose',outcome:'No answer',createdAt:'2026-10-24T18:00:00Z',staffName:'Saved Receptionist'};
 assert.equal(savedReminderCall({success:true,call},request),call);
 for(const response of [{success:true},{success:false,call},{success:true,call:{...call,id:'other'}},{success:true,call:{...call,petId:'other'}},{success:true,call:{...call,outcome:'Reached owner'}}]) assert.throws(()=>savedReminderCall(response,request),/did not confirm/);
});
