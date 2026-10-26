import { test } from 'node:test';
import assert from 'node:assert/strict';
import { confirmedBooking, confirmedPayment, confirmedCancellation } from '../src/receptionSaves.js';

const booking = {id:'visit',petId:'pet',vetId:'doctor',date:'2026-10-25',time:'10:00',service:'checkup',followUpId:'care-plan'};
const savedVisit = {...booking,status:'Pending Approval',durationMinutes:60,bookingKind:'scheduled',reason:'Saved reason',amount:600};
test('booking uses the server record and checks visit, slot, service and follow-up identity', () => {
  assert.equal(confirmedBooking({success:true,appointment:savedVisit},booking),savedVisit);
  for (const field of ['id','petId','vetId','date','time','service','followUpId','status']) {
    assert.throws(()=>confirmedBooking({success:true,appointment:{...savedVisit,[field]:'other'}},booking),/did not confirm/);
  }
  for(const response of [{}, {success:true}, {success:false,appointment:savedVisit}])assert.throws(()=>confirmedBooking(response,booking),/did not confirm/);
  assert.doesNotThrow(()=>confirmedBooking({success:true,appointment:{...savedVisit,followUpId:null}},{...booking,followUpId:''}));
});

const items=[{catalogId:'srv_consult',name:'Consultation',price:500,qty:1}];
const submitted={amount:450,discount:50,cashTendered:500,changeAmount:50,paymentMethod:'Cash',paymentReference:'cash-fixture',invoiceItems:items};
const payment={id:'visit',petId:'pet',status:'Completed',billingStatus:'Paid',paidAt:'2026-10-24T10:00:00Z',...submitted};
test('receipt accepts confirmed saved payment details including electronic payment',()=>{
 assert.equal(confirmedPayment({success:true,appointment:payment},booking,submitted),payment);
 const electronic={...submitted,paymentMethod:'GCash',paymentReference:'synthetic-reference',cashTendered:450,changeAmount:0};
 assert.doesNotThrow(()=>confirmedPayment({success:true,appointment:{...payment,...electronic}},booking,electronic));
});
test('missing, unrelated or financially inconsistent receipts remain unconfirmed',()=>{
 for(const patch of [{id:'other'},{petId:'other'},{status:'Pending Approval'},{billingStatus:'Unbilled'},{paidAt:null},{paidAt:'invalid'},{amount:500},{amount:450.001},{discount:0},{cashTendered:600},{changeAmount:0},{paymentMethod:'Maya'},{paymentReference:'other'},{invoiceItems:[]},{invoiceItems:[{...items[0],qty:2}]},{invoiceItems:[{...items[0],price:NaN}]}]) {
  assert.throws(()=>confirmedPayment({success:true,appointment:{...payment,...patch}},booking,submitted),/did not confirm/);
 }
 for(const response of [{},{success:true},{success:false,appointment:payment}])assert.throws(()=>confirmedPayment(response,booking,submitted),/did not confirm/);
});


test('unchanged confirmed bookings retain confirmation, changed slots require Scheduled', () => {
  const confirmed = {...savedVisit,status:'Scheduled'};
  assert.equal(confirmedBooking({success:true,appointment:confirmed},{...booking,status:'Scheduled'}),confirmed);
  assert.throws(()=>confirmedBooking({success:true,appointment:confirmed},booking),/did not confirm/);
});
test('cancellation requires the saved matching visit and retains the server reason', () => {
  const appointment={id:'visit',pet_id:'pet',vet_id:'doctor',date:booking.date,time:booking.time,status:'Cancelled',cancel_reason:'Saved cancellation reason'};
  const result=confirmedCancellation({success:true,appointment},booking);
  assert.equal(result.petId,'pet');assert.equal(result.vetId,'doctor');assert.equal(result.cancelReason,'Saved cancellation reason');
  for(const patch of [{id:'other'},{pet_id:'other'},{vet_id:'other'},{date:'2026-10-26'},{time:'12:00'},{status:'Pending Approval'},{reason:'Unrelated reason'}])assert.throws(()=>confirmedCancellation({success:true,appointment:{...appointment,...patch}},booking),/did not confirm/);
  for(const response of [{},{success:true},{success:false,appointment}])assert.throws(()=>confirmedCancellation(response,booking),/did not confirm/);
});
