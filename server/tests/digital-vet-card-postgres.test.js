import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import pg from 'pg';
import express from 'express';
import cookieParser from 'cookie-parser';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
if(!process.env.TEST_DATABASE_URL)throw Error('Set TEST_DATABASE_URL to a disposable local database');
const url=new URL(process.env.TEST_DATABASE_URL);if(!['localhost','127.0.0.1'].includes(url.hostname))throw Error('Local database required');
const admin=new pg.Pool({connectionString:url.href}),schema=`test_cards_${crypto.randomUUID().replaceAll('-','')}`;
await admin.query(`CREATE SCHEMA ${schema}`);url.searchParams.set('options',`-c search_path=${schema},public`);process.env.DATABASE_URL=url.href;
const {query,pool}=await import('../db.js');
const sql=name=>readFileSync(new URL(`../database/${name}.sql`,import.meta.url),'utf8');
await query(sql('schema'));await query(sql('appointment-status'));
const {ensurePetRegistrationSchema}=await import('../petRegistration.js');await ensurePetRegistrationSchema();
const {sha256}=await import('../security.js');
for(const role of ['owner','other-owner','assistant','vet','other-vet','admin']){
 const actual=role.replace('other-','');
 await query("INSERT INTO users(id,first_name,last_name,birthday,password_hash,email,role,owner_id,vet_id,mobile_number,email_verified_at,mobile_verified) VALUES($1,'Synthetic',$1,'1990-01-01','unused',$2,$3,$4,$5,'+639170000001',NOW(),true)",[role,`${role}@example.invalid`,actual,actual==='owner'?role:null,actual==='vet'?role:null]);
 await query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,NOW()+INTERVAL '1 day')",[sha256(role),role]);
}
await query("INSERT INTO owners(id,name,email,phone,address) VALUES('owner','Synthetic owner','owner@example.invalid','+639170000001','Synthetic'),('other-owner','Other owner','other@example.invalid','+639170000002','Synthetic')");
await query("INSERT INTO pets(id,owner_id,name,species,birth,weight,vaccination_card_id) VALUES('legacy-card','owner','Legacy patient','Dog','2020-01-01',10,'EXISTING-CARD-ID'),('legacy-empty','owner','Missing reference','Dog','2020-01-01',10,NULL)");
await query("INSERT INTO appointments(id,pet_id,vet_id,date,time,reason,status) VALUES('legacy-visit','legacy-card','vet','2025-01-01','09:00','Historical exam','Completed')");
await query("INSERT INTO vaccinations(id,pet_id,card_id,vaccine,date,done) VALUES('historic-dose','legacy-card','EXISTING-CARD-ID','Historical dose','2025-01-01',true)");
const {ensureDigitalVetCardSchema}=await import('../digitalVetCard.js');await ensureDigitalVetCardSchema();
const {clinicRouter}=await import('../routes/clinic.js');
const app=express();app.use(express.json());app.use(cookieParser());app.use('/api',clinicRouter);
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
after(async()=>{await new Promise(r=>server.close(r));await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();});
const call=async(role,method,path,body)=>{
 const res=await fetch(`http://127.0.0.1:${server.address().port}/api${path}`,{method,headers:{'Content-Type':'application/json',...(role?{Authorization:`Bearer ${role}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
 return {status:res.status,headers:res.headers,data:res.headers.get('content-type')?.includes('application/pdf')?new Uint8Array(await res.arrayBuffer()):await res.json()};
};
const {clinicClock}=await import('../scheduling.js');
const card=(pet,role='owner',format='')=>call(role,'GET',`/pets/${pet}/vet-card${format}`);
const config={name:'Synthetic Verified Clinic',address:'123 Synthetic Street',phone:'+639170000001',email:'clinic@example.invalid',registration:'SYNTHETIC-REGISTRATION',verificationSource:'Synthetic clinic registration fixture',confirmed:true};
async function verify(){const r=await call('admin','GET','/clinic-document-profile');return call('admin','PUT','/clinic-document-profile',{...config,revision:r.data.profile.revision});}
async function fixture({vaccinate=true,name='Synthetic patient'}={}){
 const pet='p_'+crypto.randomUUID(),id='a_'+crypto.randomUUID();
 await query("INSERT INTO pets(id,owner_id,name,species,breed,birth,weight,vaccination_card_id) VALUES($1,'owner',$2,'Dog','Aspin','2020-01-01',10,NULL)",[pet,name]);
 await query("INSERT INTO appointments(id,pet_id,vet_id,date,time,reason,status) VALUES($1,$2,'vet',$3,'09:00','Synthetic examination','In consultation')",[id,pet,clinicClock().date]);
 const request={id:'c_'+crypto.randomUUID(),petId:pet,apptId:id,date:clinicClock().date,symptoms:'Synthetic concern',objective:'Synthetic examination',diagnosis:'Synthetic assessment',treatment:'Synthetic care',prescription:'Synthetic instructions',performedServices:['srv_consult'],weight:10.5,...(vaccinate?{vaccination:{id:'v_'+crypto.randomUUID(),vaccine:'Anti-rabies',brand:'Synthetic brand',batch:'SYNTHETIC-BATCH',doseNo:1,doseOf:3,intervalDays:21,nextDue:(await import('../../src/clinicalWorkflow.js')).boosterDate(clinicClock().date,21),scheduleApproved:true}}:{})};
 const saved=await call('vet','POST','/consultations',request);assert.equal(saved.status,200,JSON.stringify(saved));
 return {pet,id,request,saved:saved.data};
}
async function payment(f){
 const claim=await call('assistant','POST',`/checkout-inbox/${f.id}/claim`,{});assert.equal(claim.status,200,JSON.stringify(claim));
 const invoiceItems=claim.data.invoiceItems,amount=invoiceItems.reduce((n,i)=>n+i.price*i.qty,0);
 const body={claimToken:claim.data.claimToken,invoiceItems,amount,paymentMethod:'Cash',cashTendered:amount};
 return {body,save:()=>call('assistant','POST',`/appointments/${f.id}/billing`,body)};
}
const publication=async pet=>(await query('SELECT * FROM digital_vet_cards WHERE pet_id=$1',[pet])).rows;

const pdfText=async pet=>{
 const out=await card(pet,'owner','/pdf');assert.equal(out.status,200,JSON.stringify(out));
 assert.match(out.headers.get('content-disposition'),/^attachment;/);assert.equal(out.headers.get('cache-control'),'private, no-store');
 const doc=await getDocument({data:out.data,isEvalSupported:false}).promise;
 let text='';for(let i=1;i<=doc.numPages;i++)text+=(await (await doc.getPage(i)).getTextContent()).items.map(t=>t.str).join(' ')+'\n';
 const pages=doc.numPages;await doc.destroy();return {text,pages};
};
test('migration preserves identities and history; a card and PDF are available without clinic setup or payment',async()=>{
 const old=(await query("SELECT * FROM vaccinations WHERE id='historic-dose'")).rows[0];
 for(const name of ['digital-vet-card','vaccination-card-fields']){await query(sql(name));await query(sql(name));}
 assert.deepEqual((await query("SELECT * FROM vaccinations WHERE id='historic-dose'")).rows[0],old);
 assert.equal((await query("SELECT vaccination_card_id FROM pets WHERE id='legacy-card'")).rows[0].vaccination_card_id,'EXISTING-CARD-ID');
 assert.equal((await query("SELECT vaccination_card_id FROM pets WHERE id='legacy-empty'")).rows[0].vaccination_card_id,'PAT-'+(await query("SELECT md5('legacy-empty') hash")).rows[0].hash);
 const r=await card('legacy-card');assert.equal(r.status,200,JSON.stringify(r));assert.ok(r.data.document);assert.equal(r.data.history.events[0].id,'historic-dose');
 assert.equal((await card('legacy-card','owner','/pdf')).status,200);
});
test('unpaid administered doses are included without verified clinic details; payment does not alter the card',async()=>{
 const f=await fixture();
 const before=(await card(f.pet)).data.document;assert.ok(before);assert.equal(before.snapshot.events.filter(e=>e.kind==='vaccination').length,1);
 const p=await payment(f);const responses=await Promise.all([p.save(),p.save()]);assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
 const docs=await publication(f.pet);assert.equal(docs.length,1);assert.equal(docs[0].revision,before.revision);
 const same=await Promise.all(Array.from({length:4},()=>card(f.pet)));for(const c of same){assert.equal(c.status,200,JSON.stringify(c));assert.equal(c.data.document.reference,before.reference);assert.equal(c.data.document.revision,before.revision);}
 assert.equal((await query("SELECT count(*)::int n FROM audit_logs WHERE action LIKE $1",[`Published Digital Vet Card ${docs[0].document_reference}%`])).rows[0].n,1);
 const v=(await query('SELECT * FROM vaccinations WHERE id=$1',[f.request.vaccination.id])).rows[0];assert.equal(v.appt_id,f.id);assert.equal(v.consultation_id,f.request.id);assert.ok(v.card_id);assert.equal(v.done,true);
 assert.equal((await call('vet','POST','/consultations',f.request)).status,403);
 assert.equal((await query('SELECT count(*)::int n FROM consultations WHERE appt_id=$1',[f.id])).rows[0].n,1);
});
test('legacy clinic-profile API retains admin-only validation and revision protection',async()=>{
 for(const role of ['owner','assistant','vet'])assert.equal((await call(role,'PUT','/clinic-document-profile',{...config,revision:0})).status,403);
 const bad=await call('admin','PUT','/clinic-document-profile',{...config,name:' ',phone:'abc',email:'bad',confirmed:false,revision:0});assert.equal(bad.status,400);
 const saved=await verify();assert.equal(saved.status,200,JSON.stringify(saved));assert.equal(saved.data.profile.verified_by,'admin');
 assert.equal((await call('admin','PUT','/clinic-document-profile',{...config,revision:0})).status,409);
});
test('card persistence failure still rolls back payment, checkout task and audit together',async()=>{
 const f=await fixture(),p=await payment(f);
 const before=(await query('SELECT * FROM appointments WHERE id=$1',[f.id])).rows[0];
 const task=(await query('SELECT * FROM checkout_tasks WHERE appointment_id=$1',[f.id])).rows[0];
 const audits=(await query('SELECT count(*)::int n FROM audit_logs')).rows[0].n;
 await query(`CREATE FUNCTION reject_card_publication() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic publication failure'; END $$; CREATE TRIGGER reject_card_publication BEFORE INSERT OR UPDATE ON digital_vet_cards FOR EACH ROW EXECUTE FUNCTION reject_card_publication()`);
 try{assert.equal((await p.save()).status,500);}finally{await query('DROP TRIGGER reject_card_publication ON digital_vet_cards; DROP FUNCTION reject_card_publication()');}
 assert.deepEqual((await query('SELECT * FROM appointments WHERE id=$1',[f.id])).rows[0],before);assert.deepEqual((await query('SELECT * FROM checkout_tasks WHERE appointment_id=$1',[f.id])).rows[0],task);assert.equal((await publication(f.pet)).length,0);assert.equal((await query('SELECT count(*)::int n FROM audit_logs')).rows[0].n,audits);
 assert.equal((await p.save()).status,200);
});
test('card JSON and multipage PDF are scoped, include owner contacts and current weights, and exclude unrelated clinical data',async()=>{
 const f=await fixture({name:'Niña Ω'});
 for(let i=0;i<225;i++)await query("INSERT INTO vital_measurements(id,pet_id,appt_id,kind,value,unit,measured_at,measurement_date,staff_id,staff_name,staff_role,source,origin) VALUES($1,$2,$3,'weight',$4,'kg',clock_timestamp(),$5,'assistant','Synthetic assistant','assistant','intake','clinic')",[`weight-${i}`,f.pet,f.id,10+i/100,clinicClock().date]);
 await query("INSERT INTO vaccinations(id,pet_id,card_id,vaccine,date,next_due,done,automated,notes) VALUES('synthetic-plan',$1,'HISTORIC','PLANNED-NOT-GIVEN',$2,$2,false,true,'Plan'),('unlinked-history',$1,'HISTORIC','Unlinked historical dose','2020-05-01',NULL,true,false,'HISTORICAL-PRIVATE-NOTE'),('deworming-dose',$1,'HISTORIC','Deworming','2025-05-01','2025-08-01',true,false,'')",[f.pet,clinicClock().date]);
 await query("UPDATE vaccinations SET brand='Synthetic dewormer' WHERE id='deworming-dose'");
 await query("INSERT INTO vital_measurements(id,pet_id,appt_id,kind,value,unit,measurement_date,staff_name,source,origin,notes) VALUES('private-measurement',$1,$2,'weight',39,'kg',$3,'Assistant','admission','clinic','PRIVATE-OBSERVATION-SECRET'),('registration-measurement',$1,NULL,'weight',44,'kg',$3,'Owner','registration','registration',''),('temperature-measurement',$1,$2,'temp',38.5,'°C',$3,'Assistant','intake','clinic','')",[f.pet,f.id,clinicClock().date]);
 const first=await card(f.pet);assert.equal(first.status,200,JSON.stringify(first));assert.equal(first.data.history.complete,true);assert.equal(first.data.history.events.filter(e=>e.kind==='weight').length,226);
 assert.deepEqual((await card(f.pet,'vet')).data.history,first.data.history,'staff receives the same limited card');
 for(const role of ['other-owner','other-vet'])for(const format of ['','/pdf'])assert.equal((await card(f.pet,role,format)).status,404);
 assert.equal((await card(f.pet,null)).status,401);
 const corrected=await call('assistant','POST',`/pets/${f.pet}/vitals/weight-0/correct`,{requestId:crypto.randomUUID(),value:11.49,reason:'Synthetic transcription correction'});assert.equal(corrected.status,200,JSON.stringify(corrected));
 const next=(await card(f.pet)).data.document;assert.equal(next.revision,first.data.document.revision+1);assert.equal(next.snapshot.events.length,first.data.document.snapshot.events.length);assert.ok(!next.snapshot.events.some(e=>e.id==='weight-0'));
 assert.equal(Number((await query("SELECT value FROM vital_measurements WHERE id='weight-0'")).rows[0].value),10,'original measurement retained in clinical history');
 const {text,pages}=await pdfText(f.pet);assert.ok(pages>2);
 for(let i=1;i<225;i++)assert.ok(text.includes(`${10+i/100} kg`),`Missing weight ${i}`);
 for(const phrase of ['Niña Ω','Synthetic vet','Synthetic owner','owner@example.invalid','+639170000001','Home address','Unlinked historical dose','Synthetic dewormer','11.49 kg','Veterinarian signature','Next preventive care','Next deworming - Deworming','2025-08-01','Next vaccination - Anti-rabies'])assert.ok(text.includes(phrase),phrase);
 for(const phrase of ['PRIVATE-OBSERVATION-SECRET','PLANNED-NOT-GIVEN','HISTORICAL-PRIVATE-NOTE','Synthetic concern','Synthetic assessment','Synthetic instructions','Official clinic','Publication','Payment','Temperature'])assert.ok(!text.includes(phrase),phrase);
 assert.doesNotMatch(text,/(?:^|\s)44 kg/,'registration weight excluded');
 assert.equal((await publication(f.pet))[0].revision,next.revision,'unchanged download keeps revision');
});
test('optional vaccine identifiers and microchip details persist atomically and appear on the card and PDF',async()=>{
 const f=await fixture({vaccinate:false});
 const id='a_'+crypto.randomUUID();await query("INSERT INTO appointments(id,pet_id,vet_id,date,time,reason,status) VALUES($1,$2,'vet',$3,'10:00','Vaccination','In consultation')",[id,f.pet,clinicClock().date]);
 const request={...f.request,id:'c_'+crypto.randomUUID(),apptId:id,microchip:{number:'SYNTHETIC-CHIP-123',date:'2025-01-01'},vaccination:{id:'v_'+crypto.randomUUID(),vaccine:'Anti-rabies',brand:'Synthetic brand',batch:'LOT-123',manufacturer:'Synthetic manufacturer',serialNumber:'SERIAL-123',doseNo:1,doseOf:1,intervalDays:365,nextDue:(await import('../../src/clinicalWorkflow.js')).boosterDate(clinicClock().date,365),scheduleApproved:true}};
 for(const patch of [{vaccination:{...request.vaccination,manufacturer:'x'.repeat(101)}},{microchip:{number:'',date:'2025-01-01'}},{microchip:{number:'Chip',date:'2025-02-30'}}])assert.equal((await call('vet','POST','/consultations',{...request,...patch})).status,400);
 assert.equal((await call('assistant','POST','/consultations',request)).status,403);
 assert.equal((await call('vet','POST','/consultations',request)).status,200);
 const result=(await card(f.pet)).data;assert.equal(result.history.pet.microchipNumber,'SYNTHETIC-CHIP-123');assert.equal(result.history.pet.microchipDate,'2025-01-01');
 const dose=result.history.events.find(e=>e.kind==='vaccination');assert.equal(dose.manufacturer,'Synthetic manufacturer');assert.equal(dose.serialNumber,'SERIAL-123');
 const {text}=await pdfText(f.pet);for(const phrase of ['SYNTHETIC-CHIP-123','2025-01-01','Synthetic manufacturer','SERIAL-123','LOT-123'])assert.ok(text.includes(phrase),phrase);
});
test('registration approval preserves stable references; an empty card does not fabricate administrations or clinic measurements',async()=>{
 await query("INSERT INTO pets(id,owner_id,name,species,breed,sex,birth,weight,registration_status,vaccination_card_id) VALUES('pending-patient','owner','Pending patient','Canine','Aspin','Male','2020-01-01',10,'Pending','STABLE-INTERNAL-REFERENCE')");
 await query("INSERT INTO pet_requests(id,owner_id,name,species,breed,sex,birth,weight,status,pet_id,neutered) VALUES('pending-request','owner','Pending patient','Canine','Aspin','Male','2020-01-01',10,'Pending','pending-patient','No')");
 const r=await call('assistant','POST','/pet-requests/pending-request/approve',{revision:0});assert.equal(r.status,200,JSON.stringify(r));
 assert.equal((await query("SELECT vaccination_card_id FROM pets WHERE id='pending-patient'")).rows[0].vaccination_card_id,'STABLE-INTERNAL-REFERENCE');
 const doc=(await card('pending-patient')).data.document;assert.ok(doc);assert.deepEqual(doc.snapshot.events,[]);
});
test('actual weights from an ongoing unpaid visit are available without exposing visit notes or billing',async()=>{
 const f=await fixture({vaccinate:false});const original=(await card(f.pet)).data.document;
 const id='a_'+crypto.randomUUID();await query("INSERT INTO appointments(id,pet_id,vet_id,date,time,reason,status,billing_status) VALUES($1,$2,'vet',$3,'10:00','UNPAID-VISIT-SECRET','In consultation','Unpaid')",[id,f.pet,clinicClock().date]);
 await query("INSERT INTO vital_measurements(id,pet_id,appt_id,kind,value,unit,measurement_date,staff_name,source,origin) VALUES('unpaid-measurement',$1,$2,'weight',11,'kg',$3,'Synthetic assistant','intake','clinic')",[f.pet,id,clinicClock().date]);
 const next=(await card(f.pet)).data.document;assert.equal(next.reference,original.reference);assert.equal(next.revision,original.revision+1);assert.ok(next.snapshot.events.some(e=>e.id==='unpaid-measurement'));assert.ok(!JSON.stringify(next).includes('UNPAID-VISIT-SECRET'));
});
test('unverified previous-clinic guide rows are preserved outside the vaccination card',async()=>{
 const f=await fixture({vaccinate:false}),id='external-'+crypto.randomUUID();
 await query("INSERT INTO vaccinations(id,pet_id,card_id,vaccine,brand,batch,date,done,protocol_type,recorded_by) VALUES($1,$2,'EXTERNAL-REF','Previous Rabies Report','External Clinic Record','EXTERNAL-HIST','2024-01-01',true,'External History (Guide)','Previous Vet (External Guide)')",[id,f.pet]);
 assert.ok(!(await card(f.pet)).data.history.events.some(e=>e.id===id));
 assert.equal((await query('SELECT done FROM vaccinations WHERE id=$1',[id])).rows[0].done,true);
 assert.ok(!(await pdfText(f.pet)).text.includes('Previous Rabies Report'));
});


test('next care respects same-day chronology when a later administration clears the next due date',async()=>{
 const {cardCareDue}=await import('../../src/vetCardTimeline.js');
 const f=await fixture({vaccinate:false});
 const older='z_'+crypto.randomUUID(),newer='a_'+crypto.randomUUID();
 await query("INSERT INTO vaccinations(id,pet_id,card_id,vaccine,date,next_due,done,created_at) VALUES($1,$3,'SYNTHETIC','Deworming',$4,'2099-01-01',true,NOW()-INTERVAL '1 hour'),($2,$3,'SYNTHETIC','Deworming',$4,NULL,true,NOW())",[older,newer,f.pet,clinicClock().date]);
 const result=await card(f.pet);assert.equal(result.status,200);assert.ok(result.data.history.events.every(e=>e.kind==='weight' || e.createdAt));
 assert.deepEqual(cardCareDue(result.data.history.events),[]);
 const {text}=await pdfText(f.pet);assert.ok(text.includes('No next deworming or vaccination date recorded.'));
});
