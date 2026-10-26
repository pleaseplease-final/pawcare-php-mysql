// Visual and behaviour check for the on-screen vaccination card; the server is replaced by a local fake.
import React from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import '../../src/styles.css';
import '../../src/fonts.css';
import '../../src/roles/owner/owner.css';
import '../../src/roles/owner/owner-modern.css';
import '../../src/print-documents.css';
import DigitalVetCard from '../../src/roles/DigitalVetCard.jsx';
import {plus} from '../../src/booking.js';
const root=createRoot(document.getElementById('fixture'));
const frame=(ms=80)=>new Promise(resolve=>setTimeout(resolve,ms));
const assert=(condition,message)=>{if(!condition)throw Error(message);};
const events=[
 {id:'v1',kind:'vaccination',date:plus(-20),vaccine:'Anti-rabies',brand:'Defensor 3',manufacturer:'Zoetis',batch:'LOT-2026-01',serialNumber:'SN-1001',nextDue:plus(345),vetName:'Dr. Ana Cruz'},
 {id:'v2',kind:'vaccination',date:plus(-400),vaccine:'5-in-1',brand:'Vanguard Plus 5',manufacturer:'Zoetis',batch:'LOT-2025-07',serialNumber:'SN-0777',nextDue:plus(-35),vetName:'Dr. Ben Lim'},
 {id:'d1',kind:'deworming',date:plus(-60),vaccine:'Deworming',brand:'Canex',batch:'CX-22',nextDue:plus(12),vetName:'Dr. Ana Cruz'},
 {id:'w1',kind:'weight',date:plus(-20),value:14.2},{id:'w2',kind:'weight',date:plus(-90),value:13.6}];
const history={complete:true,pet:{id:'p1',name:'Mochi',species:'Canine',breed:'Shih Tzu',sex:'Male',birth:'2022-03-14',color:'White and gold',neutered:'Yes',microchipNumber:'985112003456789',microchipDate:'2023-01-10',ownerName:'Cza Ybanez'},owner:{name:'Cza Ybanez',address:'12 Rizal St, Makati City',phone:'+63 917 123 4567',email:'owner@gmail.com'},events};
window.fetch=async path=>new Response(JSON.stringify({success:true,data:{success:true,history,document:{reference:'DVC-1',revision:1,snapshot:history}}}),{headers:{'Content-Type':'application/json'}});
window.showFace=async side=>{if(side==='back'&&!document.querySelector('.vc-flip-card.is-flipped'))document.querySelector('.vet-card-face-controls button').click();await frame(900);};
async function run(){
 flushSync(()=>root.render(<DigitalVetCard petId="p1" appointments={[]} onBook={()=>{}} portrait={<div style={{width:96,height:96,borderRadius:16,background:'#dbe7fb'}}/>}/>));
 await frame(300);
 const summary=document.querySelector('[aria-label="Card summary"]');
 assert(summary,'Summary strip is shown');
 const text=summary.textContent;
 assert(text.includes('Vaccines given2') && text.includes('Deworming1') && text.includes('14.2 kg'),'Summary counts come from the records: '+text);
 assert(summary.querySelector('.is-next').className.includes('is-overdue'),'The overdue booster turns the next-care tile red');
 document.querySelector('.vet-card-face-controls button').click();await frame(900);
 const events=[...document.querySelectorAll('.vet-card-event')];
 assert(events.length>=4,'Records render as cards');
 assert(document.querySelectorAll('.vc-due.is-overdue').length===1 && document.querySelectorAll('.vc-due.is-soon').length===1 && document.querySelectorAll('.vc-due.is-ok').length===1,'Each next-due date gets its own status colour');
 assert(document.querySelector('.vc-section.is-vaccination .vc-count').textContent==='2','Section counts');
 assert(document.querySelector('.vc-sign-line'),'Signature line for the veterinarian');
 if(location.hash!=='#back'){document.querySelector('.vet-card-face-controls button').click();await frame(900);}
 document.getElementById('results').textContent=JSON.stringify({passed:true,checks:['summary tiles','overdue tone','record cards','status colours','section counts','signature line']});
 return true;
}
window.lookResult=run().catch(e=>{document.getElementById('results').textContent=e.stack;throw e;});
