import { approvedRegistration } from './registrationReview.js';
import { clinicRequest } from './clinicApi.js';
import { intakeVisitSnapshot, sameIntakeVisit } from './intakeVisit.js';

// Capture the registration revision shown alongside the visit. Server rejects stale review.
export function approvalVisit(db, visit) {
  const request = (db.petRequests || []).find(r => r.petId === visit.petId && r.status === 'Pending');
  return {...visit,...(request ? {expectedRegistration:{id:request.id,revision:request.revision ?? 0}} : {})};
}

// Share the lock across calendar, dashboard and card actions using the same store.
const pending = new WeakMap();
export async function changeAppointmentStatus(setDb, id, status, onError = () => {}, expected, request = clinicRequest, details = {}) {
  let visits = pending.get(setDb);
  if (!visits) { visits = new Set(); pending.set(setDb, visits); }
  if (visits.has(id)) return false;
  visits.add(id);
  try {
    const response = await request('PATCH', `/api/appointments/${id}/status`, {
      ...details, status, ...(status === 'Scheduled' && expected?.expectedRegistration ? {expectedRegistration:expected.expectedRegistration} : {}), ...(expected ? {expectedVisit:intakeVisitSnapshot(expected)} : {})
    });
    const saved = intakeVisitSnapshot(response?.appointment);
    if (!response?.success || saved?.id !== id || saved.status !== status || (expected && saved.petId !== expected.petId)) {
      throw new Error('The server did not confirm the appointment change. Refresh clinic records before retrying.');
    }
    const registration = response.registration ? approvedRegistration({success:true,...response.registration}) : null;
    if (status === 'Scheduled' && expected?.expectedRegistration && !registration) throw new Error('The clinic did not return the linked registration approval. Refresh clinic records before retrying.');
    if (registration && registration.pet.id !== saved.petId) throw new Error('The clinic returned a different patient registration. Refresh before continuing.');
    const approval = {approvedAt:response.appointment.approvedAt ?? response.appointment.approved_at ?? null, approvedBy:response.appointment.approvedBy ?? response.appointment.approved_by ?? '', approvedByUserId:response.appointment.approvedByUserId ?? response.appointment.approved_by_user_id ?? ''};
    const fields = Object.fromEntries(Object.entries(saved).filter(([,value]) => value !== undefined));
    setDb(previous => {
      const currentRequest = registration && (previous.petRequests || []).find(r=>r.id===registration.request.id);
      const applyRegistration = registration && (!currentRequest || (currentRequest.revision ?? 0)<=registration.request.revision);
      const vacc = applyRegistration ? [...registration.vacc,...(previous.vacc || previous.vaccs || []).filter(v=>!registration.vacc.some(saved=>saved.id===v.id))] : null;
      return {...previous,...(applyRegistration ? {
        pets:(previous.pets || []).map(p=>p.id===registration.pet.id && p.registrationStatus==='Pending' ? {...p,...registration.pet,weights:p.weights || []} : p),
        petRequests:(previous.petRequests || []).map(r=>r.id===registration.request.id ? registration.request : r),
        vacc, vaccs:vacc
      } : {}),appts:previous.appts.map(visit => {
        if (visit.id !== id || (expected && !sameIntakeVisit(visit,expected))) return visit;
        return {...visit,...fields,...(status === 'Scheduled' ? approval : {}),...(['Cancelled','Rejected'].includes(status) ? {cancelReason:response.appointment.cancelReason ?? response.appointment.cancel_reason} : {})};
      })};
    });
    return true;
  } catch (error) {
    onError(error.message);
    return false;
  } finally {
    visits.delete(id);
    if (!visits.size) pending.delete(setDb);
  }
}
