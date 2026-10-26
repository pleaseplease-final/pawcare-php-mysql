import {test,mock} from 'node:test';
import assert from 'node:assert/strict';
import {today,plus} from '../src/booking.js';
import {subscribeClinicDate,refreshClinicDate,TODAY} from '../src/clinicDate.js';
import {computeAgeDetails,getNextBirthdayAnniversary} from '../src/preventiveSchedule.js';

test('Manila day rolls over without a reload, notifies mounted screens once and cleans up',()=>{
 mock.timers.enable({apis:['Date','setTimeout'],now:Date.parse('2026-10-24T15:59:59Z')});
 try {
  refreshClinicDate();let updates=0;const unsubscribe=subscribeClinicDate(()=>updates++);
  assert.equal(TODAY,'2026-10-24');assert.equal(today(),TODAY);assert.equal(plus(1),'2026-10-25');
  mock.timers.tick(1021);assert.equal(TODAY,'2026-10-25');assert.equal(updates,1);
  refreshClinicDate();assert.equal(updates,1);
  unsubscribe();mock.timers.tick(86400000);assert.equal(updates,1);
 }finally{mock.timers.reset();refreshClinicDate();}
});
test('focus/visibility clock refresh catches a suspended tab and preventive dates use current clinic day',()=>{
 mock.timers.enable({apis:['Date','setTimeout'],now:Date.parse('2026-12-31T15:59:00Z')});
 try{
  refreshClinicDate();const events=new EventTarget();globalThis.window=events;globalThis.document=events;
  let calls=0;const off=subscribeClinicDate(()=>calls++);
  mock.timers.setTime(Date.parse('2027-01-01T00:05:00Z'));events.dispatchEvent(new Event('focus'));
  assert.equal(TODAY,'2027-01-01');assert.equal(calls,1);assert.equal(plus(1),'2027-01-02');
  assert.equal(computeAgeDetails('2026-01-01').years,1);assert.equal(getNextBirthdayAnniversary('2020-01-01'),'2027-01-01');off();events.dispatchEvent(new Event('focus'));assert.equal(calls,1);
 }finally{delete globalThis.window;delete globalThis.document;mock.timers.reset();refreshClinicDate();}
});
