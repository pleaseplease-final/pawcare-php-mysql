// The veterinarian decides whether a pet should have surgery or a dental procedure.
// A booking only requests an assessment; nothing here is inferred from the booking alone.
export const PROCEDURE_TYPES = ['Surgery', 'Dental procedure'];
export const PROCEDURE_DECISIONS = {
  'Suitable - book the procedure': {followUp: 'Follow-up required', days: 7, label: 'Procedure booking'},
  'Pre-operative tests needed first': {followUp: 'Recheck required', days: 3, label: 'Pre-operative tests and recheck'},
  'Not suitable now - deferred': {followUp: null},
  'Owner declined': {followUp: null},
  'Not needed': {followUp: null},
};
export const PRE_OP_TEMPLATE = 'Withhold food as the veterinarian directs before the procedure, bring any current medicines, and arrive on time. The clinic confirms preparation and owner consent before the procedure.';

// Surgery bookings are only an assessment slot, so the vet must record a decision for them.
export const procedureRequired = (appointment, consultation) =>
  consultation && appointment?.service === 'surgery' && !/follow[ -]?up|re[ -]?check/i.test(appointment.reason || '');

export function procedureNote(form) {
  if (!form.procedureDecision) return '';
  const type = form.procedureType ? `${form.procedureType}: ` : '';
  const notes = String(form.procedureNotes || '').trim();
  return `\nProcedure decision - ${type}${form.procedureDecision}.${notes ? ` Pre-procedure notes: ${notes}` : ''}`;
}

export function procedureErrors(form) {
  const errors = {};
  if (form.procedureRequired && !form.procedureDecision) errors.procedureDecision = 'Record your decision for this surgery / dental assessment.';
  else if (form.procedureDecision && !Object.hasOwn(PROCEDURE_DECISIONS, form.procedureDecision)) errors.procedureDecision = 'Choose a decision from the list.';
  if (form.procedureDecision && form.procedureDecision !== 'Not needed' && !PROCEDURE_TYPES.includes(form.procedureType)) errors.procedureType = 'Choose surgery or dental procedure.';
  if (String(form.procedureNotes || '').length > 1000) errors.procedureNotes = 'Use no more than 1,000 characters.';
  return errors;
}
