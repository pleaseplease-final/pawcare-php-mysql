import {intakeReasonError} from './intakeVisit.js';
import {admissionChoiceErrors} from './admissionTemplates.js';
import {vitalValueError} from './vitalValidation.js';
import { consentErrors } from './admissionCare.js';
const text = (value,label,max,required=false) => !String(value ?? '').trim() && required ? `${label} is required.` : String(value ?? '').length > max ? `Use at most ${max.toLocaleString()} characters.` : '';
export const numberError = (value,label,min,max,{required=true,integer=false}={}) => {
  if (String(value ?? '').trim()==='') return required ? `Enter ${label.toLowerCase()}.` : '';
  const n = Number(value);
  return !Number.isFinite(n) || n<min || n>max || (integer && !Number.isInteger(n)) ? `${label} must be ${integer?'a whole number ':''}between ${min} and ${max}.` : '';
};
export function admissionErrors(form,{mode,vet,visits=[]}) {
  const create=mode==='create', discharge=mode==='discharge', release=mode==='release',consent=mode==='consent';
  return {
    ...(consent ? consentErrors(form,true) : !vet && mode==='update' ? consentErrors(form,false) : {}),
    nextObservationAt:vet && !discharge && !release && (create || form.nextObservationAt || form.observationInstructions) ? !Number.isFinite(medicineEventTime(form.nextObservationAt)) ? 'Enter the next observation date and time (Manila).' : medicineEventTime(form.nextObservationAt)<=Date.now() ? 'Choose a future observation time.' : '' : '',
    observationInstructions:vet && !discharge && !release ? text(form.observationInstructions,'Observation instructions',1000,create || !!form.nextObservationAt) : '',
    apptId:create && !visits.some(v=>v.id===form.apptId) ? 'Choose an assigned consultation.' : '',
    clinicalNote:consent ? '' : text(form.clinicalNote,'Clinic note',3000,true),
    carePlan:vet && !discharge && !release ? text(form.carePlan,'Care plan',3000,create) : '',
    ownerUpdate:text(form.ownerUpdate,'Owner message',2000,create),
    dischargeInstructions:discharge ? text(form.dischargeInstructions,'Home-care instructions',3000,true) : '',
    temp:!discharge && !release && !consent ? vitalValueError(form.temp,'temp',false) : '',
    weight:!discharge && !release && !consent ? vitalValueError(form.weight,'weight',false) : '',
    ...admissionChoiceErrors(form,{create,vet}),
  };
}
// datetime-local has no timezone; clinic records always use Manila (UTC+08:00).
export function medicineEventTime(value) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value || '')) return NaN;
  const time=Date.parse(`${value}+08:00`);
  if (!Number.isFinite(time)) return NaN;
  const local=new Date(time+8*3600000).toISOString();
  return local.slice(0,value.length)===value ? time : NaN;
}
export function medicineErrors(form,{action,admission,order,event,now=Date.now()}) {
  const errors={clinicalNote:text(form.clinicalNote,'Clinic observation / reason',3000,true),ownerUpdate:text(form.ownerUpdate,'Owner message',2000,!!event?.ownerUpdate)};
  if(action==='order') {
    for (const [key,label,max] of [['medicine','Medicine name',200],['dose','Dose with units',200],['route','Route',100],['frequency','Frequency / schedule',200]]) errors[key]=text(form[key],label,max,true);
    errors.instructions=text(form.instructions,'Medicine instructions',1000);
    if(form.catalogId) errors.supplyLimit=numberError(form.supplyLimit,'Authorized items/packages',1,1000,{integer:true});
  }
  if(action==='medication') {
    errors.result=['Given','Missed','Held'].includes(form.result) ? '' : 'Choose what actually happened.';
    const when=medicineEventTime(form.occurredAt);
    const earliest=Math.max(Date.parse(admission.admittedAt),Date.parse(order.ordered_at));
    errors.occurredAt=!Number.isFinite(when) ? 'Enter a valid actual date and time (Manila).' : when<Math.floor(earliest/1000)*1000 ? 'The event cannot be before admission or the medicine order.' : when>now ? 'The actual event cannot be in the future.' : '';
    if(form.result==='Given' && order.catalog_id) errors.billableQuantity=numberError(form.billableQuantity,'Whole items/packages used',0,Math.min(1000,order.supply_limit),{integer:true});
  }
  return errors;
}
export function paymentErrors({items,cashTendered,refNo,method,prescribed}) {
  const errors={};
  for(const [index,item] of items.entries()) if(!['performed','admission'].includes(item.source)) {
    const limit=prescribed.find(p=>p.catalogId===item.catalogId)?.quantity ?? 1000;
    errors[`qty-${index}`]=numberError(item.qty,'Quantity',1,Math.min(1000,limit),{integer:true});
  }
  const subtotal=items.reduce((sum,item)=>sum+item.price*Number(item.qty),0), total=Math.round(subtotal*100)/100;
  errors.invoice=!items.length || !Number.isFinite(total) || total<=0 || total>10000000 ? 'The invoice total must be greater than zero and at most ₱10,000,000.' : '';
  errors.method=['Cash','GCash','Maya','Credit / Debit Card'].includes(method) ? '' : 'Choose a valid payment method.';
  if(method==='Cash') errors.cashTendered=String(cashTendered).trim()==='' ? 'Enter the actual cash received.' : !Number.isFinite(Number(cashTendered)) || !Number.isSafeInteger(Math.round(Number(cashTendered)*100)) || Math.abs(Number(cashTendered)*100-Math.round(Number(cashTendered)*100))>0.000001 || Number(cashTendered)<Math.max(0,total) ? 'Cash received must cover the total amount due and use at most 2 decimal places.' : '';
  else errors.refNo=text(refNo,'Verified payment reference',100,true) || (refNo.trim().length<4 ? 'Use at least 4 characters for the verified reference.' : '');
  return errors;
}
export function intakeErrors({weight,temp,reason,notes}) {
  return {weight:vitalValueError(weight,'weight'),temp:vitalValueError(temp,'temp'),reason:intakeReasonError(reason),notes:text(notes,'Intake notes',2000)};
}
export function noteChoiceError(value) {
  const list=value.split(/\r?\n/).map(v=>v.trim()).filter(Boolean);
  return list.length>100 ? 'Use up to 100 choices.' : list.some(v=>v.length>1000) ? 'Each choice can contain up to 1,000 characters.' : new Set(list.map(v=>v.toLowerCase())).size!==list.length ? 'Remove duplicate choices (including different capitalization).' : '';
}
