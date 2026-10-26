import {careForProfile,elapsedDays} from './visitCare.js';
import {profileForVisit} from './visitProfiles.js';
import {VACCINE_CHOICES,vaccineIdFromReason} from './vaccineBooking.js';
import { serviceOf } from './booking.js';
import { boosterDate, VACCINE_SERVICE } from './clinicalWorkflow.js';
import { procedureRequired } from './procedureDecision.js';

export function visitFormType(appointment) {
  const service = serviceOf(appointment);
  if (service === 'deworming' || service === 'vaccination' && /deworm/i.test(appointment.reason || '')) return 'deworming';
  if (service === 'vaccination') return 'vaccination';
  if (service === 'grooming' || !appointment.service && /groom|sanitary/i.test(appointment.reason || '')) return 'grooming';
  return 'consultation';
}
export const visitProfile = appointment => profileForVisit(appointment,visitFormType(appointment));
export const visitFormTitle = type => ({vaccination:'Vaccination record',deworming:'Deworming record',grooming:'Grooming record',consultation:'SOAP Consultation'}[type]);
export function serviceMatchesVisit(service, type) {
  const preventive = Object.values(VACCINE_SERVICE).includes(service.id);
  if (type === 'vaccination') return preventive && service.id !== VACCINE_SERVICE.Deworming;
  if (type === 'deworming') return service.id === VACCINE_SERVICE.Deworming;
  if (type === 'grooming') return service.id === 'srv_groom';
  return !preventive && service.id !== 'srv_groom';
}
export function intakeSummary(vitals) {
  return `Temp: ${vitals?.temp != null ? `${vitals.temp}°C` : 'not measured'}${vitals?.tempAnalysis?.label ? ` (${vitals.tempAnalysis.label})` : ''}, Weight: ${vitals?.weight != null ? `${vitals.weight} kg` : 'not measured'}${vitals?.weightAnalysis?.label ? ` (${vitals.weightAnalysis.label})` : ''}.`;
}
// Keep the durable clinical record format used by history, checkout and PDFs.
// Hidden fields from an older draft must not add unrelated care or charges.
export function visitClinicalFields(form, appointment, performedServices = []) {
  const type = visitFormType(appointment), consultation = type === 'consultation';
  const summary = intakeSummary(appointment.intakeVitals);
  const notes = (form.objective || '').trim();
  const profile=visitProfile(appointment);
  const careOptions=careForProfile(profile);
  const selectedPlan=consultation && careOptions.plans.includes(form.carePlanChoice) ? form.carePlanChoice : '';
  const duration=careOptions.onset ? elapsedDays(form.symptomStart,form.date) : null;
  const answers=Object.fromEntries(profile.fields.map(({key})=>[key,form.visitAnswers?.[key] ?? '']));
  const history=profile.fields.filter(({key})=>typeof answers[key]==='string' && answers[key].trim()).map(({key,label})=>`${label}: ${answers[key].trim()}`).join('\n');
  const preventive=['vaccination','deworming'].includes(type);
  const confirmed=preventive && form.giveVaccine || type==='grooming' && performedServices.includes('srv_groom');
  const care=type==='deworming' ? 'Deworming' : type==='vaccination' ? (form.vaccine || 'Vaccination') : 'Grooming';
  return {...form,
    visitAnswers:answers,
    symptomStart:careOptions.onset ? form.symptomStart : '',
    carePlanInvalid:consultation && !!form.carePlanChoice && !selectedPlan,
    diagnosis:confirmed ? [`Veterinarian confirmed suitability for ${type}.`,form.diagnosis].filter(Boolean).join('\n') : form.diagnosis,
    treatment:confirmed ? [
      `${care} ${preventive ? 'administered' : 'provided'} on ${form.date}${preventive && form.brand?.trim() ? ` using ${form.brand.trim()}` : ''}.`,
      preventive && boosterDate(form.date,form.intervalDays) ? `Next ${type} due ${boosterDate(form.date,form.intervalDays)} (${form.intervalDays} days after administration).` : '',
      form.treatment,
    ].filter(Boolean).join('\n') : [selectedPlan,form.treatment].filter(Boolean).join('\n'),
    symptoms:[consultation ? form.symptoms : `Reason for visit: ${appointment.reason || visitFormTitle(type)}`,history,duration!==null ? `Symptoms began ${form.symptomStart} (${duration} day(s) before this visit).` : ''].filter(Boolean).join('\n'),
    objective:notes.startsWith(summary) ? notes : [summary,notes].filter(Boolean).join('\n'),
    giveVaccine:['vaccination','deworming'].includes(type) && form.giveVaccine,
    scheduleFollowUp:consultation && form.scheduleFollowUp,
    procedureRequired:procedureRequired(appointment,consultation),
    prescription:consultation ? form.prescription : '',
  };
}

export function initialVaccineForVisit(appointment) {
  if (visitFormType(appointment)==='deworming') return 'Deworming';
  const choice=VACCINE_CHOICES.find(v=>v.id===vaccineIdFromReason(appointment.reason));
  if (!choice || choice.id==='vet-review') return '';
  return choice.id==='bordetella' ? 'Kennel cough' : choice.name;
}
