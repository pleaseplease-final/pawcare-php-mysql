import { vaccineChoiceError, vaccineIdFromReason, vaccineReason } from '../src/vaccineBooking.js';

// A requested vaccine is not an administered dose or an invoice line.
export function requestedVaccineReason({ service, vaccineId, reason, species }) {
  const explicit = vaccineId !== undefined;
  if (explicit && (service !== 'vaccination' || typeof vaccineId !== 'string')) {
    throw Object.assign(new Error('Choose a vaccine only for a vaccination visit.'), {status:400});
  }
  if (service !== 'vaccination') return reason;
  const id = explicit ? vaccineId : vaccineIdFromReason(reason);
  // Older clients may submit a generic vaccination purpose.
  if (!id && !explicit) return reason;
  const error = vaccineChoiceError(id, species);
  if (error) throw Object.assign(new Error(error), {status:400});
  return explicit ? vaccineReason(id, id === 'vet-review' ? reason : '') : reason;
}
