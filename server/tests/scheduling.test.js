import { test } from 'node:test';
import assert from 'node:assert/strict';
import { availableSlots, validateSchedule, clinicClock, shiftDate, minutes } from '../scheduling.js';
import { validateBoosterDate } from '../reminders.js';
import { currentVaccinationDue } from '../../src/vaccinationDue.js';

const now = new Date('2026-10-24T00:00:00Z'); // 08:00 Manila
const visit = { service: 'checkup', date: '2026-10-25', time: '10:00' };
test('booking uses Manila dates at UTC/year boundaries and a rolling 90-day limit', () => {
  assert.deepEqual(clinicClock(new Date('2026-12-31T17:05Z')), { date:'2027-01-01', time:'01:05' });
  assert.equal(validateSchedule(visit, now),60);
  assert.throws(() => validateSchedule({ ...visit,date:shiftDate('2026-10-24',91) },now),/90 days/);
  assert.equal(validateSchedule({ ...visit,date:shiftDate('2026-10-24',90) },now),60);
});
test('rejects malformed/rolled dates, holidays, passed starts and visits beyond closing', () => {
  for (const v of [{date:'2026-02-30'}, {date:'2026-2-3'}, {date:'2026-12-25'}, {date:'2026-10-24',time:'08:00'}, {time:'16:30'}, {time:'09:15'}, {time:'25:00'}, {service:'unknown'}]) assert.throws(() => validateSchedule({...visit,...v},now));
  assert.equal(validateSchedule({...visit,time:'16:00'},now),60);
  assert.equal(validateSchedule({...visit,service:'surgery',time:'15:00'},now),120);
  assert.throws(() => validateSchedule({...visit,service:'surgery',time:'15:30'},now));
});
test('availability respects the full stored duration and legacy AM/PM times', () => {
  const rows=[{id:'a', time:'09:00 AM', duration_minutes:120,status:'Scheduled'}];
  const slots=availableSlots(rows,visit,now);
  assert.ok(!slots.includes('08:30')); assert.ok(!slots.includes('10:30'));
  assert.ok(slots.includes('08:00')); assert.ok(slots.includes('11:00'));
  assert.equal(minutes('02:00 PM'),840); assert.equal(minutes('12:00 AM'),0); assert.ok(Number.isNaN(minutes('13:00 PM')));
});
test('editing excludes only the authorized visit; cancellations and walk-in arrivals do not reserve slots', () => {
  const rows=[{id:'a',time:'10:00',duration_minutes:60,status:'Pending Approval'}];
  assert.ok(availableSlots(rows,{...visit,excludeId:'a'},now).includes('10:00'));
  assert.ok(!availableSlots(rows,visit,now).includes('10:00'));
  for (const patch of [{status:'Cancelled'},{status:'No-show'},{booking_kind:'walk-in'}]) assert.ok(availableSlots([{...rows[0],...patch}],visit,now).includes('10:00'));
  assert.deepEqual(availableSlots([{...rows[0],time:'bad'}],visit,now),[]);
});
test('booster dates are valid calendar dates after administration', () => {
  for (const d of ['2026-02-30','2026-01-01','garbage']) assert.throws(()=>validateBoosterDate('2026-01-02',d));
  validateBoosterDate('2026-01-02','2026-02-02');
});
test('recall includes completed certified doses and retires old/superseded schedules', () => {
  const a={id:'a',petId:'p',vaccine:'Anti-rabies',date:'2026-01-01',nextDue:'2027-01-01',done:true,vetId:'v'};
  assert.deepEqual(currentVaccinationDue([a,{...a,id:'placeholder',done:false}]),[a]);
  const b={...a,id:'b',vaccine:'Rabies booster',date:'2026-10-01',nextDue:'2027-10-01'};
  assert.deepEqual(currentVaccinationDue([a,b]),[b]);
  assert.deepEqual(currentVaccinationDue([a,{...b,nextDue:null}]),[]);
});

test('reception timeline blocks every part of a longer reservation and ignores cancelled arrivals',async()=>{
 const {reservationCovers}=await import('../../src/booking.js');
 const appointment={time:'10:00',durationMinutes:120,status:'Scheduled'};
 assert.equal(reservationCovers(appointment,'11:30'),true);assert.equal(reservationCovers(appointment,'12:00'),false);
 assert.equal(reservationCovers({...appointment,status:'Cancelled'},'11:00'),false);
 assert.equal(reservationCovers({...appointment,bookingKind:'walk-in'},'11:00'),false);
});
