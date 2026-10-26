import React from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {ClinicHistory,HistoryControls} from '../../src/ClinicHistory.jsx';
import Reports from '../../src/roles/ReportsPage.jsx';
import {OwnerVacc} from '../../src/roles/owner/VaccCard.jsx';
import {prefill} from '../../src/roles/owner/ui.jsx';
const root=createRoot(document.getElementById('fixture'));
const sleep=()=>new Promise(r=>setTimeout(r,80));
const assert=(v,message)=>{if(!v)throw Error(message);};
const originalFetch=window.fetch;
let requests=0,fail=true;
const db={pets:[{id:'p',ownerId:'o',name:'Synthetic pet'}],owners:[{id:'o',userId:'u'}],appts:[{id:'a',petId:'p',status:'Scheduled',reason:'=1+1',date:'2026-10-26'}],vacc:[],records:[],vets:[]};
const me={id:'u',ownerId:'o',role:'owner',name:'Synthetic owner'};
window.fetch=async(path,...args)=>{
 if(String(path).startsWith('/api/state/history')){requests++;return new Response(JSON.stringify(fail?{success:false,error:'Synthetic history failure'}:{data:{appts:[],vaccs:[],consults:[],page:{hasMore:false}}}),{status:fail?503:200,headers:{'Content-Type':'application/json'}});}
 if(String(path).includes('/vet-card'))return new Response(JSON.stringify({data:{events:[],pet:db.pets[0],owner:db.owners[0]}}),{headers:{'Content-Type':'application/json'}});
 return originalFetch(path,...args);
};
const show=(value=db)=>flushSync(()=>root.render(<ClinicHistory db={value} me={me}>{merged=><><HistoryControls auto/><output id="complete">{String(merged.historyComplete)}</output><Reports db={merged} me={me}/></>}</ClinicHistory>));
async function run(){
 show();await sleep();await sleep();
 assert(requests===1,'Failed history must stop auto retrying');
 assert(document.getElementById('complete').textContent==='false','Failed history must block completeness');
 assert([...document.querySelectorAll('button')].find(b=>b.textContent.includes('Export CSV')).disabled,'Partial report export must be disabled');
 fail=false;document.querySelector('.clinic-data-error button').click();await sleep();
 assert(requests===2 && document.getElementById('complete').textContent==='true','Manual retry must restore completed history');
 const exportButton=[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Export CSV'));
 let exported;
 const create=URL.createObjectURL,revoke=URL.revokeObjectURL,click=HTMLAnchorElement.prototype.click;
 URL.createObjectURL=blob=>{exported=blob;return 'blob:synthetic';};URL.revokeObjectURL=()=>{};HTMLAnchorElement.prototype.click=()=>{};
 try { exportButton.click();assert((await exported.text()).includes("'=1+1"),'CSV must escape spreadsheet formulas'); }
 finally {URL.createObjectURL=create;URL.revokeObjectURL=revoke;HTMLAnchorElement.prototype.click=click;}
 const dates=[...document.querySelectorAll('input[type=date]')];
 flushSync(()=>{for(const [i,value] of ['2026-10-27','2026-10-26'].entries()){Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(dates[i],value);dates[i].dispatchEvent(new Event('input',{bubbles:true}));}});
 assert(exportButton.disabled && document.body.textContent.includes('cannot be after'),'Invalid report date range must block export with inline feedback');
 [...document.querySelectorAll('button')].find(b=>b.textContent==='Last 7D').click();await sleep();
 assert((Date.parse(dates[1].value)-Date.parse(dates[0].value))/86400000===6,'Last seven days includes today');
 fail=true;show({...db,appts:[{...db.appts[0],status:'Completed'}]});await sleep();await sleep();
 assert(requests===3,'Same-size record update must refresh once and stop on error');
 assert(document.getElementById('complete').textContent==='false','Stale failed refresh must block export');
 let destination='';
 flushSync(()=>root.render(<OwnerVacc db={{...db,pets:[...db.pets,{id:'second',ownerId:'o',name:'Second pet'}]}} me={me} setDb={()=>{}} say={()=>{}} go={page=>destination=page}/>));await sleep();
 const select=document.getElementById('card-pet');
 flushSync(()=>{Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,'second');select.dispatchEvent(new Event('change',{bubbles:true}));});
 [...document.querySelectorAll('button')].find(b=>b.textContent==='Book a visit').click();
 assert(destination==='appts' && prefill.data.petId==='second','Card booking must retain selected pet');
 document.getElementById('results').textContent='PASS: failed history stops; retry succeeds; same-size updates invalidate history; stale exports blocked; selected pet carried into booking; CSV escaped; invalid dates blocked; seven-day preset correct.';
}
run().catch(e=>{document.getElementById('results').textContent='FAIL: '+e.message;}).finally(()=>{window.fetch=originalFetch;});
