/** Client-side workflow validation. No database, API, or payment gateway. */
export const VISIT_STATES = Object.freeze(['Pending Approval','Scheduled','Checked-in','In consultation','Completed','Cancelled','Rejected','No-show']);
export const BILLING_STATES = Object.freeze(['Unbilled','Unpaid','Paid']);
const permitted = {
  'Pending Approval': ['Scheduled','Cancelled','Rejected'], Scheduled: ['Checked-in','Cancelled','No-show'],
  'Checked-in': ['In consultation'], 'In consultation': ['Completed'],
  Completed: [], Cancelled: [], 'No-show': [],
};
const roleName = role => String(role ?? '').toLowerCase().replace(/[^a-z]/g,'');
export const isVet = role => ['vet','veterinarian','doctor'].includes(roleName(role));
export const isAssistant = role => ['assistant','vetassistant','veterinaryassistant','receptionist'].includes(roleName(role));
export const isAdmin = role => ['admin','administrator'].includes(roleName(role));
export const canCollectPayment = role => isAssistant(role);
export const canFinalizeConsultation = role => isVet(role);
export const canChangeVisitStatus = (from,to) => from === to || Boolean(permitted[from]?.includes(to));
export const money = input => {
  if (input === '' || input == null || typeof input === 'boolean') return NaN;
  const n = Number(input);
  return Number.isFinite(n) ? Math.round((n + Number.EPSILON)*100)/100 : NaN;
};
export const calculateTotal = (fee,discount=0) => {
  const f = money(fee), d = money(discount);
  return Number.isFinite(f) && Number.isFinite(d) && f >= 0 && d >= 0 && d <= f ? Math.round((f-d)*100)/100 : NaN;
};
export function validateAppointment({petId,ownerId,date,reason,existing=[],excludeId}={}) {
  const errors={};
  if (!petId) errors.petId='Choose a patient.';
  if (!ownerId) errors.ownerId='Choose the pet owner.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date||'')) || !Number.isFinite(Date.parse(`${date}T00:00:00`))) errors.date='Enter a valid appointment date.';
  if (!String(reason||'').trim()) errors.reason='Enter the reason for the visit.';
  if (existing.some(a=>a.id!==excludeId && a.petId===petId && a.date===date && !['Cancelled','Rejected','No-show'].includes(a.status))) errors.date='This pet already has an active appointment on the selected date.';
  return errors;
}
export function validateIntake({weight,temp,notes}={}) {
  const errors={}, w=Number(weight), t=Number(temp);
  if (weight === '' || weight == null || !Number.isFinite(w) || w<=0 || w>250) errors.weight='Enter a realistic weight greater than 0 kg.';
  if (temp !== '' && temp != null && (!Number.isFinite(t) || t<25 || t>45)) errors.temp='Check the temperature value (°C).';
  if (String(notes??'').length>2000) errors.notes='Notes cannot exceed 2,000 characters.';
  return errors;
}
export function validateConsultation({diagnosis,treatment,prescription,giveVaccine,vaccine,brand,batch}={}, role) {
  const errors={};
  if (!canFinalizeConsultation(role)) errors.role='Only a veterinarian may finalize the consultation.';
  if (!String(diagnosis||'').trim()) errors.diagnosis='Assessment or diagnosis is required.';
  if (!String(treatment||'').trim()) errors.treatment='Treatment plan is required.';
  if (String(prescription??'').length>3000) errors.prescription='Prescription note is too long.';
  if (giveVaccine) {
    if (!String(vaccine||'').trim()) errors.vaccine='Choose a vaccine.';
    if (!String(brand||'').trim()) errors.brand='Enter the vaccine brand.';
    if (!String(batch||'').trim()) errors.batch='Enter the vaccine batch/lot number.';
  }
  return errors;
}
/** Client-side guard for after-consultation payments. Does not verify external transfers. */
export function validateCheckout({appointment,clinicalRecord,role,fee,discount=0,method,received,reference,existingPayments=[]}={}) {
  const errors={};
  if (!appointment?.id) errors.appointment='Appointment is missing.';
  if (!canCollectPayment(role)) errors.role='Only authorized front-desk staff may record payment.';
  if (appointment?.status!=='Completed' || !clinicalRecord?.id || clinicalRecord.apptId!==appointment.id) errors.visit='A veterinarian must complete and record the consultation before payment.';
  if (appointment?.billingStatus==='Paid') errors.payment='This appointment is already paid.';
  if (['Voided','Refunded'].includes(appointment?.billingStatus)) errors.payment='This bill cannot be paid in its current status.';
  if (existingPayments.some(p=>p.apptId===appointment?.id && p.status==='Paid')) errors.payment='Payment already recorded for this appointment.';
  const f=money(fee), d=money(discount), total=calculateTotal(fee,discount), cash=money(received);
  if (!Number.isFinite(f) || f<0 || f>10000000) errors.fee='Enter a valid nonnegative service charge.';
  if (!Number.isFinite(d) || d<0 || d>f) errors.discount='Discount must be between ₱0 and the service charge.';
  if (Number.isFinite(total) && total<=0) errors.fee='A zero-balance visit needs a separate complimentary/waived checkout procedure.';
  if (!['Cash','GCash','Maya','Credit / Debit Card'].includes(method)) errors.method='Select a valid payment method.';
  if (method==='Cash' && (!Number.isFinite(cash) || cash<total)) errors.received='Cash received must cover the total due.';
  if (method && method!=='Cash' && (String(reference||'').trim().length<4 || String(reference||'').trim().length>100)) errors.reference='Enter a valid verified transaction reference (4–100 characters).';
  return {valid:Object.keys(errors).length===0,errors,total,change:method==='Cash' && Number.isFinite(cash) && Number.isFinite(total) ? Math.max(0,Math.round((cash-total)*100)/100):0};
}
