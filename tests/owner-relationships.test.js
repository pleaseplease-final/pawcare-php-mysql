import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ownerForPet, petsForOwner } from '../src/ownerRelationships.js';
const owners = [{id:'owner-1',userId:'account-1',name:'Same name'}, {id:'owner-2',name:'Same name'}];
const pets = [{id:'pet-1',ownerId:'owner-1'}, {id:'pet-2',ownerId:'account-1'}, {id:'pet-3',ownerId:'owner-2'}, {id:'unlinked'}];
test('patient owner lookup supports both saved owner and account IDs', () => {
  assert.equal(ownerForPet(owners,pets[0]),owners[0]);
  assert.equal(ownerForPet(owners,pets[1]),owners[0]);
  assert.equal(ownerForPet(owners,pets[2]),owners[1]);
});
test('households show only explicitly linked pets even when owners share a name', () => {
  assert.deepEqual(petsForOwner(pets,owners[0]).map(p=>p.id),['pet-1','pet-2']);
  assert.deepEqual(petsForOwner(pets,owners[1]).map(p=>p.id),['pet-3']);
});
test('missing links never attach an unlinked patient to an owner without an account ID', () => {
  assert.equal(ownerForPet(owners,pets[3]),null);
  assert.equal(ownerForPet(owners,{ownerId:'unknown'}),null);
  assert.deepEqual(petsForOwner(pets,null),[]);
});
