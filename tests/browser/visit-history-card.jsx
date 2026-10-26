// Synthetic check that Visit History and the vaccination card describe the same visit.
import React from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import '../../src/styles.css';
import '../../src/fonts.css';
import '../../src/roles/owner/owner.css';
import '../../src/roles/owner/owner-modern.css';
import {OwnerVisits} from '../../src/roles/owner/Visits.jsx';
import {pick} from '../../src/roles/owner/ui.jsx';
import {emptyClinicState} from '../../src/clinicState.js';
import {today,plus} from '../../src/booking.js';
const root=createRoot(document.getElementById('fixture'));
const frame=(ms=80)=>new Promise(resolve=>setTimeout(resolve,ms));
const assert=(condition,message)=>{if(!condition)throw Error(message);};
const me={id:'u1',role:'owner',ownerId:'o1',name:'Synthetic owner'};
const day=plus(-3);
const db={...emptyClinicState(),owners:[{id:'o1',name:'Synthetic owner'}],pets:[{id:'p1',ownerId:'o1',name:'Mochi',species:'Canine'}],vets:[{id:'v1',name:'Dr. Ana Cruz'}],
 appts:[{id:'a1',petId:'p1',vetId:'v1',date:day,time:'09:00',status:'Completed',billingStatus:'Paid',service:'vaccination',reason:'Vaccination: Anti-rabies'},
        {id:'a2',petId:'p1',vetId:'v1',date:plus(-40),time:'10:00',status:'Completed',billingStatus:'Paid',service:'checkup',reason:'Skin or ear problem'},
        {id:'a3',petId:'p1',vetId:'v1',date:plus(-80),time:'10:00',status:'Completed',billingStatus:'Paid',service:'grooming',reason:'Grooming – Routine grooming'}],
 records:[{id:'r1',petId:'p1',vetId:'v1',apptId:'a1',date:day,diagnosis:'Veterinarian confirmed suitability for vaccination.',treatment:'Anti-rabies administered.',prescription:'',careStatus:'Routine care'},
          {id:'r2',petId:'p1',vetId:'v1',apptId:'a2',date:plus(-40),diagnosis:'Otitis externa',treatment:'Ear cleaned.',prescription:'',careStatus:'Routine care'},
          {id:'r3',petId:'p1',vetId:'v1',apptId:'a3',date:plus(-80),diagnosis:'Veterinarian confirmed suitability for grooming.',treatment:'Grooming provided.',prescription:'',careStatus:'Routine care'}],
 vacc:[{id:'d1',petId:'p1',apptId:'a1',consultationId:'r1',vaccine:'Anti-rabies',brand:'Defensor 3',batch:'LOT-9',date:day,nextDue:plus(362),done:true,vetId:'v1'}]};
let went=null;
const select=(el,value)=>{flushSync(()=>{Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event('change',{bubbles:true}));});};
async function run(){
 flushSync(()=>root.render(<OwnerVisits db={db} me={me} go={page=>{went=page;}}/>));await frame(200);
 const rows=[...document.querySelectorAll('tbody tr')];
 assert(rows.length===3,'All three visits are listed');
 const cell=(row,label)=>row.querySelector(`td[data-label="${label}"]`).textContent;
 const byDate=Object.fromEntries(rows.map(r=>[cell(r,'Date'),r]));
 const vaccRow=rows.find(r=>cell(r,'Visit').includes('Vaccination'));
 assert(vaccRow && cell(vaccRow,'Diagnosis').includes('Anti-rabies given'),'A vaccination visit says what was given, not a generic sentence: '+cell(vaccRow,'Diagnosis'));
 assert(!cell(vaccRow,'Diagnosis').includes('confirmed suitability'),'The confirmation boilerplate is hidden');
 assert(rows.some(r=>cell(r,'Visit').includes('Grooming') && cell(r,'Diagnosis').includes('Grooming visit')),'Grooming visits are labelled');
 assert(rows.some(r=>cell(r,'Visit').includes('Check-up') && cell(r,'Diagnosis').includes('Otitis externa')),'Check-ups keep their diagnosis');
 select(document.getElementById('vh-type'),'vaccination');await frame();
 assert(document.querySelectorAll('tbody tr').length===1,'The visit-type filter narrows the list');
 select(document.getElementById('vh-type'),'');await frame();
 vaccRow.click();await frame(150);
 const dialog=document.querySelector('dialog[open], .modal, [role="dialog"]');
 assert(dialog && dialog.textContent.includes('Recorded on the vaccination card') && dialog.textContent.includes('Defensor 3') && dialog.textContent.includes('Lot LOT-9'),'The visit shows the dose that went on the card');
 const open=[...dialog.querySelectorAll('button')].find(b=>b.textContent.includes('vaccination card'));
 assert(open,'The visit links to the card');
 flushSync(()=>open.click());
 assert(went==='vacc' && pick.petId==='p1','The link opens the right pet’s card');
 document.getElementById('results').textContent=JSON.stringify({passed:true,checks:['visit types','plain-words headline','filter by type','dose shown on the visit','link to the card']});
 return true;
}
window.historyCardResult=run().catch(e=>{document.getElementById('results').textContent=e.stack;throw e;});
