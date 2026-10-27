// Finalizing a consultation with the "External prescriptions / additional home-care instructions" box
// empty, then filled in. Both must reach the server request without any prescription error.
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
const catalog=[{id:'srv_consult',name:'Consultation',price:500},{id:'product_omega3',name:'Omega-3 capsules',price:450,category:'Pet vitamins',unit:'item / package'}];
const errorsOnScreen=()=>[...document.querySelectorAll('.err,[role="alert"]')].map(e=>e.textContent.trim()).filter(Boolean);
const invalidFields=()=>[...document.querySelectorAll('[aria-invalid="true"]')].map(e=>e.getAttribute('name')||e.id);

async function attempt(label,note){
 const originalGet=api.get,originalPost=api.post;
 let sent=null;
 api.get=async path=>path==='/api/services/prices'?{catalog}:path==='/api/clinical/note-options'?{options:{diagnosis:[],treatment:[]}}:{visits:[]};
 api.post=async(path,body)=>{sent={path,body};throw Error('CAPTURED: request reached the server call');};
 const pet={id:'fixture-pet',ownerId:'fixture-owner',name:'Synthetic patient',species:'Canine',birth:'2018-01-01'};
 const appt={id:`fixture-${label}`,petId:pet.id,vetId:'fixture-vet',date:today(),status:'In consultation',service:'checkup',reason:'Annual check-up',intakeVitals:{weight:12,temp:38.6}};
 const key=soapDraftKey('fixture-vet',appt.id,pet.id);localStorage.removeItem(key);
 try{
  const db={...emptyClinicState(),pets:[pet],owners:[{id:pet.ownerId,name:'Synthetic owner'}],appts:[appt],vacc:[]};
  flushSync(()=>root.render(<SoapConsultationModal appt={appt} pet={pet} db={db} me={{id:'fixture-vet',role:'vet',name:'Synthetic vet'}} setDb={()=>{}} onClose={()=>{}} />));
  await frame();await frame();await frame();
  assert(field('prescription'),'The external prescription box must be on the consultation form');
  await edit('symptoms','Owner reports mild itching for two days');
  await edit('diagnosis','Mild skin allergy');
  await edit('treatment','Bathe weekly and monitor');
  if(note)await edit('prescription',note);
  flushSync(()=>document.querySelector('form').requestSubmit());await frame();await frame();
  const review=document.querySelector('.submission-review');
  let confirmed=false;
  if(review){const go=button('Finalize visit');if(go){flushSync(()=>go.click());await frame();await frame();await frame();confirmed=true;}}
  return {label,note:note||'(empty)',reachedReviewStep:!!review,confirmedAndSent:!!sent,sentPrescription:sent?.body?.prescription,sentItems:sent?.body?.prescriptionItems,
    invalidFields:invalidFields(),errorsOnScreen:errorsOnScreen(),confirmClicked:confirmed};
 }finally{flushSync(()=>root.render(null));api.get=originalGet;api.post=originalPost;localStorage.removeItem(key);}
}
async function run(){
 const cases=[['empty',''],['typed','Amoxicillin 250 mg - buy at any pharmacy; give 1 capsule twice daily for 7 days'],['maximum length','x'.repeat(3000)]];
 const results=[];
 for(const [label,note] of cases){
  const r=await attempt(label,note);
  assert(r.reachedReviewStep,label+': the form must reach the review step, but showed: '+JSON.stringify(r.errorsOnScreen));
  assert(r.confirmedAndSent,label+': the request must be sent to the server');
  assert(r.sentPrescription===note,label+': the note must be sent exactly as typed');
  assert(!r.invalidFields.length,label+': no field may be flagged invalid: '+r.invalidFields.join(', '));
  // The fixture's fake server always fails the save and has no admission list; any other message is a real error.
  const unexpected=r.errorsOnScreen.filter(m=>!/CAPTURED|Admission availability/.test(m));
  assert(!unexpected.length,label+': unexpected error on screen: '+unexpected.join(' | '));
  results.push({label,noteLength:note.length,sentPrescriptionLength:r.sentPrescription.length,passed:true});
 }
 return {passed:true,results};
}
window.externalRxResult=run().then(r=>{document.getElementById('results').textContent=JSON.stringify(r,null,2);return r;}).catch(e=>{document.getElementById('results').textContent='ERROR '+e.stack;throw e;});
