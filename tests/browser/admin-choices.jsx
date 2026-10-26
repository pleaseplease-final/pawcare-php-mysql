import React from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import '../../src/styles.css';
import '../../src/fonts.css';
import Portal from '../../src/Portal.jsx';
import NoteOptionsPage from '../../src/roles/NoteOptionsPage.jsx';
import OwnerHeader from '../../src/roles/owner/Header.jsx';
import {emptyClinicState} from '../../src/clinicState.js';
const root=createRoot(document.getElementById('fixture'));let key=0;
const tick=()=>new Promise(resolve=>setTimeout(resolve,40));
const until=async fn=>{for(let i=0;i<200;i++){if(fn())return;await tick();}throw Error('Timed out waiting for choices workflow');};
const assert=(value,message)=>{if(!value)throw Error(message);};
const button=(text,scope=document)=>[...scope.querySelectorAll('button')].find(node=>node.textContent.trim()===text);
const nav=text=>button(text,document.querySelector('aside nav'));
const review=()=>document.querySelector('dialog.submission-review');
function edit(name,value){const control=document.querySelector(`textarea[name=${name}]`);Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(control,value);flushSync(()=>{control.dispatchEvent(new Event('input',{bubbles:true}));control.dispatchEvent(new Event('change',{bubbles:true}));});}
const value=name=>document.querySelector(`textarea[name=${name}]`)?.value;
const leaveBrowser=()=>{const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);return event.defaultPrevented;};
function NextPage({go,navigation}){return <section><h2>Next page marker</h2><button onClick={()=>go('target',{apptId:'exact-visit',action:'notes'})}>Open exact visit</button><output>{JSON.stringify(navigation)}</output></section>;}
function Target({navigation}){return <section><h2>Target page marker</h2><output>{JSON.stringify(navigation)}</output></section>;}
function Screen({role}){
 const [db,setDb]=React.useState(emptyClinicState),[signedOut,setSignedOut]=React.useState(false);
 const me={id:`choices-${role}`,ownerId:'synthetic-owner',name:'Synthetic administrator',role};window.fixtureMe=me;
 const cfg={portal:'Synthetic workflow',Header:role==='owner'?OwnerHeader:undefined,menu:[{k:'note-options',l:'Clinical Note Choices',i:'file',Page:NoteOptionsPage},{k:'next',l:'Next page',i:'home',Page:NextPage},{k:'target',l:'Target page',i:'file',Page:Target}]};
 return signedOut?<p>Signed out marker</p>:<Portal cfg={cfg} me={me} db={db} setDb={setDb} onLogout={()=>{window.logoutCount++;setSignedOut(true);}}/>;
}
window.showChoices=(role='admin',page='note-options')=>{sessionStorage.setItem(`pawcare_page_choices-${role}`,page);window.logoutCount=0;flushSync(()=>root.render(<Screen key={++key} role={role}/>));};
window.remoteChoices={revision:4,options:{diagnosis:['Saved diagnosis'],treatment:['Saved treatment']}};
window.choiceReads=0;window.choiceWrites=0;window.readAborts=0;
window.fetch=async(path,options={})=>{
 const url=String(path),json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
 if(url==='/api/clinical/note-options'){
  if(options.method==='PUT'){
   window.choiceWrites++;const request=JSON.parse(options.body);window.lastChoiceWrite=request;
   if(window.deferWrites)await new Promise(resolve=>window.writeGate=resolve);
   if(window.writeReply==='fail')return json({error:'Synthetic choices save failed'},503);
   if(window.writeReply==='conflict')return json({error:'Another administrator changed the choices. Reload and review them before saving.'},409);
   if(request.revision!==window.remoteChoices.revision)return json({error:'Stale choices revision'},409);
   window.remoteChoices={revision:request.revision+1,options:request.options};
   return json(window.writeReply==='missing'?{}:window.remoteChoices);
  }
  window.choiceReads++;
  if(window.deferReads)await new Promise((resolve,reject)=>{
   const abort=()=>{window.readAborts++;reject(Error('Aborted'));};options.signal?.addEventListener('abort',abort,{once:true});
   window.readGate=()=>{options.signal?.removeEventListener('abort',abort);resolve();};
  });
  if(window.readReply==='fail')return json({error:'Synthetic choices reload failed'},503);
  return json(window.readReply==='missing'?{}:window.remoteChoices);
 }
 if(url==='/api/auth/profile')return json({profile:window.fixtureMe});
 if(url.includes('/services/prices'))return json({catalog:[]});
 if(url.startsWith('/api/state/history'))return json({appts:[],vaccs:[],consults:[],weights:{},page:{hasMore:false}});
 if(options.method && options.method!=='GET')throw Error('Fixture blocks other mutations');
 return json({});
};
window.checkAdminChoices=async()=>{
 window.remoteChoices={revision:4,options:{diagnosis:['Saved diagnosis'],treatment:['Saved treatment']}};
 window.deferReads=false;window.deferWrites=false;window.readReply='fail';window.writeReply='saved';window.showChoices();
 await until(()=>document.body.textContent.includes('Synthetic choices reload failed'));
 assert(!document.querySelector('textarea') && !leaveBrowser(),'Initial failed read does not create an editable empty catalog');
 window.readReply='missing';button('Reload saved choices').click();await until(()=>document.body.textContent.includes('saved choices and revision'));
 window.readReply='saved';button('Reload saved choices').click();await until(()=>value('diagnosis')==='Saved diagnosis');
 edit('diagnosis','Duplicate\nduplicate');document.querySelector('form').requestSubmit();await tick();
 const diagnosis=document.querySelector('textarea[name=diagnosis]');assert(diagnosis.getAttribute('aria-invalid')==='true' && document.activeElement===diagnosis,'Duplicate choice is inline and focused');
 edit('diagnosis','Draft diagnosis');edit('treatment','Draft treatment');await tick();
 assert(diagnosis.getAttribute('aria-invalid')==='false' && leaveBrowser(),'Corrected draft clears error and guards browser reload');
 const reads=window.choiceReads;button('Reload saved choices').click();await tick();assert(review()?.textContent.includes('Reload saved choices?'),'Reload reviews dirty lists');
 button('Back to edit',review()).click();await tick();assert(value('diagnosis')==='Draft diagnosis' && window.choiceReads===reads,'Cancelled reload retains draft and makes no request');
 window.readReply='fail';button('Reload saved choices').click();await tick();button('Reload and replace entries',review()).click();await until(()=>document.body.textContent.includes('Synthetic choices reload failed'));
 assert(value('diagnosis')==='Draft diagnosis' && value('treatment')==='Draft treatment','Failed reload preserves both lists');
 window.readReply='missing';button('Reload saved choices').click();await tick();button('Reload and replace entries',review()).click();await until(()=>document.body.textContent.includes('saved choices and revision'));
 assert(value('diagnosis')==='Draft diagnosis','Malformed reload preserves draft atomically');
 window.readReply='saved';window.deferReads=true;button('Reload saved choices').click();await tick();button('Reload and replace entries',review()).click();await until(()=>window.readGate && document.body.textContent.includes('Loading saved suggestions'));
 const pendingReads=window.choiceReads;button('Reload saved choices').click();document.querySelector('form').requestSubmit();await tick();assert(window.choiceReads===pendingReads,'In-flight reload blocks another operation');
 window.readGate();await until(()=>value('diagnosis')==='Saved diagnosis' && !document.body.textContent.includes('Loading saved suggestions'));window.deferReads=false;assert(!leaveBrowser(),'Successful reload establishes saved baseline');
 edit('diagnosis','Leave draft');await tick();nav('Clinical Note Choices').click();await tick();assert(!review() && value('diagnosis')==='Leave draft','Selecting current page keeps draft');
 nav('Next page').click();await tick();assert(review()?.textContent.includes('Leave with unsaved changes'),'Sidebar navigation guards draft');
 button('Back to edit',review()).click();await tick();assert(value('diagnosis')==='Leave draft' && sessionStorage.getItem('pawcare_page_choices-admin')==='note-options','Cancelled navigation preserves draft and remembered page');
 nav('Next page').click();await tick();button('Discard and leave',review()).click();await until(()=>document.body.textContent.includes('Next page marker'));
 assert(sessionStorage.getItem('pawcare_page_choices-admin')==='next','Accepted navigation remembers next page');
 nav('Clinical Note Choices').click();await until(()=>value('diagnosis')==='Saved diagnosis');
 edit('diagnosis','Saving draft');edit('treatment','Saving treatment');await tick();window.deferWrites=true;
 document.querySelector('form').requestSubmit();await tick();button('Save choices',review()).click();await until(()=>window.writeGate && document.body.textContent.includes('Saving…'));
 nav('Next page').click();await tick();assert(value('diagnosis')==='Saving draft' && !review(),'Navigation waits for in-flight save');
 button('Log out').click();await tick();assert(window.logoutCount===0 && !review(),'Logout waits for in-flight save');
 assert(leaveBrowser(),'Browser reload guarded while saving');
 window.writeReply='fail';window.writeGate();await until(()=>document.body.textContent.includes('Synthetic choices save failed'));assert(value('diagnosis')==='Saving draft' && value('treatment')==='Saving treatment','Failed save retains both lists');
 window.deferWrites=false;window.writeReply='saved';document.querySelector('form').requestSubmit();await tick();button('Save choices',review()).click();await until(()=>document.body.textContent.includes('suggestions saved.'));
 assert(!leaveBrowser() && !document.body.textContent.includes('Unsaved changes'),'Confirmed save resets dirty baseline');
 edit('diagnosis','Conflict draft');await tick();assert(!document.body.textContent.includes('suggestions saved.'),'Editing clears stale saved message');
 window.writeReply='conflict';document.querySelector('form').requestSubmit();await tick();button('Save choices',review()).click();await until(()=>document.body.textContent.includes('Another administrator changed'));
 assert(value('diagnosis')==='Conflict draft' && button('Review and save choices').disabled,'Conflict retains draft and requires fresh saved revision');
 window.remoteChoices={revision:window.remoteChoices.revision+1,options:{diagnosis:['Other admin choice'],treatment:['Other admin treatment']}};
 button('Reload saved choices').click();await tick();button('Back to edit',review()).click();await tick();assert(value('diagnosis')==='Conflict draft','Conflict reload can be cancelled to copy entries');
 button('Reload saved choices').click();await tick();button('Reload and replace entries',review()).click();await until(()=>value('diagnosis')==='Other admin choice');
 edit('diagnosis','Unconfirmed save');window.writeReply='missing';const writes=window.choiceWrites;
 document.querySelector('form').requestSubmit();await tick();button('Save choices',review()).click();await until(()=>document.body.textContent.includes('did not confirm these saved choices'));
 assert(window.choiceWrites===writes+1 && value('diagnosis')==='Unconfirmed save' && button('Review and save choices').disabled,'Ambiguous commit retains entries and prevents automatic repeat save');
 button('Reload saved choices').click();await tick();button('Reload and replace entries',review()).click();await until(()=>!button('Review and save choices').disabled);
 assert(value('diagnosis')==='Unconfirmed save' && !leaveBrowser(),'Reload reconciles committed save without duplicate mutation');
 edit('diagnosis','Logout draft');await tick();button('Log out').click();await tick();assert(review(),'Logout reviews unsaved choices');
 button('Back to edit',review()).click();await tick();assert(value('diagnosis')==='Logout draft' && window.logoutCount===0,'Cancelled logout retains entries');
 button('Log out').click();await tick();button('Discard and leave',review()).click();await until(()=>window.logoutCount===1);
 for(const role of ['owner','assistant','vet','admin']){
  window.showChoices(role,'next');await tick();button('Open exact visit').click();await until(()=>document.body.textContent.includes('Target page marker'));
  assert(document.querySelector('output').textContent.includes('exact-visit') && !review(),`${role} clean navigation preserves exact visit context`);
  nav('Target page').click();await tick();assert(document.querySelector('output').textContent==='null',`${role} selecting current clean page clears handled navigation context`);
 }
 window.deferReads=true;window.showChoices('admin');await until(()=>document.body.textContent.includes('Loading saved suggestions'));const aborted=window.readAborts;
 nav('Next page').click();await until(()=>document.body.textContent.includes('Next page marker'));await tick();assert(window.readAborts===aborted+1,'Leaving clean initial load aborts read');window.deferReads=false;
 const result={reloadDraftProtection:true,saveFailureRetention:true,revisionConflictRecovery:true,ambiguousSaveRecovery:true,navigationAndLogoutGuard:true,unchangedRoleNavigation:4,inlineValidation:true,requestLockAndAbort:true,viewport:[innerWidth,innerHeight]};
 document.getElementById('results').textContent='PASS: '+JSON.stringify(result);return result;
};
window.showChoices();
