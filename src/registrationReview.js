const dateOnly = value => typeof value === 'string' ? value.slice(0, 10) : '';

// Keep an open review tied to the version the assistant actually inspected.
export function registrationReviewChanged(request, requests = []) {
  const current = requests.find(r => r.id === request.id);
  return !current || current.status !== request.status || (current.revision ?? 0) !== (request.revision ?? 0);
}
export function reviewedRequest(row) {
  return {
    priorVaccines:row.prior_vaccines || [],externalClinicNotes:row.external_clinic_notes || '',id:row.id, ownerId:row.owner_id, name:row.name, species:row.species,
    speciesOther:row.species_other || '', breed:row.breed || '', sex:row.sex,
    birth:dateOnly(row.birth), weight:Number(row.weight), color:row.color || '',
    neutered:row.neutered || '', notes:row.notes || '', photo:row.photo || '',
    dentalOcclusion:row.dental_occlusion || '', revision:row.revision ?? 0,
    status:row.status, declineReason:row.decline_reason || '', petId:row.pet_id || '',
    cardId:row.card_id || '', requestedAt:dateOnly(row.requested_at),
    approvedAt:dateOnly(row.approved_at) || null, approvedBy:row.approved_by || '', reviewedAt:row.reviewed_at || null, approvedByUserId:row.approved_by_user_id || ''
  };
}
export function approvedRegistration(data) {
  if (!data?.success || !data.pet?.id || !data.request?.id || data.request.status !== 'Approved' || !data.pet.vaccination_card_id) throw new Error('The clinic did not confirm approval. Refresh the request before continuing.');
  const p = data.pet;
  return {
    request:reviewedRequest(data.request),
    cardId:p.vaccination_card_id,
    pet:{priorVaccines:p.prior_vaccines || [],externalClinicNotes:p.external_clinic_notes || '',referenceRevision:p.reference_revision || 0,id:p.id, ownerId:p.owner_id,registrationStatus:p.registration_status || 'Verified', name:p.name, species:p.species, speciesOther:p.species_other || '',
      breed:p.breed || '', sex:p.sex, birth:dateOnly(p.birth), weight:Number(p.weight),weightOrigin:p.weight_origin || 'registration',
      color:p.color || '', neutered:p.neutered || 'Not sure', allergies:p.allergies || [],
      vaccinationCardId:p.vaccination_card_id, notes:p.notes || '', photo:p.photo || '',
      dentalOcclusion:p.dental_occlusion || '', weights:[]},
    vacc:(data.vaccs || []).map(v => ({id:v.id, petId:v.pet_id, cardId:v.card_id || p.vaccination_card_id,
      vaccine:v.vaccine, brand:v.brand || '', batch:v.batch || '', date:dateOnly(v.date),
      createdAt:v.created_at, nextDue:dateOnly(v.next_due) || null, doseNo:v.dose_no,
      doseOf:v.dose_of, done:Boolean(v.done), automated:Boolean(v.automated),
      protocolType:v.protocol_type || '', notes:v.notes || '', vetId:v.vet_id || '', recordedBy:v.recorded_by || ''})),
    appointment:data.appointment || null
  };
}
