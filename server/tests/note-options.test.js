import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateNoteOptions } from '../noteOptions.js';
test('clinic choices support editing, ordering and retiring all entries', () => {
  assert.deepEqual(validateNoteOptions({diagnosis:['  Custom diagnosis  ','Second'],treatment:['Home care']}),{diagnosis:['Custom diagnosis','Second'],treatment:['Home care']});
  assert.deepEqual(validateNoteOptions({diagnosis:[],treatment:[]}),{diagnosis:[],treatment:[]});
});
test('clinic choices reject duplicate, multiline, missing and oversized entries', () => {
  for(const options of [null,{},[],{diagnosis:['A','a'],treatment:[]},{diagnosis:['a\nb'],treatment:[]},{diagnosis:[' '],treatment:[]},{diagnosis:[true],treatment:[]},{diagnosis:['x'.repeat(1001)],treatment:[]},{diagnosis:Array.from({length:101},(_,i)=>String(i)),treatment:[]}]) assert.throws(()=>validateNoteOptions(options),{status:400});
});
