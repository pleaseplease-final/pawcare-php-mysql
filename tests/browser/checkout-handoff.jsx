// Synthetic checkout handoffs: no provider, database or payment writes.
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import CheckoutInbox from '../../src/roles/CheckoutInbox.jsx';
import DailySales from '../../src/roles/DailySalesPage.jsx';
import {assistant} from '../../src/roles/Assistant.jsx';
import {emptyClinicState} from '../../src/clinicState.js';
import {today} from '../../src/booking.js';
const root=createRoot(document.getElementById('fixture'));
const me={id:'fixture-assistant',role:'assistant',name:'Synthetic assistant'};
const item={catalogId:'srv_deworm',name:'Recorded deworming',price:250,qty:1,source:'performed'};
const visit={id:'fixture-visit',petId:'fixture-pet',date:'2025-01-01',time:'09:00',status:'Completed',billingStatus:'Unpaid',reason:'Deworming',service:'deworming',invoiceItems:[item]};
const base={...emptyClinicState(),pets:[{id:visit.petId,name:'Synthetic patient',ownerId:'fixture-owner'}],owners:[{id:'fixture-owner',name:'Synthetic owner'}],appts:[visit]};
const task={appointmentId:visit.id,petName:'Synthetic patient',ownerName:'Synthetic owner',date:visit.date,time:visit.time,status:'pending'};
let tasks=[],opens=[],reads=0,claims=[],stateUpdate,mountId=0;
const originalFetch=window.fetch;
window.fetch=async(path,options={})=>{
 const url=String(path);let data;
 if(url==='/api/checkout-inbox'){reads++;data={tasks};}
 else if(url.endsWith('/claim')){claims.push(url);data={claimToken:'fixture-local-claim',invoiceItems:[item],prescriptionItems:[],prescription:''};}
 else if(url.endsWith('/release')||url.endsWith('/renew'))data={};
 else if(url.includes('/services/prices'))data={catalog:[{id:item.catalogId,name:item.name,price:item.price,category:'Preventive'}]};
 else if(url.includes('admissions'))data={admissions:[],visits:[],summary:{},total:0};
 else if(url.includes('reminders'))data={calls:[],pending:0};
 else throw Error(`Unexpected fixture request: ${options.method || 'GET'} ${url}`);
 return new Response(JSON.stringify({success:true,data}),{headers:{'Content-Type':'application/json'}});
};
const tick=()=>new Promise(resolve=>setTimeout(resolve,30));
const until=async(fn)=>{for(let i=0;i<160;i++){if(fn())return;await tick();}throw Error('Timed out waiting for checkout');};
const assert=(v,message)=>{if(!v)throw Error(message);};
function Harness({initial,blocked=false,screen='inbox'}){
 const [db,setDb]=useState(initial),[busy,setBusy]=useState(blocked);
 stateUpdate={setDb,setBusy};
 const props={db,setDb,me,say:()=>{},go:()=>{}};
 return screen==='sales'?<DailySales {...props}/>:screen==='desk'?<assistant.Dash {...props}/>:<CheckoutInbox db={db} me={me} blocked={busy} onOpen={t=>{opens.push(t.appointmentId);return true;}}/>;
}
async function mount(initial=base,options={}){
 flushSync(()=>root.render(<Harness key={++mountId} initial={initial} {...options}/>));
 await tick();await tick();
}
async function run(){
 try{
 tasks=[task];await mount();await until(()=>opens.length===1);
 assert(opens[0]===visit.id,'Initial prior-day completion must open without searching');
 flushSync(()=>stateUpdate.setDb({...base}));await tick();assert(opens.length===1,'Rerender must not reopen same checkout');
 opens=[];tasks=[{...task,status:'claimed',claimedBy:'other'}];await mount();await tick();assert(!opens.length,'Claimed transaction must not auto-open');
 opens=[];tasks=[task];await mount({...base,appts:[]});await tick();assert(!opens.length,'Inbox must wait for clinic state hydration');
 flushSync(()=>stateUpdate.setDb(base));await until(()=>opens.length===1);
 opens=[];await mount(base,{blocked:true});assert(!opens.length,'An open form must defer checkout');
 flushSync(()=>stateUpdate.setBusy(false));await until(()=>opens.length===1);
 opens=[];await mount({...base,appts:[{...visit,billingStatus:'Paid'}]});await tick();assert(!opens.length,'Stale paid visit must not auto-open');
 await mount({...base,appts:[{...visit,admissionStatus:'Admitted'}]});await tick();assert(!opens.length,'Admitted visit must wait for discharge');
 // A native dialog also blocks automatic opening until the next poll.
 const dialog=document.createElement('dialog');document.body.append(dialog);dialog.showModal();
 await mount();assert(!opens.length,'Native dialog must remain on screen');dialog.close();dialog.remove();await until(()=>opens.length===1);
 for(const [service,reason] of [['deworming','Deworming'],['vaccination','Vaccination'],['grooming','Grooming'],['checkup','Skin / ear'],['checkup','Digestive concern'],['surgery','Surgical assessment']]){
 claims=[];await mount({...base,appts:[{...visit,service,reason}]},{screen:'sales'});
 await until(()=>claims.length===1 && !!document.querySelector('dialog[open]'));
 assert(document.querySelector('dialog').textContent.includes('Synthetic patient'),'Daily Sales must load patient automatically');
 assert([...document.querySelectorAll('dialog input')].some(input=>input.value.includes(item.name)),'Saved care charges must populate automatically');
 assert(document.querySelector('dialog').textContent.includes('250'),'Invoice must retain saved amount');
 }
 claims=[];await mount(base,{screen:'desk'});await until(()=>claims.length===1 && !!document.querySelector('dialog[open]'));
 assert([...document.querySelectorAll('dialog input')].some(input=>input.value.includes(item.name)),'Front Desk must load the saved invoice');
 return {passed:true,checks:['initial prior-day checkout','no duplicate reopen','claimed visit excluded','state hydration retry','busy form deferred','paid/admitted excluded','native dialog respected','six visit types on Daily Sales','Front Desk saved invoice']};
 }finally{flushSync(()=>root.unmount());window.fetch=originalFetch;}
}
window.checkoutHandoffResult=run().then(result=>{document.getElementById('results').textContent=JSON.stringify(result,null,2);return result;}).catch(error=>{document.getElementById('results').textContent=error.stack;throw error;});
