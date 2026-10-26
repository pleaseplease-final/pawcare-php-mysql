import {normalizeSpecies} from './preventiveSchedule.js';

// Plausible ceilings by species. A typo (45 kg hamster, a 1990 kitten) is caught in the form
// and again on the server. Other species only keep the general 120 kg / 40 year limits.
export const PET_LIMITS = {Canine: {kg: 120, years: 30}, Feline: {kg: 15, years: 30}, Lagomorph: {kg: 10, years: 15}, Rodent: {kg: 3, years: 10}, Avian: {kg: 5, years: 80}};
const yearsBefore = (today, years) => `${Number(today.slice(0, 4)) - years}${today.slice(4)}`;

export function petPlausibility({species, weight, birth, today}) {
  const kind = normalizeSpecies(species), limit = PET_LIMITS[kind], errors = {};
  if (!limit) return errors;
  const name = kind.toLowerCase();
  if (Number(weight) > limit.kg) errors.weight = `That is heavier than expected for a ${name} (about ${limit.kg} kg at most). Check that the weight is in kg.`;
  if (birth && today && birth < yearsBefore(today, limit.years)) errors.birth = `A ${name} older than ${limit.years} years is unlikely. Check the year.`;
  return errors;
}
