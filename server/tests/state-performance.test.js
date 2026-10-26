import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {visibleStateVaccinations} from '../stateVaccinations.js';
import {sendClinicState} from '../stateResponse.js';

test('indexed vaccine suggestions retain the existing exact-name/group and per-pet contract',()=>{
  const rows=[
    {id:'old',petId:'p',vaccine:'Anti-Rabies',done:true},
    {id:'suppress',petId:'p',vaccine:'Rabies booster',done:false},
    {id:'other-pet',petId:'other',vaccine:'Rabies booster',done:false},
    {id:'core',petId:'p',vaccine:'DHPP',done:true},
    {id:'legacy-core',petId:'p',vaccine:'5-in-1',done:false},
    {id:'worm',petId:'p',vaccine:'Deworming',done:true},
    {id:'worm-plan',petId:'p',vaccine:'Deworm next',done:false},
    {id:'exact',petId:'p',vaccine:'Kennel Cough',done:true},
    {id:'exact-plan',petId:'p',vaccine:'KENNEL COUGH',done:false},
    {id:'new',petId:'p',vaccine:'Feline 4-in-1',done:false},
  ];
  assert.deepEqual(visibleStateVaccinations(rows).map(v=>v.id),['old','other-pet','core','legacy-core','worm','exact','new']);
  assert.equal(rows.length,10);
});
test('vaccine-name reads grow linearly for large unmatched datasets',()=>{
  let reads=0;
  const rows=Array.from({length:10000},(_,i)=>({id:`v${i}`,petId:`p${i}`,done:i%2===0,get vaccine(){reads++;return 'Rabies';}}));
  assert.equal(visibleStateVaccinations(rows).length,10000);
  assert.ok(reads<=rows.length*2,`Unexpected repeated scans: ${reads}`);
});
test('state revalidation preserves the JSON envelope, omits unchanged bodies, and changes when data changes',async()=>{
  let data={pets:[{id:'pet',name:'Saved',photo:'synthetic'.repeat(1000)}]};
  const app=express();app.get('/state',(req,res)=>sendClinicState(req,res,data));
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  try {
    const url=`http://127.0.0.1:${server.address().port}/state`;
    const first=await fetch(url);const etag=first.headers.get('etag');assert.match(first.headers.get('cache-control'),/private, no-store/);
    assert.deepEqual(await first.json(),{success:true,data});
    const same=await fetch(url,{headers:{'If-None-Match':etag}});assert.equal(same.status,304);assert.equal(await same.text(),'');
    data={pets:[]};const changed=await fetch(url,{headers:{'If-None-Match':etag}});
    assert.equal(changed.status,200);assert.notEqual(changed.headers.get('etag'),etag);assert.deepEqual((await changed.json()).data,data);
  }finally{await new Promise(r=>server.close(r));}
});
