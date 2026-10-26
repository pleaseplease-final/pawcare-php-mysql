import { test } from 'node:test';
import assert from 'node:assert/strict';
import { soapDraftKey, readSoapDraft, writeSoapDraft } from '../src/soapDraft.js';
const storage = () => {const data = new Map();return {getItem:key => data.get(key),setItem:(key,value) => data.set(key,value),removeItem:key => data.delete(key)};};
const form = {diagnosis:'',treatment:'',giveVaccine:false,scheduleFollowUp:false};
const fixture = () => ({form:{...form,diagnosis:'Draft findings',giveVaccine:true},prescriptionItems:[{catalogId:'product',name:'Synthetic',price:250,quantity:'',instructions:'',dose:{amount:'',unit:'mL'}}],performedServices:['srv_consult'],consultationId:'note-id',vaccinationId:'dose-id',expectedVisit:{id:'visit',petId:'patient',status:'In consultation',intakeVitals:{weight:5,temp:38}}});
test('SOAP recovery preserves unfinished clinical fields, product calculations, services, request IDs and original visit snapshot', () => {
  const db = storage(), key = soapDraftKey('vet','visit','patient');
  writeSoapDraft(db,key,fixture(),1000);
  const recovered = readSoapDraft(db,key,form);
  assert.deepEqual(recovered,{...fixture(),version:1,savedAt:1000});
  db.removeItem(key); assert.equal(readSoapDraft(db,key,form),null);
});
test('drafts are isolated by signed-in account, visit and patient', () => {
  const db = storage(); writeSoapDraft(db,soapDraftKey('vet','visit','patient'),fixture());
  for (const identity of [['other','visit','patient'],['vet','other','patient'],['vet','visit','other']]) assert.equal(readSoapDraft(db,soapDraftKey(...identity),form),null);
  assert.notEqual(soapDraftKey('a:b','c','d'),soapDraftKey('a','b:c','d'));
});
test('unreadable and malformed recovery data cannot replace the form', () => {
  const db = storage(),key = 'draft';
  for (const raw of ['{','null',JSON.stringify({version:1}),JSON.stringify({...fixture(),version:1,savedAt:Date.now(),form:{...form,diagnosis:[]}})]) {
    db.setItem(key,raw); assert.throws(() => readSoapDraft(db,key,form));
  }
});
test('storage failures propagate so the UI can keep notes open without claiming recovery is available', () => {
  const blocked = {getItem(){throw Error('blocked');},setItem(){throw Error('full');}};
  assert.throws(() => readSoapDraft(blocked,'key',form));
  assert.throws(() => writeSoapDraft(blocked,'key',fixture()));
});

test('unfinished notes remain recoverable after a long absence', () => {
  const db = storage(); writeSoapDraft(db,'draft',fixture(),0);
  assert.equal(readSoapDraft(db,'draft',form).form.diagnosis,'Draft findings');
});

test('older unfinished drafts gain optional vaccination-card fields without losing clinical inputs or identifiers',()=>{
 const db=storage();writeSoapDraft(db,'draft',fixture(),1000);
 const optional={manufacturer:'',serialNumber:'',microchipNumber:'',microchipDate:''};
 const recovered=readSoapDraft(db,'draft',{...form,...optional});
 assert.deepEqual(recovered.form,{...fixture().form,...optional});
 assert.equal(recovered.consultationId,fixture().consultationId);
 assert.deepEqual(recovered.expectedVisit,fixture().expectedVisit);
});


test('focused visit fields migrate older drafts and preserve incomplete entries',()=>{
 const db=storage();writeSoapDraft(db,'draft',fixture());
 const initial={...form,visitAnswers:{}};
 assert.deepEqual(readSoapDraft(db,'draft',initial).form.visitAnswers,{});
 const draft={...fixture(),form:{...fixture().form,visitAnswers:{onset:'Draft onset'}}};
 writeSoapDraft(db,'draft',draft);
 assert.deepEqual(readSoapDraft(db,'draft',initial).form.visitAnswers,{onset:'Draft onset'});
 for(const value of [[],{onset:22}]){
  writeSoapDraft(db,'draft',{...draft,form:{...draft.form,visitAnswers:value}});
  assert.throws(()=>readSoapDraft(db,'draft',initial));
 }
});

test('deworming automation preserves a previously entered interval as a custom draft',()=>{
 const db=storage(),draft=fixture();draft.form.intervalDays='21';writeSoapDraft(db,'draft',draft);
 const initial={...form,intervalDays:'',dewormingManual:false,dewormingWeaned:false,dewormingMonthlyRisk:false,dewormingProductId:''};
 const recovered=readSoapDraft(db,'draft',initial);
 assert.equal(recovered.form.dewormingManual,true);assert.equal(recovered.form.intervalDays,'21');
 assert.equal(recovered.form.dewormingWeaned,false);
 draft.form.intervalDays='';writeSoapDraft(db,'draft',draft);
 assert.equal(readSoapDraft(db,'draft',initial).form.dewormingManual,false);
});
