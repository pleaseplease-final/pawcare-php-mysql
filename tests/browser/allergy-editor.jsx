// Synthetic check of the allergy editor; the server is replaced by a local fake.
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import '../../src/styles.css';
import '../../src/fonts.css';
import AllergyEditor from '../../src/components/AllergyEditor.jsx';
const root=createRoot(document.getElementById('fixture'));
const frame=(ms=80)=>new Promise(resolve=>setTimeout(resolve,ms));
const assert=(condition,message)=>{if(!condition)throw Error(message);};
const calls=[];let reply=null;
window.fetch=async(path,options={})=>{
 const body=JSON.parse(options.body);calls.push({path:String(path),body});
 if(reply)return new Response(JSON.stringify(reply.body),{status:reply.status,headers:{'Content-Type':'application/json'}});
 return new Response(JSON.stringify({success:true,petId:'p1',allergies:body.allergies}),{headers:{'Content-Type':'application/json'}});
};
let latest;
function Host(){const [db,setDb]=useState({pets:[{id:'p1',name:'Mochi',allergies:['Chicken']}]});latest=db;const pet=db.pets[0];return <AllergyEditor key={pet.allergies.join('|')} pet={pet} setDb={setDb}/>;}
const type=(el,value)=>{flushSync(()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));});};
const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===text||b.getAttribute('aria-label')===text);
async function run(){
 flushSync(()=>root.render(<Host/>));await frame();
 const input=()=>document.querySelector('[name="allergy"]');
 assert(document.body.textContent.includes('Chicken'),'Existing allergies are listed');
 assert(button('Save allergies').disabled,'Nothing to save until something changes');
 type(input(),'chicken');await frame();
 assert(document.getElementById('allergy-error').textContent.includes('already'),'Duplicates are caught as you type');
 assert(button('Add').disabled===false,'Add is available');
 flushSync(()=>button('Add').click());await frame();
 assert(document.querySelectorAll('.allergy-chips li').length===1,'A duplicate is not added');
 type(input(),'1234');await frame();assert(document.getElementById('allergy-error').textContent.includes('name'),'Number-only entries are refused');
 type(input(),'Penicillin');await frame();
 flushSync(()=>button('Add').click());await frame();
 assert(document.body.textContent.includes('Penicillin') && !button('Save allergies').disabled,'Added allergy waits for Save');
 reply={status:409,body:{error:'The allergy list was changed by someone else. Reload the pet and review it.'}};
 flushSync(()=>button('Save allergies').click());await frame(120);
 assert(document.body.textContent.includes('changed by someone else'),'A conflict is explained and the list is kept');
 assert(document.body.textContent.includes('Penicillin'),'Entries survive a failed save');
 reply=null;
 flushSync(()=>button('Save allergies').click());await frame(150);
 const put=calls.at(-1);
 assert(put.path==='/api/pets/p1/allergies' && JSON.stringify(put.body.allergies)==='["Chicken","Penicillin"]' && JSON.stringify(put.body.expected)==='["Chicken"]','The saved list and the list it replaces are both sent');
 assert(JSON.stringify(latest.pets[0].allergies)==='["Chicken","Penicillin"]','The chart updates after the server confirms');
 flushSync(()=>button('Remove Chicken').click());await frame();
 assert(!button('Save allergies').disabled,'Removing is a change too');
 document.getElementById('results').textContent=JSON.stringify({passed:true,checks:['list shown','duplicates','invalid names','add then save','conflict message','request body','chart updated','remove']});
 return true;
}
window.allergyResult=run().catch(e=>{document.getElementById('results').textContent=e.stack;throw e;});
