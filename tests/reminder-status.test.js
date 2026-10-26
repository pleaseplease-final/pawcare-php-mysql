import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readReminderStatus,reminderHealth} from '../src/reminderStatus.js';
const now=Date.parse('2026-10-26T12:00:00Z');
const saved=()=>({summary:{accepted:2},attention:[],health:{emailConfigured:true,smsConfigured:true,overdue:0,lastRun:new Date(now).toISOString()}});
test('empty saved queue is valid while malformed status never becomes a healthy empty queue',()=>{
 const empty=saved();empty.summary={};assert.equal(readReminderStatus(empty),empty);
 for(const data of [null,{}, {...saved(),summary:[]}, {...saved(),summary:{pending:-1}}, {...saved(),summary:{failed:'0'}}, {...saved(),attention:[{}]}, {...saved(),attention:null}, {...saved(),health:{...saved().health,lastRun:'invalid'}}, {...saved(),health:{...saved().health,smsConfigured:undefined}}, {...saved(),health:{...saved().health,overdue:null}}])assert.throws(()=>readReminderStatus(data));
});
test('loading and failed refreshes suppress healthy claims even with a prior good snapshot',()=>{
 for(const [data,options,label] of [[null,{},'Status unavailable'],[saved(),{loading:true},'Checking status…'],[saved(),{error:'offline'},'Status unavailable']]){
  const result=reminderHealth(data,{now,...options});assert.equal(result.healthy,false);assert.equal(result.label,label);
 }
});
test('configuration is distinct from completed reminder processing',()=>{
 const data=saved();data.health.emailConfigured=false;
 assert.equal(reminderHealth(data,{now}).label,'Provider setup needed');
 data.health.emailConfigured=true;data.health.lastRun=null;
 assert.equal(reminderHealth(data,{now}).label,'Worker needs checking');
});
test('daily scheduler is allowed but absent, stale, and implausibly future runs require attention',()=>{
 for(const [hours,healthy] of [[24,true],[25.9,true],[26.1,false],[-1,false]]){
  const data=saved();data.health.lastRun=new Date(now-hours*60*60*1000).toISOString();
  assert.equal(reminderHealth(data,{now}).healthy,healthy,`${hours} hours`);
 }
});
test('backlog and failed or uncertain sends remain visible despite configured providers',()=>{
 const data=saved();data.health.overdue=2;
 assert.equal(reminderHealth(data,{now}).label,'Overdue reminders');
 data.health.overdue=0;data.summary.uncertain=1;
 assert.equal(reminderHealth(data,{now}).label,'Follow-up needed');
 data.summary.uncertain=0;data.summary.failed=1;
 assert.equal(reminderHealth(data,{now}).healthy,false);
 data.summary.failed=0;
 assert.equal(reminderHealth(data,{now}).label,'Providers configured');
});
