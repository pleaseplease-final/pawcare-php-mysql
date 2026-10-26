import {test} from 'node:test';
import assert from 'node:assert/strict';
import {confirmedConsultation,applyConsultationSave} from '../src/consultationSave.js';
import {currentVaccinationDue} from '../src/vaccinationDue.js';
const visit={id:'a',petId:'p',vetId:'v',date:'2026-10-24',time:'10:00',reason:'Exam',status:'In consultation',intakeVitals:{weight:5,temp:38.5}};
const request={id:'c',petId:'p',apptId:'a',vetId:'v',weight:5.2,vaccination:{id:'dose'}};
const response={success:true,consultation:{id:'c',pet_id:'p',appt_id:'a',vet_id:'v',date:'2026-10-24',symptoms:'Saved history',objective:'Saved exam',diagnosis:'Saved diagnosis',treatment:'Saved plan',prescription:'Saved Rx',prescription_items:[],performed_services:[],care_status:'Recheck required',follow_up_date:'2026-10-31',follow_up_reason:'Saved recheck instructions'},appointment:{...visit,pet_id:'p',vet_id:'v',status:'Completed',billing_status:'Unbilled'},vaccination:{id:'dose',pet_id:'p',vet_id:'v',card_id:'CARD',vaccine:'Anti-rabies',brand:'Actual brand',batch:'ACTUAL-LOT',date:'2026-10-24',next_due:'2027-10-24',done:true,created_at:'2026-10-24T12:00:00Z',recorded_by:'Saved Doctor',dose_no:1,dose_of:1},weight:{petId:'p',date:'2026-10-24',kg:5.2,by:'Saved Doctor'},invoiceItems:[]};
test('saved consultation uses certified server fields, care plan and real weight author',()=>{
 const saved=confirmedConsultation(response,request);
 assert.equal(saved.record.diagnosis,'Saved diagnosis');assert.equal(saved.record.followUpReason,'Saved recheck instructions');
 assert.equal(saved.vaccination.vetId,'v');assert.equal(saved.vaccination.cardId,'CARD');assert.equal(saved.weight.by,'Saved Doctor');
 for(const patch of [{success:false},{consultation:{...response.consultation,id:'other'}},{consultation:{...response.consultation,pet_id:'other'}},{consultation:{...response.consultation,appt_id:'other'}},{consultation:{...response.consultation,vet_id:'other'}},{appointment:{...response.appointment,status:'In consultation'}},{vaccination:{...response.vaccination,vet_id:''}},{vaccination:null},{weight:{...response.weight,kg:8}},{invoiceItems:null}])assert.throws(()=>confirmedConsultation({...response,...patch},request),/did not confirm/);
 assert.equal(confirmedConsultation({...response,vaccination:null,weight:null},{...request,vaccination:null,weight:undefined}).vaccination,null);
});
test('local save matches persisted aliases and certified recall without certifying unrelated suggestions',()=>{
 const saved=confirmedConsultation(response,request),suggestion={id:'suggestion',petId:'p',vaccine:'Anti-rabies',done:false},other={id:'other',petId:'p',vaccine:'5-in-1',done:false};
 const db={appts:[visit],pets:[{id:'p',weight:5,weights:[]}],records:[],vacc:[suggestion,other]};
 const next=applyConsultationSave(db,saved,visit);
 assert.equal(next.records[0],saved.record);assert.equal(next.consults,next.records);assert.equal(next.vaccs,next.vacc);assert.equal(next.appts[0].status,'Completed');assert.equal(next.pets[0].weight,5.2);assert.equal(next.pets[0].weights[0].by,'Saved Doctor');
 assert.ok(!next.vacc.some(v=>v.id==='suggestion'));assert.equal(next.vacc.find(v=>v.id==='other').done,false);
 assert.deepEqual(currentVaccinationDue(next.vacc).map(v=>v.id),['dose']);assert.equal(db.records.length,0);
 for(const appts of [[],[{...visit,vetId:'recipient'}],[{...visit,status:'Completed'}],[{...visit,intakeVitals:{weight:8,temp:39}}]]){const changed={...db,appts};assert.equal(applyConsultationSave(changed,saved,visit),changed)}
 const removed={...db,pets:[]};assert.equal(applyConsultationSave(removed,saved,visit),removed);
});
