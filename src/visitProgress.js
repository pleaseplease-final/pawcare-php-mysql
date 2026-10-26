import {today} from './booking.js';
// Describe the next responsible role from saved visit state, including hospital holds.
export function visitNextStep(visit,date=today()) {
  if(['Cancelled','Rejected','No-show'].includes(visit.status))return {by:'Owner / reception',text:'Review the reason and arrange another visit if needed.'};
  if(visit.admissionStatus==='Admitted')return {by:'Veterinarian and assistant',text:visit.status==='Completed' ? 'Continue hospital care. The veterinarian approves discharge before checkout.' : 'Continue hospital care. Finalize visit notes and approve discharge before checkout.'};
  if(visit.admissionStatus==='Ready for discharge')return visit.billingStatus==='Paid'
    ? {by:'Reception',text:'Confirm the pet’s release to the owner.'}
    : {by:'Reception',text:'Finalize the bill and record payment before release.'};
  if(visit.date && visit.date<date && ['Pending Approval','Scheduled'].includes(visit.status))return {by:'Reception',text:'Review the missed arrival; reschedule or close the request as appropriate.'};
  if(visit.status==='Pending Approval')return {by:'Reception',text:'Review the visit request and any pending pet registration.'};
  if(visit.status==='Scheduled')return {by:'Reception',text:'Confirm arrival and record measured intake.'};
  if(visit.status==='Checked-in')return {by:'Assigned veterinarian',text:'Review intake and start the visit.'};
  if(visit.status==='In consultation')return {by:'Assigned veterinarian',text:'Finish and save the visit record.'};
  if(visit.status==='Completed')return visit.billingStatus==='Paid'
    ? {by:'Owner',text:'Review the paid invoice, visit notes and any follow-up instructions.'}
    : {by:'Reception',text:'Finalize the bill and record payment.'};
  return {by:'Reception',text:'Review this visit’s current status.'};
}
