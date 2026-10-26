export const isVerifiedPet = pet => !pet.registrationStatus || pet.registrationStatus === 'Verified';
export function needsFirstPetSetup(db,me) {
  if(me.role!=='owner') return false;
  const owner=db.owners.find(o=>o.id===me.ownerId);
  return !!owner && !owner.firstPetRegisteredAt && !db.pets.some(p=>p.ownerId===me.ownerId) && !db.petRequests.some(r=>r.ownerId===me.ownerId);
}
export function registrationPatient(p) {
  return {priorVaccines:p.prior_vaccines || [],externalClinicNotes:p.external_clinic_notes || '',referenceRevision:p.reference_revision || 0,id:p.id,ownerId:p.owner_id,name:p.name,species:p.species,speciesOther:p.species_other || '',breed:p.breed || '',sex:p.sex,
    birth:p.birth?.slice(0,10),weight:Number(p.weight),color:p.color || '',neutered:p.neutered || 'Not sure',notes:p.notes || '',photo:p.photo || '',
    dentalOcclusion:p.dental_occlusion || '',registrationStatus:p.registration_status, vaccinationCardId:p.vaccination_card_id || '',allergies:p.allergies || [],weights:[]};
}
