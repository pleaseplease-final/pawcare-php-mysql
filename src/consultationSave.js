import {intakeVisitSnapshot,sameIntakeVisit} from './intakeVisit.js';

export function confirmedConsultation(data, request) {
  const c=data?.consultation,a=intakeVisitSnapshot(data?.appointment),v=data?.vaccination;
  const fail=()=>{throw Error('The server did not confirm this saved consultation. Refresh clinic records before retrying.');};
  if (!data?.success || c?.id!==request.id || c?.pet_id!==request.petId || c?.appt_id!==request.apptId || c?.vet_id!==request.vetId
      || a?.id!==request.apptId || a?.petId!==request.petId || a?.vetId!==request.vetId || a?.status!=='Completed'
      || !Array.isArray(data.invoiceItems) || !Array.isArray(c?.prescription_items) || !Array.isArray(c?.performed_services)
      || ['date','symptoms','objective','diagnosis','treatment','care_status'].some(k=>typeof c?.[k]!=='string' || !c[k]) || typeof c?.prescription!=='string') fail();
  if (request.vaccination ? (!v || v.id!==request.vaccination.id || v.pet_id!==request.petId || v.vet_id!==request.vetId || v.done!==true || !v.card_id || !v.date) : v!=null) fail();
  if (request.weight!==undefined && (data.weight?.petId!==request.petId || data.weight?.kg!==request.weight || !data.weight?.by || data.weight?.date!==c.date)) fail();
  const record={id:c.id,petId:c.pet_id,vetId:c.vet_id,apptId:c.appt_id,date:c.date,symptoms:c.symptoms,objective:c.objective,diagnosis:c.diagnosis,treatment:c.treatment,
    prescription:c.prescription,prescriptionItems:c.prescription_items,performedServices:c.performed_services,careStatus:c.care_status,followUpDate:c.follow_up_date || null,followUpReason:c.follow_up_reason || ''};
  const vaccination=v ? {id:v.id,petId:v.pet_id,cardId:v.card_id,vaccine:v.vaccine,brand:v.brand || '',batch:v.batch || '',date:v.date,createdAt:v.created_at,nextDue:v.next_due || null,doseNo:v.dose_no,doseOf:v.dose_of,done:v.done,automated:Boolean(v.automated),protocolType:v.protocol_type || '',notes:v.notes || '',vetId:v.vet_id,recordedBy:v.recorded_by || ''} : null;
  return {record,vaccination,appointment:{...a,billingStatus:data.appointment.billing_status,invoiceItems:data.invoiceItems},weight:data.weight || null};
}

export function applyConsultationSave(previous,saved,expected) {
  const visit=previous.appts.find(a=>a.id===expected.id);
  // A late save response must not restore a transferred/removed visit or its patient.
  if (!visit || !sameIntakeVisit(visit,expected) || !previous.pets.some(p=>p.id===saved.record.petId)) return previous;
  const records=[saved.record,...(previous.records || []).filter(r=>r.id!==saved.record.id)];
  const vaccination=saved.vaccination;
  const vacc= vaccination ? [vaccination,...(previous.vacc || []).filter(v=>v.id!==vaccination.id && !(v.petId===vaccination.petId && !v.done && v.vaccine.toLowerCase()===vaccination.vaccine.toLowerCase()))] : previous.vacc;
  return {...previous,records,consults:records,vacc,vaccs:vacc,
    appts:previous.appts.map(a=>a.id===expected.id?{...a,...saved.appointment}:a),
    pets:previous.pets.map(p=>p.id===saved.record.petId && saved.weight?{...p,weight:saved.weight.kg,weights:[...(p.weights || []),{date:saved.weight.date,kg:saved.weight.kg,by:saved.weight.by}]}:p)};
}
