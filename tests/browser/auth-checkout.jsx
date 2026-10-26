// Synthetic HTTP boundaries; no email, database or payment writes.
import React from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import Login from '../../src/pages/Login.jsx';
import {Unlock} from '../../src/pages/Verify.jsx';
import BillingModal from '../../src/roles/BillingModal.jsx';
import {emptyClinicState} from '../../src/clinicState.js';
const root=createRoot(document.getElementById('fixture'));
const assert=(v,m)=>{if(!v)throw Error(m);};
const tick=()=>new Promise(r=>setTimeout(r,30));
async function until(fn){for(let i=0;i<100;i++){if(fn())return;await tick();}throw Error('Timed out');}
let key=0,attempts=0,loginResult=0,unlockCalls=0,payments=[];
const realFetch=window.fetch,realNow=Date.now;
const cooldownKey='pawcare_login_cooldown',oldCooldown=sessionStorage.getItem(cooldownKey);
const clinical={catalogId:'srv_deworm',name:'Recorded deworming',category:'Vaccination & Preventive',price:250,qty:1,source:'performed'};
const shampoo={id:'product_shampoo',name:'Synthetic shampoo',category:'Pet shampoo',price:350};
const accessory={id:'product_bowl',name:'Synthetic bowl',category:'Pet accessories',price:50};
const hidden={id:'srv_dental',name:'Forbidden dental add-on',category:'Dental & Surgery',price:1800};
window.fetch=async(path,options={})=>{
 let data,status=200;const url=String(path),body=options.body?JSON.parse(options.body):{};
 if(url==='/api/auth/login'){
  attempts++;status=attempts===1?401:423;data=attempts===1?{error:'Invalid attempt 1 of 2. Your account will lock after one more incorrect attempt.'}:{error:'Account locked after 2 incorrect attempts. An unlock link has been sent to your email.',unlockRequired:true,retryAfter:60};
 }else if(url==='/api/auth/unlock'){
  assert(options.method==='POST','Unlock must POST the token, not consume via GET');assert(body.token==='synthetic-token','Unlock token must be in body');unlockCalls++;
  data={status:'ok',cooldownUntil:new Date(Date.now()+120000).toISOString(),retryAfter:120};
 }else if(url.endsWith('/claim'))data={claimToken:'fixture-claim',invoiceItems:[clinical],prescriptionItems:[]};
 else if(url.endsWith('/release')||url.endsWith('/renew'))data={};
 else if(url.includes('/services/prices'))data={catalog:[shampoo,accessory,hidden,{id:'product_vitamins',name:'Forbidden vitamin add-on',category:'Pet vitamins',price:250}]};
 else if(url.endsWith('/billing')){payments.push(body);throw Error('Fixture does not commit payments');}
 else throw Error(`Unexpected request ${url}`);
 return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
};
async function mount(element){flushSync(()=>root.render(React.cloneElement(element,{key:++key})));await tick();}
async function edit(selector,value){const control=document.querySelector(selector);assert(control,`Missing ${selector}`);const proto=control instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype;
 flushSync(()=>{Object.getOwnPropertyDescriptor(proto,'value').set.call(control,value);control.dispatchEvent(new Event('input',{bubbles:true}));});
 if(control instanceof HTMLSelectElement)flushSync(()=>control.dispatchEvent(new Event('change',{bubbles:true})));await tick();}
