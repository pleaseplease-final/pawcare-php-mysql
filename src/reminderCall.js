export const CALL_OUTCOMES = ['Reached owner','No answer','Callback requested','Contact unavailable'];
export function validateReminderCall(body) {
  const fail = message => { throw Object.assign(new Error(message),{status:400}); };
  if (!body || typeof body.requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.requestId || '')) fail('Refresh the call form before saving.');
  for (const field of ['vaccinationId','petId','ownerId']) if (typeof body[field] !== 'string' || !body[field] || body[field].length > 50) fail('Choose a saved patient and vaccination recall.');
  if (typeof body.dueDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.dueDate || '') || !Number.isFinite(Date.parse(body.dueDate+'T00:00:00Z')) || new Date(body.dueDate+'T00:00:00Z').toISOString().slice(0,10) !== body.dueDate) fail('Choose a valid saved booster date.');
  if (!CALL_OUTCOMES.includes(body.outcome)) fail('Select the call outcome.');
  if (typeof body.notes !== 'string' || body.notes.length > 2000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(body.notes)) fail('Keep call notes within 2,000 characters.');
  if (typeof body.expectedPhone !== 'string' || body.expectedPhone.length > 50) fail('Refresh the saved contact details.');
  if (!body.expectedPhone.trim() && body.outcome !== 'Contact unavailable') fail('No phone is recorded. Choose Contact unavailable or update the owner contact first.');
  return {requestId:body.requestId.toLowerCase(),vaccinationId:body.vaccinationId,petId:body.petId,ownerId:body.ownerId,dueDate:body.dueDate,outcome:body.outcome,notes:body.notes.trim(),expectedPhone:body.expectedPhone.trim()};
}
export function savedReminderCall(data, request) {
  const call=data?.call;
  if (!data?.success || call?.id !== request.requestId || call?.petId !== request.petId || call?.ownerId !== request.ownerId || call?.vaccinationId !== request.vaccinationId || call?.outcome !== request.outcome || !CALL_OUTCOMES.includes(call?.outcome) || !Number.isFinite(Date.parse(call?.createdAt)) || typeof call?.staffName !== 'string' || !call.staffName) throw new Error('The server did not confirm the call record. Reload call history before retrying.');
  return call;
}
