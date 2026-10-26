// Clinic state can link a patient to an owner record or its account ID.
// Missing links must never match another record's absent userId.
export function ownerForPet(owners, pet) {
  if (!pet?.ownerId) return null;
  return owners.find(owner => owner.id === pet.ownerId || owner.userId === pet.ownerId) || null;
}
export function petsForOwner(pets, owner) {
  if (!owner?.id) return [];
  return pets.filter(pet => pet.ownerId === owner.id || (!!owner.userId && pet.ownerId === owner.userId));
}
