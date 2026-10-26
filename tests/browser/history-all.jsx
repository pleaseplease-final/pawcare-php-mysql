import React from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {ClinicHistory,HistoryControls} from '../../src/ClinicHistory.jsx';
const root=createRoot(document.getElementById('fixture'));
const db={pets:[{id:'p',weights:[]}],appts:[],vacc:[],records:[],totals:{}};
const wait=()=>new Promise(r=>setTimeout(r,30));
const until=async(fn)=>{for(let n=0;n<100;n++){if(fn())return;await wait();}throw Error('Timed out waiting for fixture');};
const assert=(value,message)=>{if(!value)throw Error(message);};
let requested=[],mode='success',gate,started=false;
window.fetch=async(path,options)=>{
 const cursor=new URL(String(path),location.origin).searchParams.get('cursor') || 'first';requested.push(cursor);
 if(cursor==='second' && !started){started=true;await new Promise(resolve=>gate=resolve);}
 if(options.signal?.aborted)throw new DOMException('Aborted','AbortError');
 if(mode==='failure' && cursor==='second')return new Response(JSON.stringify({error:'Synthetic page failure'}),{status:503});
 const page=cursor==='first'?{hasMore:true,cursor:'second'}:cursor==='second'?{hasMore:true,cursor:mode==='loop'?'second':'third'}:{hasMore:false};
 return new Response(JSON.stringify({data:{page,appts:[{id:cursor,petId:'p',date:'2026-10-26'}],vaccs:[],consults:[]}}),{headers:{'Content-Type':'application/json'}});
};
let key=0;
function show(){flushSync(()=>root.render(<ClinicHistory key={++key} db={db} me={{role:'assistant'}}>{data=><><HistoryControls/><HistoryControls/><output id="complete">{String(data.historyComplete)}</output><output id="rows">{data.appts.length}</output></>}</ClinicHistory>));}
async function start(){show();[...document.querySelectorAll('button')].find(b=>b.textContent==='Load all history').click();await until(()=>gate);assert(document.body.textContent.includes('1 page loaded'),'Bulk load must display completed page progress');assert(document.getElementById('complete').textContent==='false','Bulk load cannot count as complete between pages');assert([...document.querySelectorAll('button')].every(b=>b.disabled),'Both controls must share in-flight lock');gate();}
async function run(){
 await start();await until(()=>document.getElementById('complete').textContent==='true');assert(requested.join(',')==='first,second,third','All pages must load once, sequentially');assert(document.getElementById('rows').textContent==='3','All page records must be preserved');
 mode='failure';requested=[];gate=null;started=false;await start();await until(()=>!!document.querySelector('[role=alert]'));await wait();assert(requested.length===2,'Failure must stop bulk requests');assert(document.getElementById('complete').textContent==='false','Partial failed bulk load cannot export');
 mode='success';[...document.querySelectorAll('button')].find(b=>b.textContent==='Load all history').click();await until(()=>document.getElementById('complete').textContent==='true');assert(document.getElementById('rows').textContent==='3','Explicit retry must recover the full history');
 mode='loop';requested=[];gate=null;started=false;await start();await until(()=>!!document.querySelector('[role=alert]'));assert(requested.length===2,'Repeated cursor must stop instead of looping');
 document.getElementById('results').textContent='PASS: sequential full history, shared request lock, page progress, partial/error export gate, explicit recovery and repeated-cursor protection.';
}
run().catch(e=>document.getElementById('results').textContent='FAIL: '+e.message);
