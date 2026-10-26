import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ownerBill, recentTransactions } from '../src/ownerBilling.js';
const visit={id:'visit1',status:'Pending Approval',billingStatus:'Unpaid',amount:600,invoiceItems:[]};
const lines=[{name:'Consultation',price:500,qty:1},{name:'Prescribed product',price:125.35,qty:2}];

test('booking defaults and unfinished checkout are never presented as actual debt',()=>{
 assert.equal(ownerBill(visit).amount,null);assert.equal(ownerBill(visit).status,'No bill yet');
 assert.equal(ownerBill({...visit,status:'Cancelled'}).amount,null);
 const finished=ownerBill({...visit,status:'Completed'});
 assert.equal(finished.status,'Awaiting checkout');assert.equal(finished.amount,null);
});
test('draft charges use saved lines and discount in cents, independent of booking amount',()=>{
 const draft=ownerBill({...visit,status:'Completed',invoiceItems:lines,discount:25.7});
 assert.equal(draft.subtotal,750.7);assert.equal(draft.amount,725);assert.equal(draft.discount,25.7);assert.equal(draft.paid,false);
 assert.equal(draft.status,'Awaiting checkout');
 const small=ownerBill({...visit,invoiceItems:[{name:'Historical small amount',price:0.1,qty:3}],discount:0.2});
 assert.equal(small.amount,0.1);
});
test('paid history preserves the recorded amount and old custom lines without current catalog pricing',()=>{
 const source={...visit,billingStatus:'Paid',amount:725,discount:25.7,invoiceItems:lines};
 const before=structuredClone(source);const bill=ownerBill(source);
 assert.equal(bill.amount,725);assert.deepEqual(bill.items,lines);assert.equal(bill.mismatch,false);assert.deepEqual(source,before);
 const legacy=ownerBill({...source,amount:450,invoiceItems:[{name:'Historical custom charge',price:450,qty:1}],discount:0});
 assert.equal(legacy.amount,450);assert.equal(legacy.items[0].price,450);
});
test('legacy payments without itemization retain paid amount and do not invent a breakdown',()=>{
 const bill=ownerBill({...visit,billingStatus:'Paid',amount:450});
 assert.equal(bill.amount,450);assert.equal(bill.subtotal,null);assert.deepEqual(bill.items,[]);assert.equal(bill.mismatch,false);
});
test('invalid data never turns into a fabricated total, while a saved payment remains authoritative',()=>{
 for(const invoiceItems of [[{name:'Bad',price:NaN,qty:1}],[{name:'Bad',price:10,qty:-1}],[{name:'Bad',price:0.001,qty:1}],[{name:'Too large',price:10000000,qty:Number.MAX_SAFE_INTEGER}]]){
  assert.equal(ownerBill({...visit,invoiceItems}).amount,null);
  assert.equal(ownerBill({...visit,invoiceItems,billingStatus:'Paid',amount:50}).amount,50);
 }
 for(const amount of [null,undefined,NaN,-1,'600'])assert.equal(ownerBill({...visit,billingStatus:'Paid',amount}).amount,null);
 assert.equal(ownerBill({...visit,invoiceItems:lines,discount:9999}).amount,null);
});
test('inconsistent historical itemization is flagged without replacing the recorded payment',()=>{
 const bill=ownerBill({...visit,billingStatus:'Paid',amount:700,invoiceItems:lines});
 assert.equal(bill.amount,700);assert.equal(bill.subtotal,750.7);assert.equal(bill.mismatch,true);
});

test('admitted stays await vet approval without presenting an unfinished total as payable',()=>{
 const a={...visit,status:'Completed',invoiceItems:lines,admissionStatus:'Admitted'};
 assert.equal(ownerBill(a).status,'Awaiting discharge approval');assert.equal(ownerBill(a).amount,null);
 assert.deepEqual(ownerBill(a).items,lines,'draft lines are retained');
 assert.equal(ownerBill({...a,admissionStatus:'Ready for discharge'}).status,'Awaiting checkout');
 assert.equal(ownerBill({...a,billingStatus:'Paid',amount:750.7}).amount,750.7,'historical payments remain authoritative');
});


test('recent transactions rank actual payment time, retain completed unpaid visits and omit bookings',()=>{
 const a={id:'old-visit',date:'2025-01-01',time:'09:00',status:'Completed',billingStatus:'Paid',paidAt:'2026-10-26T04:00:00Z',amount:250};
 const b={...a,id:'recent-visit',date:'2026-10-26',paidAt:'2026-10-26T03:00:00Z'};
 const draft={id:'unpaid',date:'2026-10-26',time:'13:00',status:'Completed',billingStatus:'Unpaid',amount:9999};
 const booking={...draft,id:'booking',status:'Scheduled'};
 const rows=[b,booking,a,draft],before=structuredClone(rows);
 assert.deepEqual(recentTransactions(rows).map(a=>a.id),['unpaid','old-visit','recent-visit']);
 assert.equal(ownerBill(recentTransactions(rows)[0]).amount,null,'Do not turn a booking amount into a bill');
 assert.deepEqual(recentTransactions(rows,1).map(a=>a.id),['unpaid']);assert.deepEqual(rows,before);
});
