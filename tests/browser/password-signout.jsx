// Changing the password ends every session. The form announces the sign-out, and the app answers by showing
// the Log in page with a clear notice. The server is replaced by a local fake.
import React from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {PasswordBody} from '../../src/roles/owner/Profile.jsx';
import App from '../../src/App.jsx';
const MESSAGE='Password changed. Please log in with your new password.';
const root=createRoot(document.getElementById('fixture'));
const tick=(ms=40)=>new Promise(resolve=>setTimeout(resolve,ms));
const assert=(condition,message)=>{if(!condition)throw Error(message);};
async function until(check,what){for(let i=0;i<100;i++){if(check())return;await tick(50);}throw Error('Timed out waiting for '+what);}
const calls=[];let appMode=false;
window.fetch=async(path,options={})=>{
 const url=String(path),method=options.method||'GET',body=options.body?JSON.parse(options.body):{};calls.push({method,url,body});
 const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
 if(url==='/api/auth/password/check')return reply({valid:true});
 if(url==='/api/auth/password')return reply({status:'ok',signedOut:true});
 if(url==='/api/auth/me')return reply({error:'Not signed in.'},401);
 if(url==='/api/auth/logout')return reply({status:'ok'},appMode?401:200);   // the server already ended the session
 return reply({});
};
async function edit(selector,value){
 const control=document.querySelector(selector);assert(control,`Missing ${selector}`);
 flushSync(()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(control,value);control.dispatchEvent(new Event('input',{bubbles:true}));});
 await tick();
}
async function run(){
 // 1. The form: a successful change announces the sign-out and cannot be submitted twice.
 const me={id:'u1',role:'owner',name:'Synthetic owner',email:'owner.person@gmail.com'};
 const heard=[];const listen=event=>heard.push(event.detail?.message);window.addEventListener('pawcare:signed-out',listen);
 flushSync(()=>root.render(<PasswordBody me={me} say={()=>{}} onFormState={()=>{}}/>));await tick(120);
 await edit('#pcur','Old#Password2025');
 flushSync(()=>document.querySelector('#pcur').dispatchEvent(new FocusEvent('focusout',{bubbles:true})));await tick(80);
 await edit('#pnext','Brand-New#Pass2026');await edit('#pconf','Brand-New#Pass2026');
 flushSync(()=>document.querySelector('form').requestSubmit());
 await until(()=>heard.length>0,'the sign-out announcement');
 assert(heard[0]===MESSAGE,'Unexpected message: '+heard[0]);
 const sent=calls.find(c=>c.url==='/api/auth/password'&&c.method==='POST');
 assert(sent&&sent.body.cur==='Old#Password2025'&&sent.body.next==='Brand-New#Pass2026','The change request must carry the passwords');
 assert(document.querySelector('form button:not([type=button])')?.textContent.includes('Saving'),'The button stays on Saving… so it cannot be submitted twice');
 window.removeEventListener('pawcare:signed-out',listen);
 flushSync(()=>root.render(<div/>));await tick();

 // 2. The app: it answers the announcement by signing out and showing the Log in page with the notice.
 appMode=true;
 flushSync(()=>root.render(<App/>));
 await until(()=>calls.some(c=>c.url==='/api/auth/me'),'the app to check the session');await tick(300);
 assert(!document.body.textContent.includes(MESSAGE),'The notice must not show before a password change');
 window.dispatchEvent(new CustomEvent('pawcare:signed-out',{detail:{message:MESSAGE}}));
 await until(()=>document.body.textContent.includes(MESSAGE),'the notice on the Log in page');
 await until(()=>calls.some(c=>c.url==='/api/auth/logout'),'the app to close its own session');
 assert(document.querySelector('input[type="password"],input[type="email"],input[name="email"]'),'The Log in form must be showing');
 return {passed:true,checks:['form announces the sign-out with the right message','request carries both passwords','button stays on Saving…','app shows Log in with the notice','app closes its own session']};
}
window.passwordResult=run().then(r=>{document.getElementById('results').textContent=JSON.stringify(r,null,2);return r;}).catch(e=>{document.getElementById('results').textContent='FAIL '+e.stack;throw e;});
