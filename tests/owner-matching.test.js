import {test} from 'node:test';
import assert from 'node:assert/strict';
import {matchingOwners} from '../src/ownerMatching.js';
test('owner matching returns all conflicting contacts and normalizes PH mobile and email',()=>{
 const owners=[{id:'a',email:'maria@example.com',phone:'0917 111-2233'},{id:'b',email:'other@example.com',phone:'+639172223344'}];
 assert.deepEqual(matchingOwners(owners,{email:' MARIA@EXAMPLE.COM ',phone:'09172223344'}).map(o=>o.id),['a','b']);
 assert.deepEqual(matchingOwners(owners,{phone:'+63 917 111 2233'}).map(o=>o.id),['a']);
 assert.deepEqual(matchingOwners(owners,{email:'',phone:''}),[]);
});
