// Synthetic DOM checks; provider reads are replaced locally, no clinical writes.
import React from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import SoapConsultationModal from '../../src/roles/SoapConsultationModal.jsx';
import {api} from '../../src/api.js';
import {today} from '../../src/booking.js';
import {soapDraftKey} from '../../src/soapDraft.js';
import {emptyClinicState} from '../../src/clinicState.js';
const root=createRoot(document.getElementById('visit-tests'));
const frame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
const assert=(condition,message)=>{if(!condition)throw Error(message);};
const field=name=>document.querySelector(`[name="${name}"]`);
const keys=new Set();let mountCount=0;
async function edit(name,value){
 const control=field(name);assert(control,`Missing ${name}`);
 const proto=control instanceof HTMLSelectElement?HTMLSelectElement.prototype:control instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
 // Native selects dispatch input before change; React may render between them.
 flushSync(()=>{Object.getOwnPropertyDescriptor(proto,'value').set.call(control,value);control.dispatchEvent(new Event('input',{bubbles:true}));});
 if(control instanceof HTMLSelectElement)flushSync(()=>control.dispatchEvent(new Event('change',{bubbles:true})));
 await frame();
}
async function toggle(name){flushSync(()=>field(name).click());await frame();}
async function mount(service,reason,{clear=true}={}){
 const pet={id:'fixture-pet',ownerId:'fixture-owner',name:'Synthetic patient',species:'Canine',birth:'2025-01-01'};
 const appt={id:`fixture-${service}`,petId:pet.id,vetId:'fixture-vet',date:today(),status:'In consultation',service,reason,intakeVitals:{weight:5,temp:38}};
 const key=soapDraftKey('fixture-vet',appt.id,pet.id);keys.add(key);if(clear)localStorage.removeItem(key);
 const db={...emptyClinicState(),pets:[pet],owners:[{id:pet.ownerId,name:'Synthetic owner'}],appts:[appt]};
 flushSync(()=>root.render(<SoapConsultationModal key={++mountCount} appt={appt} pet={pet} db={db} me={{id:'fixture-vet',role:'vet',name:'Synthetic vet'}} setDb={()=>{}} onClose={()=>{}} />));
 await frame();await frame();
}
async function run(){
 const originalGet=api.get,originalPost=api.post;let legacyCatalog=false;
 api.get=async path=>path==='/api/services/prices'?{...(!legacyCatalog ? {dewormingProducts:[{id:'fixture-product',name:'Synthetic dewormer',lots:[{batch:'SYNTHETIC-EXPIRED',expiresOn:'2000-01-01'},{batch:'SYNTHETIC-LOT',expiresOn:'2099-12-31'}]}]} : {}),catalog:[{id:'srv_groom',name:'Grooming',price:100},{id:'srv_deworm',name:'Deworming',price:250},{id:'srv_rabies',name:'Anti-rabies',price:250}]}:path==='/api/clinical/note-options'?{options:{diagnosis:[],treatment:[]}}:{visits:[]};
 api.post=async()=>{throw Error('Fixture must never write clinical data');};
 try{
  legacyCatalog=true;await mount('deworming','Routine deworming');await toggle('giveVaccine');
  flushSync(()=>document.querySelector('form').requestSubmit());await frame();
  await edit('brand','canex');assert(field('brand').value==='canex','Native product selection reset after validation');
  legacyCatalog=false;
  await mount('checkup','Skin or ear problem');
  await edit('visitAnswer-onset','x'.repeat(501));
  assert(field('visitAnswer-onset').getAttribute('aria-invalid')==='true','History length must validate while typing');
  await edit('visitAnswer-onset','Started yesterday');
  assert(field('visitAnswer-onset').getAttribute('aria-invalid')==='false','Corrected history must clear immediately');
  await mount('checkup','Skin or ear problem',{clear:false});
  assert(field('visitAnswer-onset').value==='Started yesterday','Focused history must survive draft recovery');
  await edit('weight','121');assert(field('weight').getAttribute('aria-invalid')==='true','Weight must validate live');
  await edit('weight','5');assert(field('weight').getAttribute('aria-invalid')==='false','Weight correction must clear');
  await edit('diagnosis',' ');assert(field('diagnosis').getAttribute('aria-invalid')==='true','Consultation requires assessment');
  await edit('diagnosis','Recorded findings');assert(field('diagnosis').getAttribute('aria-invalid')==='false','Assessment correction must clear');
  await edit('symptomStart',new Date(Date.parse(today())-2*86400000).toISOString().slice(0,10));
  assert(document.body.textContent.includes('Duration at this visit: 2 day(s)'),'Symptom duration must calculate');
  await edit('carePlanChoice',field('carePlanChoice').options[1].value);
  await edit('treatment','');assert(field('treatment').getAttribute('aria-invalid')==='false','Selected reason-specific plan must populate durable care');
  await toggle('scheduleFollowUp');await edit('followUpDays','10');
  assert(field('followUpDate').value===new Date(Date.parse(today())+10*86400000).toISOString().slice(0,10),'Follow-up interval must calculate date');
  await edit('followUpDays','0');assert(field('followUpDays').getAttribute('aria-invalid')==='true','Invalid recheck interval must show inline');
  flushSync(()=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes('In 7 Days')).click());await frame();
  assert(field('followUpDays').getAttribute('aria-invalid')==='false','A preset must clear the previous native interval error');
  await mount('vaccination','Vaccination: Anti-rabies');
  await toggle('giveVaccine');
  await edit('diagnosis','');await edit('treatment','');
  assert(field('diagnosis').getAttribute('aria-invalid')==='false','Confirmed vaccination supplies assessment statement');
  assert(field('treatment').getAttribute('aria-invalid')==='false','Confirmed vaccination supplies care details');
  assert(field('intervalDays').readOnly && field('intervalDays').value==='365','Vaccine interval must populate automatically');
  await toggle('vaccineManual');await edit('intervalDays','14');
  assert(document.getElementById('booster-due').value>today(),'Due date must calculate immediately');
  await toggle('scheduleApproved');assert(field('scheduleApproved').checked,'Approval must be selectable');
  await edit('intervalDays','30');assert(!field('scheduleApproved').checked,'Changed interval must reset approval');
  assert(field('scheduleApproved').getAttribute('aria-invalid')==='true','Reset approval must show inline');
  await edit('doseNo','3');await edit('doseOf','2');assert(field('doseOf').getAttribute('aria-invalid')==='true','Invalid series must show inline');
  await edit('doseOf','3');assert(field('doseOf').getAttribute('aria-invalid')==='false','Corrected series must clear');
  await toggle('giveVaccine');assert(field('diagnosis').getAttribute('aria-invalid')==='true','Deferral requires a reason');
  await mount('grooming','Sanitary care');await toggle('groomingPerformed');
  await edit('diagnosis','');await edit('treatment','');
  assert(field('diagnosis').getAttribute('aria-invalid')==='false','Confirmed grooming supplies suitability');
  assert(field('treatment').getAttribute('aria-invalid')==='false','Confirmed grooming supplies care details');
  await toggle('groomingPerformed');assert(field('treatment').getAttribute('aria-invalid')==='true','Deferred grooming needs next steps');
  await mount('deworming','Routine deworming');await toggle('giveVaccine');
  assert(!field('diagnosis').closest('details').open,'Confirmed care must hide extra note boxes');
  assert(field('intervalDays').readOnly && Number(field('intervalDays').value)>0,'Repeat interval must populate automatically');
  const quarterly=document.getElementById('booster-due').value;
  await toggle('dewormingMonthlyRisk');assert(document.getElementById('booster-due').value<quarterly,'Risk change must recalculate due date');
  await edit('brand','fixture-product');assert(field('batch').value==='SYNTHETIC-LOT','Product selection must fill actual configured lot');
  assert(!field('batch').textContent.includes('EXPIRED'),'Expired lots must not be offered');
  await toggle('scheduleApproved');assert(field('scheduleApproved').checked,'Calculated schedule still accepts vet approval');
  await toggle('dewormingManual');await edit('intervalDays','21');assert(!field('scheduleApproved').checked,'Manual change must invalidate approval');
  await toggle('giveVaccine');assert(field('diagnosis').closest('details').open,'Deferred care must expose notes');
  legacyCatalog=true;
  await mount('deworming','Routine deworming');await toggle('giveVaccine');
  assert(!field('batch'),'Optional batch field must be hidden');
  assert([...field('brand').options].some(o=>o.value==='canex'),'Legacy catalog must offer clinic brands');
  flushSync(()=>document.querySelector('form').requestSubmit());await frame();
  assert(field('brand').getAttribute('aria-invalid')==='true','Missing product must show validation before selection');
  await edit('brand','canex');assert(field('brand').value==='canex','Canex selection must remain selected');
  await edit('brand','drontal');assert(field('brand').value==='drontal','Brand must be changeable');
  await edit('brand','other');await edit('otherBrand','Actual custom product');
  assert(field('otherBrand').value==='Actual custom product','Custom brand must remain editable');
  await edit('brand','canex');
  await mount('deworming','Routine deworming',{clear:false});
  assert(field('brand').value==='canex','Brand selection must survive draft recovery');
  return {passed:true,checks:['live history limits','draft recovery','live weight and assessment','vaccination documentation','due-date calculation','approval invalidation','series validation','grooming confirmation and deferral','collapsed confirmed-care notes','automatic deworming schedule','configured product lot autofill','expired lot exclusion','reason-specific care plan','symptom duration','follow-up calculation','legacy product choices','brand switching and recovery','optional batch hidden']};
 }finally{flushSync(()=>root.unmount());api.get=originalGet;api.post=originalPost;for(const key of keys)localStorage.removeItem(key);}
}
window.visitFormResult=run().then(result=>{document.getElementById('results').textContent=JSON.stringify(result,null,2);return result;}).catch(error=>{document.getElementById('results').textContent=error.stack;throw error;});
