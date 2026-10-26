import {test} from 'node:test';
import assert from 'node:assert/strict';
import {noteLines,readNoteOptions,savedNoteOptions} from '../src/noteOptions.js';
import {validateNoteOptions} from '../server/noteOptions.js';
const config=()=>({revision:4,options:{diagnosis:['First','Second'],treatment:['Home care']}});
test('saved choices preserve ordering, normalize lines and allow retirement of every entry',()=>{
 assert.deepEqual(noteLines(' First \r\n\nSecond  '),['First','Second']);
 assert.deepEqual(readNoteOptions(config()),config());
 const empty={revision:5,options:{diagnosis:[],treatment:[]}};
 assert.deepEqual(savedNoteOptions(empty,4,{treatment:[],diagnosis:[]}),empty);
 assert.deepEqual(readNoteOptions({revision:0,options:{diagnosis:[' Trimmed '],treatment:[]}}).options,{diagnosis:['Trimmed'],treatment:[]});
});
test('client accepts existing server-valid choice lists and rejects malformed snapshots atomically',()=>{
 for(const options of [{diagnosis:[],treatment:[]},{diagnosis:['Custom diagnosis'],treatment:['Custom plan']},{diagnosis:Array.from({length:100},(_,i)=>String(i)),treatment:['x'.repeat(1000)]}])assert.deepEqual(readNoteOptions({revision:1,options:validateNoteOptions(options)}).options,options);
 for(const data of [null,{}, {...config(),revision:-1},{...config(),revision:1.5},{...config(),revision:'4'},{...config(),options:{diagnosis:['First']}},{...config(),options:{diagnosis:['First','first'],treatment:[]}},{...config(),options:{diagnosis:['a\nb'],treatment:[]}},{...config(),options:{diagnosis:[' '],treatment:[]}},{...config(),options:{diagnosis:[true],treatment:[]}},{...config(),options:{diagnosis:Array.from({length:101},(_,i)=>String(i)),treatment:[]}},{...config(),options:{diagnosis:['x'.repeat(1001)],treatment:[]}}])assert.throws(()=>readNoteOptions(data));
});
test('save acknowledgement must confirm the exact lists, their order and next revision',()=>{
 const expected=config().options;
 assert.deepEqual(savedNoteOptions({revision:5,options:expected},4,expected),{revision:5,options:expected});
 for(const result of [{},{...config(),revision:4},{...config(),revision:6},{revision:5,options:{...expected,diagnosis:['Second','First']}},{revision:5,options:{...expected,treatment:[]}}])assert.throws(()=>savedNoteOptions(result,4,expected),{unconfirmed:true});
});
