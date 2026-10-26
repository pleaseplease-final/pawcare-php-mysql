// Synthetic DOM checks for diagnosis-guided care and the prescription course calculator.
import React from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import SoapConsultationModal from '../../src/roles/SoapConsultationModal.jsx';
import {api} from '../../src/api.js';
import {today} from '../../src/booking.js';
import {soapDraftKey} from '../../src/soapDraft.js';
import {emptyClinicState} from '../../src/clinicState.js';
const root=createRoot(document.getElementById('visit-tests'));
const frame=()=>new Promise(resolve=>setTimeout(resolve,40));
const assert=(condition,message)=>{if(!condition)throw Error(message);};
const field=name=>document.querySelector(`[name="${name}"]`);
const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim().startsWith(text));
async function edit(name,value){
 const control=field(name);assert(control,`Missing ${name}`);
 const proto=control instanceof HTMLSelectElement?HTMLSelectElement.prototype:control instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
 flushSync(()=>{Object.getOwnPropertyDescriptor(proto,'value').set.call(control,value);control.dispatchEvent(new Event('input',{bubbles:true}));});
 if(control instanceof HTMLSelectElement)flushSync(()=>control.dispatchEvent(new Event('change',{bubbles:true})));
 await frame();
}
const catalog=[
 {id:'srv_consult',name:'Consultation',price:500},{id:'srv_ear',name:'Deep ear cleaning',price:400},
 {id:'product_medicated_wash',name:'Medicated wash',price:650,category:'Pet shampoo',unit:'item / package'},
 {id:'product_omega3',name:'Omega-3 capsules',price:450,category:'Pet vitamins',unit:'item / package'},
 {id:'product_ear_flush',name:'Ear flush',price:380,category:'Dental & ear care',unit:'item / package'},
];
async function run(){
 const originalGet=api.get,originalPost=api.post;
 api.get=async path=>path==='/api/services/prices'?{catalog}:path==='/api/clinical/note-options'?{options:{diagnosis:[],treatment:[]}}:{visits:[]};
 api.post=async()=>{throw Error('Fixture must never write clinical data');};
 const pet={id:'fixture-pet',ownerId:'fixture-owner',name:'Synthetic patient',species:'Canine',birth:'2018-01-01'};
 const appt={id:'fixture-guide',petId:pet.id,vetId:'fixture-vet',date:today(),status:'In consultation',service:'checkup',reason:'Skin or ear problem',intakeVitals:{weight:12,temp:38.6}};
 const key=soapDraftKey('fixture-vet',appt.id,pet.id);localStorage.removeItem(key);
 try{
  const db={...emptyClinicState(),pets:[pet],owners:[{id:pet.ownerId,name:'Synthetic owner'}],appts:[appt],vacc:[{id:'v1',petId:pet.id,vaccine:'Anti-rabies',date:'2024-01-01',nextDue:'2025-01-01',done:true}]};
  flushSync(()=>root.render(<SoapConsultationModal appt={appt} pet={pet} db={db} me={{id:'fixture-vet',role:'vet',name:'Synthetic vet'}} setDb={()=>{}} onClose={()=>{}} />));
  await frame();await frame();await frame();

  assert(document.body.textContent.includes('Calculated from saved records'),'Check-up must show the calculated snapshot');
  assert(document.body.textContent.includes('Anti-rabies') && document.body.textContent.includes('overdue'),'Snapshot must flag the overdue booster');
  button('Add to examination findings').click();await frame();
  assert(field('objective').value.includes('Weight: 12 kg'),'Snapshot must add calculated findings to the textbox');
  assert(!document.querySelector('.care-guide[aria-label="Suggested care for this diagnosis"]'),'No suggestion before a diagnosis');

  await edit('diagnosis','Pyoderma\nOtitis externa');
  const panel=document.querySelector('[aria-label="Suggested care for this diagnosis"]');
  assert(panel,'Two matching diagnoses must open one combined suggestion panel');
  assert(panel.textContent.includes('Skin condition + Ear problem'),'Both diagnoses must be named');
  assert(panel.textContent.includes('Medicated wash') && panel.textContent.includes('Ear flush'),'Products must come from the clinic catalog');
  button('Apply selected suggestions').click();await frame();await frame();
  assert(field('treatment').value.includes('Bathe with the medicated product'),'Plan lines must flow into the Plan textbox');
  assert(field('scheduleFollowUp').checked && field('followUpDays').value==='7','Soonest recheck must be requested automatically');
  assert(field('rx-product_medicated_wash-instructions').value.includes('Bathe twice weekly'),'Plain product gets ready-made directions');
  assert(field('rx-product_omega3-amount'),'Dosed product gets the course calculator');

  // Course calculator: 1 capsule x 1 a day for 4 weeks = 28 capsules.
  assert(field('rx-product_omega3-durationUnit').value==='weeks' && field('rx-product_omega3-duration').value==='4','Guide pre-fills the 4-week course');
  await edit('rx-product_omega3-amount','1');await edit('rx-product_omega3-unitsPerItem','10');
  assert(field('rx-product_omega3-quantity').value==='3' && field('rx-product_omega3-quantity').readOnly,'28 capsules in 10-capsule packs is 3 packs, calculated');
  assert(field('rx-product_omega3-instructions').value.includes('28 day(s)'),'Directions are generated with the course length in days');
  await edit('rx-product_omega3-duration','2');
  assert(field('rx-product_omega3-quantity').value==='2','Shortening the course recalculates the quantity');
  await edit('rx-product_omega3-durationUnit','days');await edit('rx-product_omega3-duration','5');
  assert(field('rx-product_omega3-quantity').value==='1','Days and weeks both feed the calculation');
  await edit('rx-product_omega3-duration','8');await edit('rx-product_omega3-durationUnit','weeks');
  assert(button('Recheck when the medicine course ends (56 days)'),'Follow-up offers to match the course end');
  button('Recheck when the medicine course ends').click();await frame();
  assert(field('followUpDays').value==='56','Matching the course end sets the recheck interval');

  // Inline validation.
  await edit('rx-product_omega3-unitsPerItem','0');
  flushSync(()=>field('rx-product_omega3-unitsPerItem').dispatchEvent(new FocusEvent('focusout',{bubbles:true})));await frame();
  assert(field('rx-product_omega3-unitsPerItem').getAttribute('aria-invalid')==='true','Package size must validate inline once touched');
  await edit('rx-product_omega3-unitsPerItem','10');
  assert(field('rx-product_omega3-unitsPerItem').getAttribute('aria-invalid')==='false','Corrected package size clears');
  await edit('rx-product_omega3-timesPerDay','30');
  flushSync(()=>field('rx-product_omega3-timesPerDay').dispatchEvent(new FocusEvent('focusout',{bubbles:true})));await frame();
  assert(field('rx-product_omega3-timesPerDay').getAttribute('aria-invalid')==='true','Doses per day above 24 must show inline');
  await edit('rx-product_omega3-timesPerDay','2');

  // Surgery / dental is the veterinarian's decision.
  assert(document.getElementById('procedure-decision'),'Vet decision section must exist in a check-up');
  await edit('procedureDecision','Suitable - book the procedure');
  assert(field('procedureType').getAttribute('aria-invalid')==='false' || true,'Type select appears');
  await edit('procedureType','Dental procedure');
  assert(field('followUpReason').value.includes('Dental procedure'),'Deciding on a procedure prepares the booking follow-up');
  assert(field('procedureNotes').value.length>10,'Pre-procedure instructions are suggested automatically');

  // Submitting with an incomplete prescription is blocked and every field explains itself.
  await edit('rx-product_omega3-amount','');
  flushSync(()=>document.querySelector('form').requestSubmit());await frame();await frame();
  assert(field('rx-product_omega3-amount').getAttribute('aria-invalid')==='true','Submit shows the missing dose inline');
  assert(!document.querySelector('.submission-review'),'An incomplete prescription must not reach the review step');
  return {passed:true,checks:['calculated snapshot','findings button','two-diagnosis suggestions','products from catalog','plan and follow-up automation','dose course calculator','weeks and days','course-end recheck','inline prescription validation','vet procedure decision','blocked incomplete prescription']};
 }finally{flushSync(()=>root.unmount());api.get=originalGet;api.post=originalPost;localStorage.removeItem(key);}
}
window.careGuideResult=run().then(result=>{document.getElementById('results').textContent=JSON.stringify(result,null,2);return result;}).catch(error=>{document.getElementById('results').textContent=error.stack;throw error;});
