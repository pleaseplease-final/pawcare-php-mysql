import { vaccineChoiceError } from './vaccineBooking.js';
import { SERVICES, today, plus, nowHM, holidayName, addMin } from './booking.js';

export const isBookingDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;

export function bookingDayConflict(appointments, petId, date, excludeId) {
  return appointments.find(a => a.id !== excludeId && a.petId === petId && a.date === date && !['Cancelled','Rejected','No-show'].includes(a.status));
}

// Early feedback mirrors the server's reservation rules; the server remains
// authoritative for ownership, concurrent bookings and current availability.
export function validateOwnerBooking(v, { pets, vets, appointments, records, editing, date = today(), last = plus(90), time = nowHM(), duration }) {
  const errors = {}, service = SERVICES[v.service];
  if (v.service === 'vaccination') { const error = vaccineChoiceError(v.vaccineId, pets.find(p=>p.id===v.petId)?.species); if(error) errors.vaccineId=error; }
  if (!service) errors.service = 'Choose a service from the list.';
  else if (service.retired && editing?.service !== v.service) errors.service = 'Book a check-up. The veterinarian will advise if surgery or a dental procedure is needed.';
  if (!pets.some(p => p.id === v.petId)) errors.petId = 'Choose one of your pets.';
  if (!vets.some(vet => vet.id === v.vetId)) errors.vetId = 'Choose a current veterinarian.';
  if (!isBookingDate(v.date)) errors.date = 'Choose a valid calendar date.';
  else if (v.date < date || v.date > last) errors.date = 'Choose a date within the next 90 days.';
  else if (holidayName(v.date)) errors.date = `The clinic is closed for ${holidayName(v.date)}. Choose another day.`;
  else if (bookingDayConflict(appointments, v.petId, v.date, editing?.id)) errors.date = 'This pet already has a visit that day. View or reschedule the existing visit.';
  if (!/^([01]\d|2[0-3]):(00|30)$/.test(v.time || '')) errors.time = 'Choose an available time.';
  else if (service && (v.time < '08:00' || addMin(v.time, duration || service.dur) > '17:00')) errors.time = 'Choose a time where the whole visit fits between 8 AM and 5 PM.';
  else if (v.date === date && v.time <= time) errors.time = 'That time has passed. Choose a later slot.';
  if (v.followUpId) {
    const request = records.find(r => r.id === v.followUpId && r.petId === v.petId && r.followUpDate && r.careStatus !== 'Routine care');
    const linked = appointments.some(a => a.id !== editing?.id && a.followUpId === v.followUpId && !['Cancelled','Rejected','No-show'].includes(a.status));
    if (!request || linked) errors.followUpId = linked ? 'This follow-up already has a visit. Review the existing booking.' : 'Choose an outstanding follow-up for this pet.';
  }
  const notes = (v.notes || '').trim();
  if (notes.length > 200) errors.notes = 'Keep notes under 200 characters.';
  else if (notes && !/\p{L}/u.test(notes)) errors.notes = 'Write a few words about your pet’s needs.';
  return errors;
}
