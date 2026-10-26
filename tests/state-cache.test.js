import {test, beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {readStateCache, writeStateCache, clearStateCache} from '../src/stateCache.js';

const store = new Map();
globalThis.sessionStorage = {getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k), get length() { return store.size; }, key: i => [...store.keys()][i]};
Object.defineProperty(globalThis.sessionStorage, 'keys', {value: () => [...store.keys()]});
beforeEach(() => store.clear());

test('the last records come back for the same person within the day', () => {
  writeStateCache('u1:owner', {pets: [{id: 'p1'}]}, 1000);
  assert.deepEqual(readStateCache('u1:owner', 2000), {pets: [{id: 'p1'}]});
});
test('another person or an old copy gets nothing', () => {
  writeStateCache('u1:owner', {pets: []}, 0);
  assert.equal(readStateCache('u2:owner', 10), null);
  assert.equal(readStateCache('u1:owner', 9 * 60 * 60 * 1000), null);
});
test('a damaged copy is ignored, never thrown', () => {
  store.set('pawcare_state_u1:owner', '{not json');
  assert.equal(readStateCache('u1:owner'), null);
});
test('logging out wipes saved records', () => {
  writeStateCache('u1:owner', {pets: []});
  clearStateCache();
  assert.equal(readStateCache('u1:owner'), null);
});
