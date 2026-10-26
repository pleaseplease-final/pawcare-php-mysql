import {test} from 'node:test';
import assert from 'node:assert/strict';
import {boosterDate, followUpVisit, openFollowUps} from '../../src/clinicalWorkflow.js';
import {clinicalCharges,validateClinicalCharges} from '../clinicalCharges.js';
test('booster schedule starts at administration, crosses leap days and refuses invalid intervals',()=>{
 assert.equal(boosterDate('2024-02-01',28),'2024-02-29');
 assert.equal(boosterDate('2026-12-20',28),'2027-01-17');
 for(const [date,days] of [['2026-02-30',28],['2026-10-24',''],['2026-10-24',1.5],['2026-10-24',0],['2026-10-24',3651]]) assert.equal(boosterDate(date,days),'');
});
test('performed services and administered vaccines are charged once at official prices',()=>{
 const lines=clinicalCharges(['srv_consult','srv_rabies'],{vaccine:'Anti-rabies'});
 assert.deepEqual(lines.map(i=>[i.catalogId,i.qty,i.price]),[['srv_consult',1,500],['srv_rabies',1,350]]);
 assert.throws(()=>clinicalCharges(['srv_consult','srv_consult']));
 assert.throws(()=>clinicalCharges(['product_multivitamin']));
 assert.throws(()=>clinicalCharges(['srv_nexgard']));
 assert.equal(clinicalCharges([], {vaccine:'Other'}).length,0);
 assert.equal(validateClinicalCharges(lines,lines),null);
 assert.ok(validateClinicalCharges(lines.slice(1),lines));
 assert.ok(validateClinicalCharges([...lines,lines[0]],lines));
 assert.ok(validateClinicalCharges([{...lines[0],qty:2},lines[1]],lines));
});
test('each follow-up survives later notes, ignores unrelated visits and reopens after cancellation',()=>{
 const r={id:'r1',petId:'p1',careStatus:'Recheck required',followUpDate:'2026-11-01'};
 const unrelated={id:'a',petId:'p1',date:'2026-11-01',time:'10:00',status:'Pending Approval'};
 const db={records:[r,{id:'newer',petId:'p1',careStatus:'Routine care'}],appts:[unrelated]};
 assert.deepEqual(openFollowUps(db),[r]);
 const linked={...unrelated,id:'b',followUpId:'r1'};db.appts.push(linked);
 assert.equal(followUpVisit(r,db.appts).id,'b');assert.equal(openFollowUps(db).length,0);
 linked.status='Cancelled';assert.deepEqual(openFollowUps(db),[r]);
 db.appts.push({...linked,id:'c',status:'Completed'});assert.equal(followUpVisit(r,db.appts).id,'c');assert.equal(openFollowUps(db).length,0);
});
