// Synthetic checks for the admin price list; the server is replaced by a local fake.
import React from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import CatalogPage from '../../src/roles/CatalogPage.jsx';
const root=createRoot(document.getElementById('fixture'));
const frame=(ms=60)=>new Promise(resolve=>setTimeout(resolve,ms));
const assert=(condition,message)=>{if(!condition)throw Error(message);};
const item=(id,name,category,price,extra={})=>({id,name,category,price,unit:'item / package',description:'',active:true,builtIn:true,kind:id.startsWith('srv_')?'service':'product',requiresPrescription:false,revision:0,updatedBy:'',...extra});
let items=[item('srv_consult','Routine General Consultation & Exam','Consultation & Exam',500),item('product_probiotic','Veterinary Probiotic Paste','Pet vitamins',750),item('product_custom','Joint chews','Pet vitamins',300,{builtIn:false})];
const calls=[];let putReply=null;
window.fetch=async(path,options={})=>{
 const url=String(path),method=options.method||'GET',body=options.body?JSON.parse(options.body):null;calls.push({method,url,body});
 const reply=(data,status=200)=>new Response(JSON.stringify(status<400?{success:true,...data}:data),{status,headers:{'Content-Type':'application/json'}});
 if(method==='GET')return reply({items});
 if(method==='POST'){const created=item('product_'+body.name.toLowerCase().replace(/\W+/g,'_'),body.name,body.category,Number(body.price),{builtIn:false,unit:body.unit,description:body.description});items=[...items,created];return reply({item:created},201);}
 if(method==='PUT'){
  if(putReply)return reply(putReply.body,putReply.status);
  const id=url.split('/').pop(),current=items.find(i=>i.id===id);const next={...current,price:Number(body.price),active:body.active,unit:body.unit,description:body.description,revision:current.revision+1};items=items.map(i=>i.id===id?next:i);return reply({item:next});
 }
 return reply({error:'unexpected'},500);
};
const set=(el,value)=>{const proto=el instanceof HTMLSelectElement?HTMLSelectElement.prototype:el instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;flushSync(()=>{Object.getOwnPropertyDescriptor(proto,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));if(el instanceof HTMLSelectElement)el.dispatchEvent(new Event('change',{bubbles:true}));});};
const blur=el=>flushSync(()=>el.dispatchEvent(new FocusEvent('focusout',{bubbles:true})));
const button=(text,scope=document)=>[...scope.querySelectorAll('button')].find(b=>b.textContent.trim()===text||b.getAttribute('aria-label')===text);
const dialog=()=>document.querySelector('dialog[open]');
const rows=()=>document.querySelectorAll('tbody tr').length;
async function run(){
 flushSync(()=>root.render(<CatalogPage/>));await frame(200);
 assert(document.body.textContent.includes('Services & products price list'),'Page title');
 assert(rows()===3,'All three items listed');
 const summary=document.querySelector('[aria-label="Price list summary"]').textContent;
 assert(summary.includes('Active items3') && summary.includes('Services1') && summary.includes('Products2') && summary.includes('Added by admin1'),'Summary figures come from the list: '+summary);
 set(document.querySelector('[aria-label="Search the price list"]'),'joint');await frame();
 assert(rows()===1,'Search narrows the list');
 set(document.querySelector('[aria-label="Search the price list"]'),'');set(document.querySelector('[aria-label="Filter by type"]'),'service');await frame();
 assert(rows()===1,'Type filter');
 assert(button('Routine General Consultation & Exam cannot be retired').disabled,'Clinical services cannot be retired');
 set(document.querySelector('[aria-label="Filter by type"]'),'');await frame();
 button('Add item').click();await frame();
 let form=dialog();assert(form,'Add form opens');
 flushSync(()=>form.querySelector('form').requestSubmit());await frame();
 for(const key of ['name','category','price'])assert(form.querySelector(`[name="${key}"]`).getAttribute('aria-invalid')==='true',`${key} required`);
 set(form.querySelector('[name="name"]'),'joint CHEWS');blur(form.querySelector('[name="name"]'));await frame();
 assert(form.querySelector('#catalog-name-error').textContent.includes('already exists'),'Duplicate name is caught as you type');
 set(form.querySelector('[name="name"]'),'Skin spray');set(form.querySelector('[name="category"]'),'Pet medicine');await frame();
 assert(form.textContent.includes('needs a veterinarian'),'Prescription categories explain themselves');
 set(form.querySelector('[name="price"]'),'12.345');blur(form.querySelector('[name="price"]'));await frame();
 assert(form.querySelector('[name="price"]').getAttribute('aria-invalid')==='true','Three decimals refused');
 set(form.querySelector('[name="price"]'),'0');await frame();assert(form.querySelector('#catalog-price-error').textContent.includes('more than'),'Zero refused');
 const before=calls.length;flushSync(()=>form.querySelector('form').requestSubmit());await frame();assert(calls.length===before,'Invalid form is never sent');
 set(form.querySelector('[name="price"]'),'180.5');await frame();
 flushSync(()=>form.querySelector('form').requestSubmit());await frame(150);
 const post=calls.find(c=>c.method==='POST');assert(post && post.body.name==='Skin spray' && post.body.price==='180.5' && post.body.category==='Pet medicine','Valid item is sent');
 assert(!dialog() && rows()===4 && document.body.textContent.includes('Skin spray added'),'Saved item appears with a confirmation');
 button('Edit Joint chews').click();await frame();form=dialog();
 assert(form.querySelector('[name="name"]').readOnly,'Name is fixed when editing');
 set(form.querySelector('[name="price"]'),'320');await frame();flushSync(()=>form.querySelector('form').requestSubmit());await frame(150);
 const put=calls.find(c=>c.method==='PUT');assert(put && put.url.endsWith('/product_custom') && put.body.price==='320' && put.body.active===true && put.body.revision===0,'Edit sends revision and keeps status');
 assert(document.body.textContent.includes('₱320.00'),'New price shown');
 putReply={status:409,body:{error:'Another administrator changed this item. Refresh the price list and review it.'}};
 button('Edit Joint chews').click();await frame();form=dialog();set(form.querySelector('[name="price"]'),'330');await frame();flushSync(()=>form.querySelector('form').requestSubmit());await frame(150);
 assert(dialog() && dialog().textContent.includes('Another administrator changed'),'Conflict keeps the form open with the reason');
 putReply=null;button('Cancel',dialog()).click();await frame();
 button('Retire Veterinary Probiotic Paste').click();await frame();
 assert(dialog().textContent.includes('no longer appear for sale'),'Retire explains the effect');
 button('Retire item',dialog()).click();await frame(150);
 assert(rows()===3,'Retired item leaves the active list');
 set(document.querySelector('[aria-label="Filter by status"]'),'retired');await frame();
 assert(rows()===1 && document.body.textContent.includes('Retired'),'Retired filter shows it');
 button('Restore Veterinary Probiotic Paste').click();await frame();button('Restore item',dialog()).click();await frame(150);
 set(document.querySelector('[aria-label="Filter by status"]'),'active');await frame();
 assert(rows()===4,'Restored item is back');
 assert(button('Export CSV') && !button('Export CSV').disabled,'Export is available');
 return {passed:true,checks:['summary from data','search and filters','services cannot be retired','required fields','duplicate name','price format','invalid form not sent','add item','edit with revision','conflict message','retire and restore','export button']};
}
window.catalogResult=run().then(r=>{document.getElementById('results').textContent=JSON.stringify(r,null,2);return r;}).catch(e=>{document.getElementById('results').textContent=e.stack;throw e;});
