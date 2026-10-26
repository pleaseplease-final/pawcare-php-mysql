import test from 'node:test';
import assert from 'node:assert/strict';
import {matchGuides,mergeGuides,prescriptionLine,courseDays,courseEnd,checkupSnapshot} from '../src/clinicalGuide.js';
import {calculateSupply,rxLineErrors} from '../src/prescription.js';
import {bookableServices} from '../src/booking.js';
import {validateBooking} from '../src/booking.js';

test('two diagnoses merge into one plan with one product each and the soonest recheck', () => {
  const guides = matchGuides('Pyoderma\nOtitis externa\nAcute vomiting');
  assert.deepEqual(guides.map(g => g.id), ['skin','ear','digestive']);
  const merged = mergeGuides(guides);
  assert.equal(merged.followUpDays, 3);
  assert.equal(new Set(merged.products.map(p => p.id)).size, merged.products.length);
  assert.deepEqual(matchGuides('Something unrecognised'), []);
});
test('weeks convert to days and drive the supply quantity', () => {
  assert.equal(courseDays(2, 'weeks'), 14);
  assert.ok(Number.isNaN(courseDays(1.5, 'days')));
  const line = prescriptionLine({dosed:true,unit:'tablet',route:'by mouth',timesPerDay:2,duration:2,durationUnit:'weeks'}, {id:'p',name:'X',price:10,category:'Pet medicine'});
  assert.ok(rxLineErrors(line).amount && rxLineErrors(line).unitsPerItem, 'amount and package size are left for the vet');
  const done = {...line, dose:{...line.dose, amount:'1', unitsPerItem:'10'}};
  const supply = calculateSupply({amount:1,timesPerDay:2,days:courseDays(2,'weeks'),unitsPerItem:10,unit:'tablet',route:'by mouth'});
  assert.equal(supply.quantity, 3);
  assert.equal(courseEnd([done]), 14);
  assert.ok(rxLineErrors({...done, instructions:supply.directions, quantity:supply.quantity}).amount === undefined);
});
test('prescription fields report their own inline errors', () => {
  const e = rxLineErrors({dose:{amount:'0',unit:'x',route:'y',timesPerDay:'30',days:400,unitsPerItem:''},instructions:'',quantity:0});
  for (const key of ['amount','unit','route','timesPerDay','duration','unitsPerItem','instructions','quantity']) assert.ok(e[key], key);
});
test('snapshot flags overdue boosters and a missing record', () => {
  const snap = checkupSnapshot({pet:{name:'Rex',birth:'2020-01-01',species:'Dog'},vitals:{weight:12,temp:38.6},vaccs:[{done:true,vaccine:'Anti-rabies',date:'2025-01-01',nextDue:'2026-01-01'}],today:'2026-10-26'});
  assert.ok(snap.plan.some(l => /overdue/.test(l)));
  assert.ok(checkupSnapshot({pet:{name:'Rex'},vaccs:[],today:'2026-10-26'}).plan.length);
});
test('surgery / dental can no longer be booked but old visits keep it', () => {
  assert.ok(!bookableServices('').some(([k]) => k === 'surgery'));
  assert.ok(bookableServices('surgery').some(([k]) => k === 'surgery'));
  const base = {service:'surgery',petId:'p1',vetId:'v1',date:'2099-01-01',time:'09:00'};
  assert.ok(validateBooking({appts:[],busy:[]}, [{id:'p1'}], base).service);
});

import {assistantQueue,overdueVisits} from '../src/assistantWorkflow.js';
test('earlier-day visits that were never checked in surface for the assistant', () => {
  const visits=[{id:'a',date:'2026-10-20',time:'09:00',status:'Scheduled'},{id:'b',date:'2026-10-21',time:'09:00',status:'Pending Approval'},{id:'c',date:'2026-10-20',time:'10:00',status:'Completed'},{id:'d',date:'2026-10-26',time:'09:00',status:'Scheduled'}];
  assert.deepEqual(overdueVisits(visits,'2026-10-26').map(v=>v.id),['b','a']);
  assert.equal(assistantQueue(visits,'2026-10-26').overdue.length,2);
});

import {addressErrors} from '../src/addressRules.js';
import {contactFieldErrors} from '../src/accountProfile.js';
test('profile edits follow the registration address rules', () => {
  const good={houseStreet:'12 Rizal St',city:'Makati',state:'Metro Manila',country:'Philippines',zipCode:'1200'};
  assert.deepEqual(addressErrors(good),{});
  for(const key of ['houseStreet','city','state','country','zipCode']) assert.ok(addressErrors({...good,[key]:''})[key],key);
  assert.ok(addressErrors({...good,zipCode:'12A0'}).zipCode);
  assert.ok(contactFieldErrors({email:'a@gmail.com',phone:'+639171234567',...good,city:''}).city);
});

import {summarize,categoryOf,categoryOptions} from '../src/reportSummary.js';
test('report summaries and filters come from the saved records', () => {
  const db={vets:[{id:'v1',name:'Dr. A'}],pets:[],vacc:[]};
  const appts=[{id:1,status:'Completed',billingStatus:'Paid',amount:500.5},{id:2,status:'Completed',billingStatus:'Unpaid',amount:200},{id:3,status:'No-show'},{id:4,status:'Cancelled'}];
  const rows=Object.fromEntries(summarize('appts',appts,db));
  assert.equal(rows['Matching records'],'4');
  assert.equal(rows['Paid amount'],'₱500.50');
  assert.equal(rows['Completed, awaiting payment'],'1');
  assert.equal(rows['Completion rate (of closed visits)'],'50%');
  assert.equal(rows['No-show rate (of arrivals expected)'],'33%');
  assert.deepEqual(categoryOptions('appts',appts,db),['Cancelled','Completed','No-show']);
  assert.equal(categoryOf('pets',{species:'Dog'},db),'Canine');
  const records=summarize('records',[{petId:'p',vetId:'v1',careStatus:'Follow-up required'},{petId:'p',vetId:'v1',careStatus:'Routine care'}],db);
  assert.deepEqual(Object.fromEntries(records)['Seen by Dr. A'],'2');
  assert.equal(Object.fromEntries(records)['With a follow-up requested'],'1');
  assert.deepEqual(summarize('appts',[],db),[['Matching records','0']]);
});

import {salesCsv,csvCell} from '../src/salesCsv.js';
import {dailyCollections} from '../src/assistantWorkflow.js';
test('sales export lists settled payments with totals and defuses formulas', () => {
  const paid={id:'a1',petId:'p',billingStatus:'Paid',amount:300,paymentMethod:'Cash',paymentReference:'CASH-1',paidAt:'2026-10-26T02:00:00.000Z',invoiceItems:[{name:'Consult, exam',price:300,qty:1}]};
  const db={pets:[{id:'p',name:'=Rex',ownerId:'o'}],owners:[{id:'o',name:'Ana'}]};
  const csv=salesCsv({visits:[paid],db,label:'2026-10-26',collections:dailyCollections([paid],'2026-10-26')});
  assert.match(csv,/'=Rex/);assert.match(csv,/"1 x Consult, exam"/);assert.match(csv,/Total of listed payments,300\.00/);assert.match(csv,/Cash \(all payments that day\),300\.00/);
  assert.equal(csvCell('a,b'),'"a,b"');
});
