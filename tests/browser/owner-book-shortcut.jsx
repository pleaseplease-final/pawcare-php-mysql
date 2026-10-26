// The "Book" shortcuts on a pet must open the booking form already filled in, never an error page.
import React,{Component} from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import '../../src/styles.css';
import '../../src/fonts.css';
import '../../src/roles/owner/owner.css';
import '../../src/roles/owner/owner-modern.css';
import OwnerAppts from '../../src/roles/owner/Appts.jsx';
import {setPrefill} from '../../src/roles/owner/ui.jsx';
import {vaccinationBooking} from '../../src/ownerVaccination.js';
import {ownerFollowUpBooking} from '../../src/ownerCare.js';
import {emptyClinicState} from '../../src/clinicState.js';
import {plus} from '../../src/booking.js';
const root=createRoot(document.getElementById('fixture'));
const frame=(ms=120)=>new Promise(resolve=>setTimeout(resolve,ms));
const assert=(condition,message)=>{if(!condition)throw Error(message);};
class Catch extends Component{state={error:null};static getDerivedStateFromError(error){return {error};}render(){return this.state.error?<pre id="caught">{this.state.error.stack}</pre>:this.props.children;}}
window.fetch=async path=>{
 const url=String(path);
 const data=url.includes('availability')?{slots:['09:00','10:00']}:url.includes('prices')?{catalog:[]}:{};
 return new Response(JSON.stringify({success:true,data,...data}),{headers:{'Content-Type':'application/json'}});
};
const me={id:'u1',role:'owner',ownerId:'o1',name:'Synthetic owner',email:'o@gmail.com'};
const db=()=>({...emptyClinicState(),owners:[{id:'o1',name:'Synthetic owner',phone:'+639171234567'}],pets:[{id:'p1',ownerId:'o1',name:'Mochi',species:'Canine',breed:'Shih Tzu',registrationStatus:'Verified'}],vets:[{id:'v1',name:'Dr. Ana Cruz'},{id:'v2',name:'Dr. Ben Lim'}],appts:[],records:[]});
const cases={
 'next deworming':vaccinationBooking({petId:'p1',vaccine:'Deworming',nextDue:plus(12)}),
 'next vaccination':vaccinationBooking({petId:'p1',vaccine:'Anti-rabies',nextDue:plus(40)}),
 'overdue vaccination':vaccinationBooking({petId:'p1',vaccine:'5-in-1',nextDue:plus(-30)}),
 'reason only (older shortcut)':{petId:'p1',reason:'Deworming'},
 'vaccination reason only':{petId:'p1',reason:'Vaccination'},
 'follow-up':ownerFollowUpBooking({id:'r1',petId:'p1',followUpDate:plus(7)}),
 'pet only':{petId:'p1'},
 'calendar day':{petId:'p1',reason:'',date:plus(5)},
 'a click event passed as the pet (the old Book a visit bug)':(()=>{const event={type:'click'};event.target=event;event.view={document:{event}};return {petId:event,reason:undefined};})(),
 'retired surgery shortcut':{petId:'p1',service:'surgery',reason:'Surgery – Surgical assessment'},
};
async function run(){
 const report={};
 for(const [name,prefill] of Object.entries(cases)){
  setPrefill(prefill);
  flushSync(()=>root.render(<Catch key={name}><OwnerAppts db={db()} setDb={()=>{}} me={me} say={()=>{}}/></Catch>));
  await frame(250);
  const caught=document.getElementById('caught');
  assert(!caught,`${name}: ${caught?.textContent.split('\n').slice(0,3).join(' | ')}`);
  const form=document.querySelector('.ow-book-form');
  if(name.startsWith('a click event')){assert(!form && document.body.textContent.includes('Book'),`${name}: should fall back to the normal appointments page`);report[name]=['appointments page, no crash'];flushSync(()=>root.render(<div/>));await frame(40);continue;}
  assert(form,`${name}: the booking form did not open`);
  report[name]=[document.querySelector('.ow-svc.on b')?.textContent||'no service chosen',document.querySelector('[name="petId"]')?.value||document.querySelector('#petId')?.value||''];
  flushSync(()=>root.render(<div/>));await frame(40);
 }
 document.getElementById('results').textContent=JSON.stringify({passed:true,report},null,1);
 return true;
}
window.shortcutResult=run().catch(e=>{document.getElementById('results').textContent='FAIL '+e.message;throw e;});
