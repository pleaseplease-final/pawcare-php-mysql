import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dewormingSchedule,availableDewormingLots} from '../src/dewormingSchedule.js';
import {dewormingProducts} from '../server/dewormingProducts.js';
test('schedule derives from care date, stage and risk, with calendar-month arithmetic',()=>{
 const pet={date:'2026-10-26',birth:'2026-08-13',species:'Canine'};
 assert.equal(dewormingSchedule(pet).nextDue,'2026-11-09');
 assert.equal(dewormingSchedule({...pet,weaned:true}).nextDue,'2026-11-26');
 assert.equal(dewormingSchedule({...pet,weaned:true}).intervalDays,'31');
 assert.equal(dewormingSchedule({...pet,birth:'2020-01-01'}).nextDue,'2027-01-26');
 assert.equal(dewormingSchedule({...pet,birth:'2020-01-01',monthlyRisk:true}).nextDue,'2026-11-26');
 assert.equal(dewormingSchedule({...pet,date:'2026-01-31',birth:'2020-01-01',monthlyRisk:true}).nextDue,'2026-02-28');
 assert.equal(dewormingSchedule({...pet,date:'2024-01-31',birth:'2020-01-01',monthlyRisk:true}).nextDue,'2024-02-29');
});
test('unsupported patients and invalid dates never receive an invented schedule',()=>{
 for(const p of [{species:'Rabbit',birth:'2025-01-01'},{species:'Feline',birth:'2026-10-10'},{species:'Canine',birth:'2026-10-20'},{species:'Canine',birth:''},{species:'Canine',birth:'2026-02-30'}])assert.equal(dewormingSchedule({date:'2026-10-26',...p}),null);
 assert.equal(dewormingSchedule({species:'Feline',birth:'2026-10-01',date:'2026-10-26'}).intervalDays,'14');
});
test('lot autofill uses only actual unexpired configured lots in expiry order',()=>{
 const p={lots:[{batch:'later',expiresOn:'2027-01-01'},{batch:'expired',expiresOn:'2026-10-25'},{batch:'first',expiresOn:'2026-11-01'}]};
 assert.deepEqual(availableDewormingLots(p,'2026-10-26').map(l=>l.batch),['first','later']);
 assert.deepEqual(availableDewormingLots(p,'2028-01-01'),[]);
 assert.deepEqual(availableDewormingLots(undefined,'2026-10-26'),[]);
});
test('clinic product configuration defaults to catalog brands without fabricated lots and rejects malformed inventory',()=>{
 const previous=process.env.CLINIC_DEWORMING_PRODUCTS_JSON;
 try{
 delete process.env.CLINIC_DEWORMING_PRODUCTS_JSON;
 assert.deepEqual(dewormingProducts().map(p=>p.name),['Canex','Drontal']);
 assert.ok(dewormingProducts().every(p=>p.lots.length===0));
 process.env.CLINIC_DEWORMING_PRODUCTS_JSON=JSON.stringify([{id:'test',name:'Test product',lots:[{batch:'TEST',expiresOn:'2027-01-01'}]}]);
 assert.equal(dewormingProducts()[0].lots[0].batch,'TEST');
 process.env.CLINIC_DEWORMING_PRODUCTS_JSON=JSON.stringify([{id:'test',name:'Test',lots:[{batch:'TEST',expiresOn:'2026-02-30'}]}]);
 assert.throws(()=>dewormingProducts());
 }finally{if(previous===undefined)delete process.env.CLINIC_DEWORMING_PRODUCTS_JSON;else process.env.CLINIC_DEWORMING_PRODUCTS_JSON=previous;}
});

test('older catalog responses retain brand choices without overriding an explicit configured list',async()=>{
 const {dewormingProductChoices}=await import('../src/dewormingProducts.js');
 assert.deepEqual(dewormingProductChoices({catalog:[]}).map(p=>p.name),['Canex','Drontal']);
 assert.deepEqual(dewormingProductChoices({dewormingProducts:[]}),[]);
 const configured=[{id:'clinic',name:'Clinic product',lots:[]}];
 assert.equal(dewormingProductChoices({dewormingProducts:configured}),configured);
});
