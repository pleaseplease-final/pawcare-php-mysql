// The owner calendar header must never overlap: month title, previous, Today and next stay readable in the narrow column.
import React from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import '../../src/styles.css';
import '../../src/fonts.css';
import '../../src/roles/owner/owner.css';
import '../../src/roles/owner/owner-modern.css';
import OwnerAppts from '../../src/roles/owner/Appts.jsx';
import OwnerCalendar from '../../src/roles/owner/Calendar.jsx';
import {emptyClinicState} from '../../src/clinicState.js';
import {plus} from '../../src/booking.js';
const root=createRoot(document.getElementById('fixture'));
const frame=(ms=150)=>new Promise(resolve=>setTimeout(resolve,ms));
window.fetch=async()=>new Response(JSON.stringify({success:true,slots:[],catalog:[]}),{headers:{'Content-Type':'application/json'}});
const me={id:'u1',role:'owner',ownerId:'o1',name:'Synthetic owner',email:'o@gmail.com'};
const db={...emptyClinicState(),owners:[{id:'o1',name:'Synthetic owner',phone:'+639171234567'}],
  pets:[{id:'p1',ownerId:'o1',name:'Rekrek',species:'Canine',breed:'Shih Tzu',registrationStatus:'Verified'}],vets:[{id:'v1',name:'Dr. Ana Cruz'}],
  appts:[{id:'a1',petId:'p1',vetId:'v1',date:plus(1),time:'08:30',service:'checkup',reason:'Check-up: Annual check-up',status:'Scheduled',billingStatus:'Unbilled'}],records:[]};
async function run(){
  const which=new URLSearchParams(location.search).get('page')||'appts';
  flushSync(()=>root.render(which==='calendar'?<OwnerCalendar db={db} me={me} go={()=>{}}/>:<OwnerAppts db={db} setDb={()=>{}} me={me} say={()=>{}}/>));
  await frame(400);
  const head=document.querySelector('.ow-calhd'),title=head.querySelector('h2'),buttons=[...head.querySelectorAll('button')];
  const rect=el=>el.getBoundingClientRect();
  const t=rect(title),boxes=buttons.map(rect);
  const overlaps=boxes.filter(b=>!(b.right<=t.left||b.left>=t.right||b.bottom<=t.top||b.top>=t.bottom));
  const clipped=title.scrollWidth>title.clientWidth+1;
  const between=boxes.some((a,i)=>boxes.some((b,j)=>i<j&&!(a.right<=b.left||a.left>=b.right||a.bottom<=b.top||a.top>=b.bottom)));
  const result={page:which,viewport:innerWidth,title:title.textContent,titleWidth:Math.round(t.width),titleClipped:clipped,buttonsOverlappingTitle:overlaps.length,buttonsOverlappingEachOther:between,
    columnWidth:Math.round(rect(document.querySelector('.ow-cal')).width),passed:!clipped&&!overlaps.length&&!between};
  document.getElementById('results').textContent=JSON.stringify(result,null,1);
  return result;
}
window.calendarHeaderResult=run().catch(e=>{document.getElementById('results').textContent='FAIL '+e.stack;throw e;});