async function submit(){flushSync(()=>document.querySelector('form').requestSubmit());await tick();}
async function run(){try{
 sessionStorage.removeItem(cooldownKey);
 const login=<Login role="owner" onLogin={()=>loginResult++} go={()=>{}} onBack={()=>{}}/>;
 await mount(login);await edit('#login-email','synthetic@example.invalid');await edit('#login-password','WrongPassword!');await submit();
 await until(()=>document.body.textContent.includes('one more incorrect'));assert(attempts===1,'First wrong attempt must show warning');
 await submit();await until(()=>document.body.textContent.includes('unlock link has been sent'));assert(attempts===2,'Second failure must lock');
 assert(document.querySelector('.login-submit').disabled,'Repeated submissions must wait for unlock email retry cooldown');
 await mount(<Unlock token="synthetic-token" onDone={()=>{}}/>);await until(()=>unlockCalls===1 && !!sessionStorage.getItem(cooldownKey));
 await mount(login);assert(document.body.textContent.includes('2:00'),'Unlock returns to login with full countdown');assert(document.querySelector('.login-submit').disabled,'Cooldown must disable login');
 await mount(login);assert(document.querySelector('.login-submit').disabled,'Reload/remount must keep countdown');
 Date.now=()=>realNow()+121000;window.dispatchEvent(new Event('focus'));await tick();
 assert(!document.querySelector('.login-submit').disabled,'Login enables after deadline');assert(loginResult===0,'Unlock must never sign in');Date.now=realNow;
 sessionStorage.removeItem(cooldownKey);
 const appt={id:'fixture-visit',petId:'fixture-pet',date:'2026-10-26',time:'09:00',status:'Completed',billingStatus:'Unpaid',reason:'Deworming',invoiceItems:[clinical]};
 const db={...emptyClinicState(),pets:[{id:appt.petId,name:'Synthetic patient',ownerId:'fixture-owner'}],owners:[{id:'fixture-owner',name:'Synthetic owner'}],appts:[appt]};
 await mount(<BillingModal appt={appt} db={db} me={{id:'fixture-assistant',role:'assistant',name:'Synthetic assistant'}} setDb={()=>{}} onClose={()=>{}}/>);
 await until(()=>!![...document.querySelectorAll('button')].find(b=>b.textContent.includes(shampoo.name)) && !document.querySelector('fieldset').disabled);
 assert(!document.querySelector('#billing-discount'),'Discount entry must be removed');
 assert(!document.body.textContent.includes(hidden.name) && !document.body.textContent.includes('Forbidden vitamin'),'Only retail shampoo/accessories may appear as add-ons');
 flushSync(()=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes(shampoo.name)).click());await tick();
 const qty='input[aria-label="Quantity"]';await edit(qty,'1.5');await submit();assert(document.querySelector(qty).getAttribute('aria-invalid')==='true','Fractional quantities must fail inline');
 await edit(qty,'2');await edit('#billing-cash','100');await submit();assert(document.querySelector('#billing-cash').getAttribute('aria-invalid')==='true','Insufficient cash must fail inline');
 await edit('#billing-cash','1000');await submit();await until(()=>!!document.querySelector('.submission-review[open]'));
 const review=document.querySelector('.submission-review');assert(review.textContent.includes('950') && review.textContent.includes('50'),'Review calculates full price and change without discounts');assert(!review.textContent.includes('Discount'),'Review must omit discount');
 assert(payments.length===0,'No payment before confirmation');
 flushSync(()=>[...review.querySelectorAll('button')].find(b=>b.textContent==='Back to edit').click());await tick();
 const method='select';await edit(method,'GCash');await edit('input[name="refNo"]','a');await submit();assert(document.querySelector('input[name="refNo"]').getAttribute('aria-invalid')==='true','Short reference must fail inline');
 await edit('input[name="refNo"]','TEST-1234');await submit();await until(()=>!!document.querySelector('.submission-review[open]'));
 return {passed:true,checks:['first-attempt warning','second-attempt lock email feedback','POST unlock','persistent login countdown','cooldown expiry','retail-only add-ons','no discount','quantity/cash/reference validation','automatic full-price total/change','payment requires confirmation']};
}finally{flushSync(()=>root.unmount());window.fetch=realFetch;Date.now=realNow;if(oldCooldown===null)sessionStorage.removeItem(cooldownKey);else sessionStorage.setItem(cooldownKey,oldCooldown);}}
window.authCheckoutResult=run().then(r=>{document.getElementById('results').textContent=JSON.stringify(r,null,2);return r;}).catch(e=>{document.getElementById('results').textContent=e.stack;throw e;});
