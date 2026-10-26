import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startClinicSync} from '../src/clinicSync.js';
import {createClinicStateLoader} from '../src/clinicStateLoader.js';
import {applyClinicState, emptyClinicState} from '../src/clinicState.js';

const flush = () => new Promise(resolve => setImmediate(resolve));
function harness(load) {
  const page = new EventTarget(); page.visibilityState = 'visible';
  const events = new EventTarget(); events.navigator = {onLine:true};
  let next = 0;
  const timers = new Map(), data = [], errors = [], loading = [];
  const baseline = {};
  const sync = startClinicSync({load, document:page, window:events, onData:(value, previous)=>data.push({value,previous}), onError:error=>errors.push(error), onLoading:value=>loading.push(value), getBaseline:()=>baseline,
    setTimer:(fn,ms)=>{const id=++next;timers.set(id,{fn,ms});return id;}, clearTimer:id=>timers.delete(id)});
  return {sync,page,events,timers,data,errors,loading,baseline, fire(ms){const [id,timer]=[...timers].find(([,t])=>t.ms===ms);timers.delete(id);timer.fn();}};
}
test('one request handles polling, focus and retry while slow; next poll waits for completion',async()=>{
  let release,calls=0;
  const h=harness(()=>{calls++;return new Promise(r=>release=r)});
  try {
    h.events.dispatchEvent(new Event('focus'));h.sync.refresh();assert.equal(calls,1);
    assert.equal([...h.timers.values()].some(t=>t.ms===3000),false);
    release({pets:[]});await flush();assert.equal(h.data[0].previous,h.baseline);
    assert.deepEqual(h.loading,[true,false]);h.fire(3000);assert.equal(calls,2);
    release({pets:[]});await flush();
  } finally {h.sync.stop();}
});
test('hidden/offline tabs pause and resume without overlapping requests',async()=>{
  let calls=0;const h=harness(async()=>++calls);
  try {
    await flush();h.page.visibilityState='hidden';h.page.dispatchEvent(new Event('visibilitychange'));
    assert.equal(h.timers.size,0);await h.sync.refresh();assert.equal(calls,1);
    h.page.visibilityState='visible';h.events.navigator.onLine=false;h.page.dispatchEvent(new Event('visibilitychange'));
    assert.equal(calls,1);h.events.navigator.onLine=true;h.events.dispatchEvent(new Event('online'));await flush();assert.equal(calls,2);
    h.events.navigator.onLine=false;h.events.dispatchEvent(new Event('offline'));assert.equal(h.timers.size,0);
  } finally {h.sync.stop();}
});
test('timeouts release pending state and allow retry; cleanup aborts and ignores late results',async()=>{
  let signals=[];
  const h=harness(signal=>{signals.push(signal);return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted'))));});
  h.fire(20000);await flush();assert.equal(signals[0].aborted,true);assert.match(h.errors[0].message,/too long/);
  h.sync.refresh();assert.equal(signals.length,2);h.sync.stop();await flush();
  assert.equal(signals[1].aborted,true);assert.equal(h.errors.length,1);assert.equal(h.timers.size,0);
  h.events.dispatchEvent(new Event('focus'));assert.equal(signals.length,2);
  let release;const late=harness(()=>new Promise(r=>release=r));late.sync.stop();release({pets:[{id:'old-user'}]});await flush();assert.equal(late.data.length,0);
});
test('failed loads retain retry scheduling and surface the original authorization failure',async()=>{
  let calls=0;const h=harness(async()=>{if(++calls===1)throw Object.assign(new Error('Expired'),{status:401});return {pets:[]};});
  try {await flush();assert.equal(h.errors[0].status,401);h.fire(3000);await flush();assert.equal(h.data.length,1);}finally{h.sync.stop();}
});
test('unchanged clinic collections preserve identities while edits, removals and aliases follow the server',()=>{
  const remote={owners:[{id:'o'}],pets:[{id:'a',weights:[{kg:5}]},{id:'b'}],vaccs:[{id:'v'}],consults:[{id:'c'}]};
  const state=applyClinicState(emptyClinicState(),remote);
  assert.equal(applyClinicState(state,structuredClone(remote)),state);
  const next=applyClinicState(state,{...remote,pets:[remote.pets[0],{id:'b',name:'Changed'}]});
  assert.equal(next.pets[0],state.pets[0]);assert.notEqual(next.pets[1],state.pets[1]);
  assert.equal(next.owners,state.owners);assert.equal(next.vacc,next.vaccs);assert.equal(next.records,next.consults);
  assert.deepEqual(applyClinicState(next,{}).pets,[]);
});
test('a late poll cannot undo a saved appointment, handoff or vaccination',()=>{
  const baseline=applyClinicState(emptyClinicState(),{appts:[{id:'a',status:'Checked-in'}],vaccs:[]});
  const saved={...baseline,appts:[{id:'a',status:'Completed'}],vacc:[{id:'certified'}]};
  assert.equal(applyClinicState(saved,{appts:baseline.appts},baseline),saved);
  const handedOff={...baseline,pets:[],appts:[]};
  assert.equal(applyClinicState(handedOff,{appts:baseline.appts},baseline),handedOff);
  const profile={...baseline,accountProfiles:{u:{name:'Current'}}};
  assert.equal(applyClinicState(profile,{appts:baseline.appts},baseline).accountProfiles,profile.accountProfiles);
});
test('state revalidation reuses data only inside one session and updates its tag after changes',async()=>{
  const options=[], snapshot={pets:[{id:'p'}]};let call=0;
  const loader=createClinicStateLoader(async(m,p,b,opt)=>{options.push(opt);return ++call===1?{data:snapshot,etag:'"v1"'}:call===2?{notModified:true}:{data:{pets:[]},etag:'"v2"'};});
  assert.equal(await loader(),snapshot);assert.equal(await loader(),snapshot);assert.equal(options[1].ifNoneMatch,'"v1"');
  assert.deepEqual(await loader(),{pets:[]});await loader();assert.equal(options[3].ifNoneMatch,'"v2"');
  const separate=createClinicStateLoader(async(m,p,b,opt)=>{assert.equal(opt.ifNoneMatch,undefined);return {notModified:true};});
  await assert.rejects(separate(),/could not be confirmed/);
});

test('a cached response never turns a later authorization or connection failure into success', async()=>{
  let calls=0;
  const load=createClinicStateLoader(async()=>{
    if(++calls===1)return {data:{pets:[{id:'private'}]},etag:'"saved"'};
    throw Object.assign(new Error('Session expired'),{status:401});
  });
  await load();await assert.rejects(load(),error=>error.status===401);
});


test('background loader only polls the summary endpoint and retains aggregate counts',async()=>{
 const remote={summary:true,totals:{consultations:120,appointment_status:{Completed:100}},owners:[],pets:[],appts:[],vaccs:[],consults:[],petRequests:[],vets:[],log:[]};
 let calls=0;const load=createClinicStateLoader(async(method,path,body,options)=>{calls++;assert.equal(method,'GET');assert.equal(path,'/api/state/summary');assert.equal(body,undefined);return calls===1?{data:remote,etag:'"summary"'}:{notModified:true};});
 const first=await load();assert.equal(first.summary,true);assert.equal(first.totals.consultations,120);assert.strictEqual(await load(),first);assert.equal(calls,2);
});
