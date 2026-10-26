import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bookingDayConflict, validateOwnerBooking } from '../src/ownerBooking.js';
import { shiftDate } from '../server/scheduling.js';

const context = {pets:[{id:'pet',species:'Canine'}],vets:[{id:'vet'},{id:'other-vet'}],appointments:[],records:[],date:'2026-10-25',last:'2027-01-23',time:'10:15'};
const booking = {petId:'pet',vetId:'vet',service:'vaccination',vaccineId:'rabies',date:'2026-10-26',time:'10:00',notes:''};
const validate = (patch = {}, extra = {}) => validateOwnerBooking({...booking,...patch},{...context,...extra});

test('one pet cannot book twice on the same day, across veterinarians and services', () => {
  for (const status of ['Pending Approval','Scheduled','Checked-in','In consultation','Completed']) {
    const existing={id:'original',petId:'pet',date:booking.date,time:'08:00',vetId:'other-vet',service:'checkup',status};
    assert.ok(validate({}, {appointments:[existing]}).date, status);
    assert.equal(bookingDayConflict([existing],'pet',booking.date),existing);
    assert.equal(validate({}, {appointments:[existing],editing:existing}).date,undefined);
  }
});
test('cancelled and no-show visits allow rebooking, as do different pets and different days', () => {
  for(const patch of [{status:'Cancelled'},{status:'No-show'},{petId:'other-pet'},{date:'2026-10-27'}]) {
    assert.deepEqual(validate({}, {appointments:[{id:'old',petId:'pet',date:booking.date,status:'Scheduled',...patch}]}),{});
  }
});
test('real calendar dates, clinic holidays and the rolling booking window are enforced', () => {
  for(const date of ['','2026-02-30','2026-11-31','2026-1-2','2026-10-24','2027-01-24','2026-12-25']) assert.ok(validate({date}).date,date);
  assert.equal(validate({date:shiftDate(context.date,90)}).date,undefined);
  assert.ok(validate({date:'2026-10-24'},{editing:{id:'old',date:'2026-10-24'}}).date,'editing does not bypass the server date rule');
});
test('time grid, elapsed starts and complete service duration must fit clinic hours', () => {
  for(const time of ['','09:15','25:00','07:30','17:00','23:30'])assert.ok(validate({time}).time,time);
  assert.ok(validate({date:context.date,time:'10:00'}).time);
  assert.equal(validate({date:context.date,time:'10:30'}).time,undefined);
  assert.ok(validate({service:'surgery',time:'15:30'}).time);
  assert.equal(validate({service:'surgery',time:'15:00'}).time,undefined);
});
test('only owned pets, current vets and known services are accepted', () => {
  assert.ok(validate({petId:'someone-elses-pet'}).petId);
  assert.ok(validate({vetId:'inactive'}).vetId);
  assert.ok(validate({service:'made-up'}).service);
});
test('follow-ups must belong to the pet and cannot already have a booked or completed visit', () => {
  const record={id:'follow',petId:'pet',careStatus:'Recheck required',followUpDate:'2026-11-10'};
  assert.deepEqual(validate({followUpId:'follow'},{records:[record]}),{});
  for(const patch of [{petId:'someone-elses-pet'},{careStatus:'Routine care'},{followUpDate:null}])assert.ok(validate({followUpId:'follow'},{records:[{...record,...patch}]}).followUpId);
  const visit={id:'linked',petId:'pet',date:'2026-11-10',status:'Scheduled',followUpId:'follow'};
  for(const status of ['Pending Approval','Completed'])assert.ok(validate({followUpId:'follow'},{records:[record],appointments:[{...visit,status}]}).followUpId);
  assert.equal(validate({followUpId:'follow'},{records:[record],appointments:[visit],editing:visit}).followUpId,undefined);
  assert.equal(validate({followUpId:'follow'},{records:[record],appointments:[{...visit,status:'Cancelled'}]}).followUpId,undefined);
});
test('notes respect the size limit and allow owners to describe care needs in their language', () => {
  assert.ok(validate({notes:'x'.repeat(201)}).notes);
  assert.ok(validate({notes:'123!'}).notes);
  assert.equal(validate({notes:'我的宠物需要帮助'}).notes,undefined);
});

test('vaccination requests require an explicit, species-compatible vaccine',()=>{
  assert.ok(validate({vaccineId:''}).vaccineId);
  assert.ok(validate({vaccineId:'feline-core'}).vaccineId);
  assert.equal(validate({vaccineId:'vet-review'}).vaccineId,undefined);
});
