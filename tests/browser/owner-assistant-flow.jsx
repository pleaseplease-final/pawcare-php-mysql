// Synthetic checks: owner service choices and pet limits, assistant past-due visits.
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {ServicePicker} from '../../src/roles/owner/services.jsx';
import {validatePet} from '../../src/roles/owner/Pets.jsx';
import {assistant} from '../../src/roles/Assistant.jsx';
import {emptyClinicState} from '../../src/clinicState.js';
import {today,plus,validateBooking} from '../../src/booking.js';
const root=createRoot(document.getElementById('fixture'));
const frame=()=>new Promise(resolve=>setTimeout(resolve,60));
const assert=(condition,message)=>{if(!condition)throw Error(message);};
const me={id:'fixture-assistant',role:'assistant',name:'Synthetic assistant'};
const patches=[];
window.fetch=async(path,options={})=>{
 const url=String(path);let data;
 if(url.includes('/api/appointments/') && url.endsWith('/status')){const body=JSON.parse(options.body);patches.push({url,body});data={success:true,appointment:{id:url.split('/')[3],petId:'p1',status:body.status,vetId:'v1',date:plus(-3),time:'09:00'}};}
 else if(url==='/api/checkout-inbox')data={tasks:[]};
 else if(url.includes('/services/prices'))data={catalog:[]};
 else if(url.includes('admissions'))data={admissions:[],visits:[],summary:{},total:0};
 else if(url.includes('reminders'))data={calls:[],pending:0};
 else data={};
 return new Response(JSON.stringify({success:true,data,...(data.appointment?{appointment:data.appointment}:{})}),{headers:{'Content-Type':'application/json'}});
};
const base=()=>({...emptyClinicState(),pets:[{id:'p1',name:'Mochi',species:'Canine',ownerId:'o1'}],owners:[{id:'o1',name:'Synthetic owner',phone:'+639171234567'}],vets:[{id:'v1',name:'Dr. Test'}],
 appts:[{id:'late',petId:'p1',vetId:'v1',date:plus(-3),time:'09:00',status:'Scheduled',reason:'Annual check-up',service:'checkup'},
        {id:'today',petId:'p1',vetId:'v1',date:today(),time:'10:00',status:'Scheduled',reason:'Annual check-up',service:'checkup'}]});
function Desk(){const [db,setDb]=useState(base);return <assistant.Dash db={db} setDb={setDb} me={me} say={()=>{}} go={()=>{}}/>;}
const pet={name:'Mochi',species:'Canine (Dog)',other:'',breed:'',sex:'Male',birth:'2022-01-01',weight:'8',neutered:'Yes',color:'',dentalOcclusion:'Not Evaluated Yet',priorVaccines:[],externalClinicNotes:'',notes:''};
async function run(){
 // Owner: surgery / dental is no longer a bookable service, and the vet decides instead.
 flushSync(()=>root.render(<ServicePicker value="" onChange={()=>{}}/>));await frame();
 const labels=[...document.querySelectorAll('.ow-svc b')].map(b=>b.textContent);
 assert(labels.join('|')==='Vaccination|Deworming|Grooming|Check-up',`Owner service choices: ${labels}`);
 assert(document.body.textContent.includes('Vaccines and boosters') && !document.body.textContent.includes('Shots and deworming'),'Vaccination and deworming wording must be distinct');
 const retired=validateBooking({appts:[],busy:[]},[{id:'p1'}],{service:'surgery',petId:'p1',vetId:'v1',date:plus(5),time:'09:00'});
 assert(retired.service && /check-up/i.test(retired.service),'A new surgery booking is refused with guidance');

 // Owner: species-aware pet limits.
 assert(Object.keys(validatePet(pet)).length===0,'A normal dog must validate');
 assert(validatePet({...pet,weight:'150'}).weight,'Dog over 100 kg is flagged');
 assert(validatePet({...pet,species:'Rodent (Hamster / Guinea Pig / etc.)',weight:'5',dentalOcclusion:'Normal'}).weight,'A 5 kg hamster is flagged');
 assert(validatePet({...pet,species:'Feline (Cat)',weight:'22'}).weight,'A 22 kg cat is flagged');
 assert(validatePet({...pet,birth:'1990-01-01'}).birth,'A 1990 dog is flagged');
 assert(!validatePet({...pet,weight:'45'}).weight,'A 45 kg dog is fine');

 // Assistant: earlier-day visits that never arrived must be visible and closable.
 flushSync(()=>root.render(<Desk/>));await frame();await frame();await frame();
 assert(document.body.textContent.includes('never checked in'),'Past-due warning must show on the front desk');
 const review=[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Review past-due visits'));
 assert(review,'Warning offers a way straight to the visits');
 flushSync(()=>review.click());await frame();
 assert(document.body.textContent.includes(plus(-3)) && document.body.textContent.includes('Annual check-up'),'Past-due visit is listed');
 const noShow=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Mark no-show');
 assert(noShow && [...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Rebook'),'Past-due row offers no-show and rebook');
 assert(![...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Check in' && b.closest('.sf-row')?.textContent.includes(plus(-3))),'A past visit cannot be checked in');
 flushSync(()=>noShow.click());await frame();await frame();
 assert(patches.length===1 && patches[0].body.status==='No-show' && patches[0].url.includes('/late/'),'Marking no-show saves the missed status');
 return {passed:true,checks:['owner services without surgery','distinct vaccination wording','retired surgery refused','species weight and age limits','assistant past-due warning','past-due actions','past visit cannot check in','no-show saved']};
}
window.flowResult=run().then(result=>{document.getElementById('results').textContent=JSON.stringify(result,null,2);return result;}).catch(error=>{document.getElementById('results').textContent=error.stack;throw error;});
