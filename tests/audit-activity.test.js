import {test} from 'node:test';
import assert from 'node:assert/strict';
import {auditActivity} from '../src/auditActivity.js';

test('audit activity preserves saved actions and supports API and state actor formats',()=>{
 const action='Booked appointment a_123 on 2026-10-26 10:00: Vaccination: Anti-rabies';
 for(const entry of [{actor:'Maria',role:'assistant',action},{by:'Maria',role:'assistant',msg:action},{user_name:'Maria',user_role:'assistant',action}]){
  const result=auditActivity(entry);assert.equal(result.action,action);assert.equal(result.actor,'Maria');assert.equal(result.role,'assistant');assert.equal(result.type,'Appointments');
 }
});
test('audit categories distinguish care, payments, accounts, staff and unknown activity',()=>{
 for(const [action,type] of [['Signed in (u_123).','Account & sign-in'],['Logged in','Account & sign-in'],['Booked appointment a_1: General consultation','Appointments'],['Registered walk-in owner Jane & pet Max; arrival requested: Vaccination','Patients & owners'],['Finalized consultation note','Clinical care'],['Recorded payment for visit','Payments'],['Changed own password','Account & sign-in'],['Revoked staff access','Staff access'],['Registered walk-in owner Jane & pet Max','Patients & owners'],['Queued reminder for pet','Reminders'],['An unfamiliar saved event','Other activity']])assert.equal(auditActivity({action}).type,type);
});
test('audit timestamps use Manila and tolerate missing or malformed dates',()=>{
 const result=auditActivity({at:'2026-10-25T00:15:00Z'});assert.match(result.timestamp,/8:15/);assert.equal(result.dateTime,'2026-10-25T00:15:00.000Z');
 for(const at of [undefined,'invalid'])assert.equal(auditActivity({at}).timestamp,'Time not recorded');
});
