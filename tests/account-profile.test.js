import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accountProfile, saveAccountProfile } from '../src/accountProfile.js';

test('staff never inherit an owner profile with the same email', () => {
  const me = { id: 'vet', role: 'vet', email: 'same@example.test', name: 'Doctor' };
  const db = { owners: [{ id: 'owner', email: me.email, photo: 'other-picture' }] };
  assert.equal(accountProfile(db, me).photo, undefined);
});
test('photos are isolated by account and removal survives empty strings', () => {
  let db = saveAccountProfile({ owners: [] }, 'vet', { photo: 'vet-photo' });
  db = saveAccountProfile(db, 'admin', { photo: 'admin-photo' });
  db = saveAccountProfile(db, 'vet', { photo: '' });
  assert.equal(accountProfile(db, { id: 'vet', role: 'vet' }).photo, '');
  assert.equal(accountProfile(db, { id: 'admin', role: 'admin' }).photo, 'admin-photo');
});
test('owner synchronization preserves owner ID and normalizes address and birthday', () => {
  const db = saveAccountProfile({ owners: [{ id: 'o1', userId: 'u1' }] }, 'u1', { id: 'u1', role: 'owner', ownerId: 'o1', photo: 'picture', birthday: '1990-01-02T00:00:00.000Z', address: { houseStreet: 'Street', city: 'City' } });
  assert.equal(db.owners[0].id, 'o1');
  assert.equal(db.owners[0].address, 'Street, City');
  const account = accountProfile(db, { id: 'u1', role: 'owner', ownerId: 'o1' });
  assert.equal(account.id, 'u1');
  assert.equal(account.houseStreet, 'Street');
  assert.equal(account.address, 'Street, City');
  assert.equal(account.birthday, '1990-01-02');
});

import {contactFieldErrors,contactCodeErrors} from '../src/accountProfile.js';
test('profile inline feedback matches server phone, address and code constraints',()=>{
 assert.deepEqual(contactFieldErrors({email:'owner@example.com',phone:'09171234567',houseStreet:'12 Rizal St',city:'Makati',state:'Metro Manila',country:'Philippines',zipCode:'1200'}),{});
 assert.ok(contactFieldErrors({email:'owner@example.com',phone:'09171234567'}).houseStreet,'An address is now required, like at registration');
 assert.ok(contactFieldErrors({email:'invalid',phone:'1234567890',city:'x\nInjected'}).email);
 assert.ok(contactFieldErrors({email:'owner@example.com',phone:'1234567890'}).phone);
 assert.ok(contactFieldErrors({email:'owner@example.com',phone:'09171234567',city:'x\nInjected'}).city);
 assert.ok(contactFieldErrors({email:'owner@example.com',phone:'09171234567',zipCode:'x'.repeat(21)}).zipCode);
 assert.deepEqual(contactCodeErrors({requireEmail:true,requirePhone:false},{emailCode:'123456'}),{});
 for(const code of ['','123','abcdef'])assert.ok(contactCodeErrors({requireEmail:true},{emailCode:code}).emailCode);
 assert.ok(contactCodeErrors({requirePhone:true},{phoneCode:''}).phoneCode);
});
