import {test} from 'node:test';
import assert from 'node:assert/strict';
import {clinicDocumentErrors,timelineFilterErrors} from '../src/clinicDocumentValidation.js';
import {eventTitle,filterCardEvents,cardCareDue} from '../src/vetCardTimeline.js';
import {clinicRequest} from '../src/clinicApi.js';
test('clinic details require real contact formats, bounded source and explicit verification',()=>{
 const valid={name:'Synthetic clinic',address:'Synthetic address',phone:'+639170000001',email:'clinic@example.invalid',registration:'TEST-REG',verificationSource:'Synthetic source',confirmed:true};
 assert.deepEqual(clinicDocumentErrors(valid),{});
 for(const field of ['name','address','phone','email','registration','verificationSource'])assert.ok(clinicDocumentErrors({...valid,[field]:' '})[field]);
 for(const patch of [{phone:'letters'},{phone:'.......'},{email:'invalid'},{confirmed:false},{verificationSource:'x'.repeat(501)}])assert.ok(Object.keys(clinicDocumentErrors({...valid,...patch})).length);
 assert.deepEqual(clinicDocumentErrors({...valid,confirmed:false,name:' '}).confirmed,'Confirm that you checked the clinic details against the recorded source.');
});
test('timeline filters validate while editing, recalculate related dates and distinguish plans and owner reports',()=>{
 assert.ok(timelineFilterErrors({from:'2026-02-30',to:''}).from);
 assert.ok(timelineFilterErrors({from:'2026-10-25',to:'2026-10-24'}).to);
 assert.deepEqual(timelineFilterErrors({from:'2026-10-23',to:'2026-10-24'}),{});
 const events=[{id:'dose',kind:'vaccination',vaccine:'Rabies',date:'2026-10-24'},{id:'plan',kind:'planned',vaccine:'Rabies',date:'2026-10-24'},{id:'weight',kind:'weight',date:'2026-10-25',staffName:'Synthetic nurse'},{id:'report',kind:'registration',date:'2026-10-23'}];
 assert.match(eventTitle(events[1]),/Not administered/);assert.match(eventTitle(events[3]),/Not clinic measured/);
 assert.deepEqual(filterCardEvents(events,{query:'rabies',kind:'vaccination',from:'',to:''}).map(e=>e.id),['dose']);
 assert.deepEqual(filterCardEvents(events,{query:'',kind:'',from:'2026-10-25',to:'2026-10-25'}).map(e=>e.id),['weight']);
});
test('PDF download uses authenticated clinic transport, validates content type and preserves server error messages',async t=>{
 const requests=[];t.mock.method(globalThis,'fetch',async(path,options)=>{requests.push({path,options});return new Response(new Blob(['%PDF-1.3 test']),{headers:{'Content-Type':'application/pdf'}});});
 const file=await clinicRequest('GET','/api/pets/pet/vet-card/pdf',undefined,{blob:true});assert.equal(await file.text(),'%PDF-1.3 test');assert.equal(requests[0].options.credentials,'include');assert.equal(requests[0].options.cache,'no-store');
 t.mock.method(globalThis,'fetch',async()=>new Response('{"error":"Awaiting saved payment"}',{status:409,headers:{'Content-Type':'application/json'}}));await assert.rejects(clinicRequest('GET','/api/pets/pet/vet-card/pdf',undefined,{blob:true}),/Awaiting saved payment/);
 t.mock.method(globalThis,'fetch',async()=>new Response('{}',{headers:{'Content-Type':'application/json'}}));await assert.rejects(clinicRequest('GET','/api/pets/pet/vet-card/pdf',undefined,{blob:true}),/did not return a PDF/);
});

test('optional vaccination-card identifiers validate real dates and bounded text',async()=>{
 const {vaccinationCardFieldErrors:errors}=await import('../src/vaccinationCardFields.js');
 assert.deepEqual(errors({},'2026-10-25'),{});
 assert.deepEqual(errors({manufacturer:'Maker',serialNumber:'S-123',microchipNumber:'CHIP-123',microchipDate:'2025-01-01'},'2026-10-25'),{});
 assert.ok(errors({manufacturer:'x'.repeat(101)}).manufacturer);
 assert.ok(errors({serialNumber:123}).serialNumber);
 assert.ok(errors({microchipDate:'2025-02-30',microchipNumber:'Chip'}).microchipDate);
 assert.ok(errors({microchipDate:'2027-01-01',microchipNumber:'Chip'},'2026-10-25').microchipDate);
 assert.ok(errors({microchipDate:'2025-01-01'}).microchipNumber);
});


test('next care uses only latest administrations per family, clears superseded due dates and ignores filters',()=>{
 const old={id:'old',kind:'vaccination',vaccine:'Anti-rabies',date:'2025-01-01',nextDue:'2026-01-01'};
 const latest={...old,id:'new',vaccine:'Rabies booster',date:'2026-01-01',nextDue:'2027-01-01'};
 const worm={id:'worm',kind:'deworming',vaccine:'Deworming',date:'2026-10-26',nextDue:'2026-11-26'};
 const events=[old,latest,worm,{...worm,id:'plan',kind:'planned',nextDue:'2026-10-01'},{id:'weight',kind:'weight',date:'2026-10-26',value:3}];
 assert.deepEqual(cardCareDue(events).map(e=>e.id),['worm','new']);
 assert.deepEqual(cardCareDue([...events,{...latest,id:'last',date:'2026-10-26',nextDue:null}]).map(e=>e.id),['worm']);
 assert.deepEqual(cardCareDue([{...worm,id:'z-old',createdAt:'2026-10-26T01:00:00Z'},{...worm,id:'a-new',createdAt:'2026-10-26T02:00:00Z',nextDue:null}]),[],'Same-day order uses saved creation time, not random IDs');
 assert.deepEqual(cardCareDue([]),[]);
});
