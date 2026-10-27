// One definition of "the same record" for the browser forms and the server.
const key = value => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const day = value => String(value ?? '').slice(0, 10);
// "Canine (Dog)" and a legacy "Dog" are the same species. Unlisted animals ("Other") stay distinct by their own name.
const GROUPS = [['canine', /canine|dog/], ['feline', /feline|cat/], ['lagomorph', /lagomorph|rabbit/], ['rodent', /rodent|hamster|guinea|chinchilla|\brat\b|mouse|gerbil/], ['avian', /avian|bird|parrot/]];
const speciesKey = value => { const text = key(value); return GROUPS.find(([, pattern]) => pattern.test(text))?.[0] || text; };

export const phoneKey = value => String(value ?? '').replace(/[^0-9]/g, '').replace(/^09/, '639');
export const emailKey = value => key(value);

export const samePet = (a, b) => key(a.name) === key(b.name) && speciesKey(a.species) === speciesKey(b.species) && day(a.birth) === day(b.birth);

/** Another pet of the same owner with the same name, species and birth date. */
export const findDuplicatePet = (pets, candidate, excludeId = null) =>
  pets.find(pet => pet.id !== excludeId && pet.ownerId === candidate.ownerId && samePet(pet, candidate)) || null;

export const duplicatePetMessage = pet => `${pet.name} (${String(pet.species || '').split(' (')[0]}, born ${day(pet.birth)}) is already registered for this owner. Open that record instead of adding another.`;

/** Other owners that already use this phone number or email. */
export function ownerContactConflicts(owners, { phone, email }, excludeId = null) {
  const others = owners.filter(owner => owner.id !== excludeId);
  return {
    phone: phone && phoneKey(phone) ? others.find(owner => phoneKey(owner.phone) === phoneKey(phone)) || null : null,
    email: email && emailKey(email) ? others.find(owner => emailKey(owner.email) === emailKey(email)) || null : null,
  };
}

/** The same vaccine already recorded as given to the same pet on the same date. */
export const sameDose = (a, b) => a.petId === b.petId && key(a.vaccine) === key(b.vaccine) && day(a.date) === day(b.date);
