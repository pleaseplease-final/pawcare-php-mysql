import {test} from 'node:test';
import assert from 'node:assert/strict';
import {careForProfile,elapsedDays,calculatedFollowUp} from '../src/visitCare.js';
import {visitProfile,visitClinicalFields} from '../src/visitForm.js';
import {validateSoapFields} from '../src/soapValidation.js';
import {resolveAdministrationLot} from '../server/administrationLot.js';
test('care choices match reasons and unrelated draft choices cannot become a plan',()=>{
 for(const reason of ['Annual check-up','Skin or ear problem','Limping or injury','Vomiting or diarrhea','Not eating or drinking','Dental check','Surgical assessment','Follow-up visit']){
 const appt={service:reason==='Surgical assessment'?'surgery':'checkup',reason};
 const options=careForProfile(visitProfile(appt));assert.ok(options.plans.length);assert.ok(options.services.includes('srv_consult'));
 const form={date:'2026-10-26',symptoms:'Concern',objective:'Exam',diagnosis:'Assessment',treatment:'',prescription:'',carePlanChoice:options.plans[0]};
 assert.equal(visitClinicalFields(form,appt).treatment,options.plans[0]);
 const unrelated=visitClinicalFields({...form,carePlanChoice:'Unrelated'},appt);
 assert.equal(unrelated.treatment,'');assert.ok(validateSoapFields(unrelated,'2026-10-26').carePlanChoice);
 }
});
test('duration and follow-up arithmetic use actual care date including leap/month boundaries',()=>{
 assert.equal(elapsedDays('2024-02-28','2024-03-01'),2);
 assert.equal(elapsedDays('2026-10-26','2026-10-25'),null);
 assert.equal(elapsedDays('2026-02-30','2026-03-01'),null);
 assert.equal(calculatedFollowUp('2026-10-26','7'),'2026-11-02');
 assert.equal(calculatedFollowUp('2026-10-26','1.5'),'');
});
test('deworming can save without lot; configured real lots autofill and expired lots reject',()=>{
 const v={id:'record-1',vaccine:'Deworming',brand:'Product',batch:''};
 assert.equal(resolveAdministrationLot(v,'2026-10-26',[]).batch,'');
 assert.equal(resolveAdministrationLot({...v,batch:undefined},'2026-10-26',[]).batch,'');
 const products=[{id:'product',name:'Product',lots:[{batch:'REAL-OLD',expiresOn:'2020-01-01'},{batch:'REAL-NEW',expiresOn:'2027-01-01'}]}];
 assert.equal(resolveAdministrationLot({...v,dewormingProductId:'product'},'2026-10-26',products).batch,'REAL-NEW');
 assert.throws(()=>resolveAdministrationLot({...v,dewormingProductId:'product',batch:'REAL-OLD'},'2026-10-26',products));
 assert.throws(()=>resolveAdministrationLot({...v,dewormingProductId:'missing'},'2026-10-26',products));
 assert.equal(resolveAdministrationLot({...v,vaccine:'Anti-rabies'},'2026-10-26',products).batch,'');
 const form={date:'2026-10-26',symptoms:'Visit',objective:'Exam',diagnosis:'Assessment',treatment:'Care',prescription:'',giveVaccine:true,...v,doseNo:1,doseOf:1,intervalDays:30,scheduleApproved:true};
 assert.equal(validateSoapFields(form,'2026-10-26').batch,undefined);
 assert.ok(validateSoapFields({...form,vaccine:'Anti-rabies'},'2026-10-26').batch);
});
