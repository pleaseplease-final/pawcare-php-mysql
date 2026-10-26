// Synthetic card and admission reads. No booking, payment or provider writes.
import React from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {owner} from '../../src/roles/Owner.jsx';
import {OwnerVacc} from '../../src/roles/owner/VaccCard.jsx';
import {emptyClinicState} from '../../src/clinicState.js';
import {prefill} from '../../src/roles/owner/ui.jsx';
import {today} from '../../src/booking.js';
import {boosterDate} from '../../src/clinicalWorkflow.js';
const root=createRoot(document.getElementById('fixture'));
const me={id:'owner',ownerId:'owner',role:'owner',name:'Synthetic Owner'};
const day=today(),nextWorm=boosterDate(day,31),nextVaccine=boosterDate(day,60);
const pet={id:'pet',name:'Synthetic patient',ownerId:me.ownerId,species:'Canine',breed:'Aspin',sex:'Female',weight:3,birth:'2026-01-01'};
const events=[{id:'worm',kind:'deworming',vaccine:'Deworming',date:day,nextDue:nextWorm,brand:'Synthetic dewormer',vetName:'Synthetic veterinarian'},{id:'rabies',kind:'vaccination',vaccine:'Anti-rabies',date:day,nextDue:nextVaccine,brand:'Synthetic vaccine',vetName:'Synthetic veterinarian'}];
const history={pet,owner:{name:me.name},complete:true,events};
const paid={id:'payment',petId:pet.id,date:day,time:'09:00',reason:'Recent deworming',status:'Completed',billingStatus:'Paid',amount:250,paidAt:`${day}T01:00:00Z`,paymentMethod:'Cash',paymentReference:'SYNTHETIC-RECEIPT',invoiceItems:[{name:'Recorded deworming',price:250,qty:1}]};
const held={id:'awaiting',petId:pet.id,date:day,time:'08:00',reason:'Recent wellness',status:'Completed',billingStatus:'Unpaid',amount:9999,invoiceItems:[]};
const booked={id:'booking',petId:pet.id,date:boosterDate(nextWorm,1),time:'09:00',reason:'Deworming Follow-up',service:'deworming',status:'Scheduled'};
const db={...emptyClinicState(),pets:[pet,{id:'foreign-pet',ownerId:'other',name:'PRIVATE-FOREIGN-PET'}],owners:[{id:me.ownerId,name:me.name}],vacc:events.map(e=>({...e,petId:pet.id,done:true,vetId:'vet'})),appts:[paid,held,{...paid,id:'foreign-payment',petId:'foreign-pet',reason:'PRIVATE-FOREIGN-PAYMENT'},booked]};
const realFetch=window.fetch,oldPrefill=prefill.data;
let nav=[],key=0,cardReads=0;
window.fetch=async(path,options={})=>{
 if(options.method && options.method!=='GET')throw Error('Fixture blocks writes');
 let data;const url=String(path);
 if(url==='/api/admissions')data={admissions:[],total:0};
 else if(url===`/api/pets/${pet.id}/vet-card`){cardReads++;data={history,document:{snapshot:history}};}
 else throw Error(`Unexpected fixture read: ${url}`);
 return new Response(JSON.stringify({success:true,...data}),{headers:{'Content-Type':'application/json'}});
};
const tick=()=>new Promise(r=>setTimeout(r,30));
const assert=(v,m)=>{if(!v)throw Error(m);};
async function until(fn){for(let i=0;i<100;i++){if(fn())return;await tick();}throw Error('Timed out');}
async function mount(element){flushSync(()=>root.render(React.cloneElement(element,{key:++key})));await tick();}
const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===text);
async function click(control){assert(control,'Missing action');flushSync(()=>control.click());await tick();}
async function run(){try{
 const props={db,setDb:()=>{},me,go:p=>nav.push(p),say:()=>{}};
 await mount(<owner.Dash {...props}/>);
 const recent=document.querySelector('[aria-label="Recent transactions"]');assert(recent,'My Pets must show transactions without navigating');
 assert(recent.textContent.includes('250.00') && recent.textContent.includes('Recent deworming'),'Actual saved payment must appear');
 assert(!recent.textContent.includes('9,999') && !recent.textContent.includes('PRIVATE-FOREIGN'),'Unbilled placeholder amounts and foreign records must not appear');
 assert(document.body.textContent.includes('Next preventive care') && !document.body.textContent.includes('Next vaccine'),'Deworming is not labelled a vaccine');
 await click([...recent.querySelectorAll('button')].find(b=>b.textContent==='View payment'));
 await until(()=>!!document.querySelector('dialog[open]'));
 assert(document.querySelector('dialog').textContent.includes('SYNTHETIC-RECEIPT'),'Recent transaction opens saved receipt details');
 await click([...document.querySelectorAll('dialog button')].find(b=>b.textContent==='Close'));assert(!document.querySelector('dialog[open]'),'Receipt details can close');
 await click(button('View all bills & payments'));assert(nav.at(-1)==='bills','Open complete bills page');
 await mount(<OwnerVacc {...props}/>);await until(()=>cardReads>0 && !!document.querySelector('.vet-card-next-care'));
 const next=document.querySelector('.vet-card-next-care');
 for(const value of ['Next deworming','Next vaccination',nextWorm,nextVaccine,booked.date,'Scheduled'])assert(next.textContent.includes(value),`Next care missing ${value}`);
 assert(!button('Book deworming') && !!button('Book vaccination'),'Avoid offering duplicate deworming booking');
 await click(button('Book vaccination'));assert(nav.at(-1)==='appts','Care action opens appointment page');assert(prefill.data.petId===pet.id && prefill.data.service==='vaccination' && prefill.data.date===nextVaccine,'Booking prefilled from exact saved due date');
 await click([...document.querySelectorAll('button')].find(b=>b.textContent.includes('Flip to vaccination records')));
 const search=document.querySelector('input[type="search"]');
 flushSync(()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(search,'NO-MATCH');search.dispatchEvent(new Event('input',{bubbles:true}));});await tick();
 assert(document.querySelector('.vet-card-next-care').textContent.includes(nextWorm),'History search must not hide next due summary');
 await mount(<OwnerVacc {...props} db={{...db,appts:[paid,held]}}/>);await until(()=>!!button('Book deworming'));await click(button('Book deworming'));
 assert(prefill.data.service==='deworming' && prefill.data.date===nextWorm && prefill.data.vaccineDueDate===nextWorm,'Deworming uses its own approved due date');
 return {passed:true,checks:['My Pets recent saved transactions','owner scoping/no booking amount','receipt details and Close','full billing navigation','correct preventive-care labels','both next due dates','separate matching booking','no duplicate booking action','vaccination/deworming prefills','summary survives history filtering']};
}finally{flushSync(()=>root.unmount());window.fetch=realFetch;prefill.data=oldPrefill;}}
window.ownerCareResult=run().then(result=>{document.getElementById('results').textContent=JSON.stringify(result,null,2);return result;}).catch(error=>{document.getElementById('results').textContent=error.stack;throw error;});
