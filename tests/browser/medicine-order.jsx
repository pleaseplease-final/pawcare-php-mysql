// The veterinarian medicine order: dropdowns for the medicine, unit, route and schedule, and live checks while typing.
import React from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import '../../src/styles.css';
import '../../src/fonts.css';
import '../../src/roles/admissions.css';
import AdmissionMedicineForm from '../../src/roles/AdmissionMedicineForm.jsx';
const root=createRoot(document.getElementById('fixture'));
const frame=(ms=60)=>new Promise(resolve=>setTimeout(resolve,ms));
const assert=(condition,message)=>{if(!condition)throw Error(message);};
const field=name=>document.querySelector(`[name="${name}"]`);
const invalid=name=>field(name)?.getAttribute('aria-invalid')==='true';
const message=name=>document.getElementById(field(name).getAttribute('aria-describedby'))?.textContent.trim()||'';
const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim().startsWith(text));
const calls=[];
const catalog=[{id:'srv_nexgard',name:'NexGard Spectra Chewable Tablet',price:550,requiresPrescription:true,category:'Pharmacy & Parasiticide'},{id:'product_omega3',name:'Omega-3 Fish Oil',price:450,category:'Pet vitamins'}];
window.fetch=async(path,options={})=>{
 const url=String(path),method=options.method||'GET',body=options.body?JSON.parse(options.body):null;calls.push({method,url,body});
 const reply=data=>new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
 if(url.includes('/services/prices'))return reply({success:true,catalog});
 if(method==='POST')return reply({success:true,admission:{id:'11111111-1111-4111-8111-111111111111',revision:2}});
 return reply({});
};
async function edit(name,value){
 const control=field(name);assert(control,`Missing ${name}`);
 const proto=control instanceof HTMLSelectElement?HTMLSelectElement.prototype:control instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
 flushSync(()=>{Object.getOwnPropertyDescriptor(proto,'value').set.call(control,value);control.dispatchEvent(new Event('input',{bubbles:true}));});
 if(control instanceof HTMLSelectElement)flushSync(()=>control.dispatchEvent(new Event('change',{bubbles:true})));
 await frame();
}
async function run(){
 const admission={id:'11111111-1111-4111-8111-111111111111',revision:1,status:'Admitted',petName:'Rekrek',admittedAt:new Date(Date.now()-3600000).toISOString()};
 let saved=null;
 flushSync(()=>root.render(<AdmissionMedicineForm action="order" admission={admission} onClose={()=>{}} onSaved={row=>{saved=row;}}/>));
 await frame(300);
 const text=document.body.textContent;
 assert(!text.includes('The veterinarian enters'),'The old "veterinarian enters" wording must be gone');
 assert(text.includes('Each field is checked as you type'),'The short instruction shows');
 for(const name of ['medicineChoice','doseAmount','doseUnit','routeChoice','frequencyChoice'])assert(field(name),`Missing control ${name}`);
 assert(!field('medicineOther'),'The medicine name box opens only when adding another medicine');
 assert(!document.querySelector('[aria-invalid="true"]'),'No error is shown before anything is typed');
 const options=[...field('medicineChoice').options].map(o=>o.textContent);
 assert(options.includes('NexGard Spectra Chewable Tablet')&&options.includes('Omega-3 Fish Oil'),'Clinic medicines are in the dropdown');
 assert(options.some(o=>o.includes('Add another medicine')),'There is an "Add another medicine" choice');

 // ?shot=1 leaves the form filled with the original mistakes, for a screenshot of the live errors.
 if(new URLSearchParams(location.search).get('shot')){
  await edit('medicineChoice','other');await edit('medicineOther','646546');await edit('doseAmount','45334');await edit('routeChoice','other');await edit('routeOther','5354');await edit('frequencyChoice','other');await edit('frequencyOther','534543');
  return {passed:true,shot:true};
 }
 // Submitting an empty form explains every control and sends nothing.
 flushSync(()=>document.querySelector('form').requestSubmit());await frame();
 for(const name of ['medicineChoice','doseAmount','doseUnit','routeChoice','frequencyChoice','clinicalNote'])assert(invalid(name),`${name} must be flagged on an empty submit`);
 assert(!calls.some(c=>c.method==='POST'),'Nothing is sent while the form is incomplete');

 // Medicine: add another, then type numbers only -> flagged as soon as it is typed, corrected -> clears.
 await edit('medicineChoice','other');assert(field('medicineOther'),'The name box opens');
 await edit('medicineOther','646546');
 assert(invalid('medicineOther')&&/letters/.test(message('medicineOther')),'646546 is refused while typing: '+message('medicineOther'));
 await edit('medicineOther','Metronidazole');
 assert(!invalid('medicineOther'),'A real medicine name clears the error');

 // Dose: amount and unit.
 await edit('doseAmount','abc');assert(invalid('doseAmount')&&/numbers only/i.test(message('doseAmount')),'Letters in the amount are refused: '+message('doseAmount'));
 await edit('doseAmount','45334');assert(invalid('doseAmount')&&/10,000/.test(message('doseAmount')),'A huge amount is refused: '+message('doseAmount'));
 await edit('doseAmount','2.12345');assert(invalid('doseAmount')&&/four decimal/.test(message('doseAmount')),'Too many decimals refused');
 await edit('doseAmount','2.5');assert(!invalid('doseAmount'),'A real amount clears the error');
 await edit('doseUnit','mL');assert(!invalid('doseUnit'),'The unit clears its error');

 // Route and schedule: dropdowns with "Other" that opens a text box.
 await edit('routeChoice','other');assert(field('routeOther'),'The route box opens for Other');
 await edit('routeOther','5354');assert(invalid('routeOther')&&/letters/.test(message('routeOther')),'5354 is refused as a route');
 await edit('routeChoice','iv');assert(!field('routeOther')&&!invalid('routeChoice'),'Choosing a listed route closes the box');
 await edit('frequencyChoice','other');await edit('frequencyOther','534543');assert(invalid('frequencyOther'),'534543 is refused as a schedule');
 await edit('frequencyChoice','bid');assert(!invalid('frequencyChoice'),'A listed schedule is accepted');
 await edit('clinicalNote','Started for post-operative pain control');

 // A complete, valid order reaches the review step and sends the combined values.
 flushSync(()=>document.querySelector('form').requestSubmit());await frame(120);
 assert(!document.querySelector('[aria-invalid="true"]'),'No field is flagged once everything is valid: '+[...document.querySelectorAll('[aria-invalid="true"]')].map(e=>e.name).join(','));
 const go=button('Save medicine record');assert(go,'The review step opens');
 flushSync(()=>go.click());await frame(200);
 const post=calls.find(c=>c.method==='POST');assert(post,'The order is sent');
 assert(post.body.medicine==='Metronidazole'&&post.body.dose==='2.5 mL'&&post.body.route==='Intravenous (IV)'&&post.body.frequency==='Twice daily (every 12 hours)',
  'Unexpected order: '+JSON.stringify(post.body));
 assert(saved&&saved.revision===2,'The saved admission is handed back');
 return {passed:true,checks:['old wording removed','dropdowns present','no error before typing','empty submit explains every field','646546 refused while typing','dose amount and unit checked live','route and schedule other boxes','valid order sends combined values']};
}
window.medicineResult=run().then(r=>{document.getElementById('results').textContent=JSON.stringify(r,null,2);return r;}).catch(e=>{document.getElementById('results').textContent='FAIL '+e.stack;throw e;});
