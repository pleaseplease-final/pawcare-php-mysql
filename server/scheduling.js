import { SERVICES, holidayName } from '../src/booking.js';

export const clinicClock = (now = new Date()) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now).map(p => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
};
export const shiftDate = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
export const validDate = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(Date.parse(d)) && new Date(d).toISOString().slice(0, 10) === d;
export function minutes(time) {
  const match = /^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i.exec(String(time));
  if (!match) return NaN;
  let h = +match[1]; const m = +match[2], meridian = match[3]?.toUpperCase();
  if (m > 59 || h > (meridian ? 12 : 23) || (meridian && h < 1)) return NaN;
  if (meridian) h = h % 12 + (meridian === 'PM' ? 12 : 0);
  return h * 60 + m;
}
export const inferBookingService = reason => /surgery|dental/i.test(reason) ? 'surgery' : /groom/i.test(reason) ? 'grooming' : /deworm/i.test(reason) ? 'deworming' : /vaccin|rabies|booster/i.test(reason) ? 'vaccination' : 'checkup';
export const bookingError = (message, status = 400) => Object.assign(new Error(message), { status });
export function validateSchedule(v, now = new Date(), duration = SERVICES[v.service]?.dur) {
  const clock = clinicClock(now);
  if (!duration) throw bookingError('Choose a service from the list.');
  if (!validDate(v.date)) throw bookingError('Enter a valid appointment date.');
  if (v.date < clock.date || v.date > shiftDate(clock.date, 90)) throw bookingError('Choose a date within the next 90 days.');
  if (holidayName(v.date)) throw bookingError(`The clinic is closed for ${holidayName(v.date)}. Choose another date.`);
  if (!/^\d{2}:\d{2}$/.test(v.time || '')) throw bookingError('Choose a valid time slot.');
  const start = minutes(v.time);
  if (!Number.isFinite(start) || start % 30 || start < 480 || start + duration > 1020) throw bookingError('Choose a time where the whole visit fits between 08:00 and 17:00.');
  if (v.date === clock.date && v.time <= clock.time) throw bookingError('That time has passed. Choose a later slot.');
  return duration;
}
export function availableSlots(rows, v, now = new Date(), savedDuration) {
  const slots = [];
  if (rows.some(a => a.id !== v.excludeId && a.booking_kind !== "walk-in" && !["Cancelled", "Rejected", "No-show"].includes(a.status) && !Number.isFinite(minutes(a.time)))) return slots;
  for (let m = 480; m < 1020; m += 30) {
    const time = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    try {
      const duration = validateSchedule({ ...v, time }, now, savedDuration);
      if (!rows.some(a => a.id !== v.excludeId && a.booking_kind !== 'walk-in' && !['Cancelled', 'Rejected', 'No-show'].includes(a.status) && m < minutes(a.time) + (a.duration_minutes || 30) && minutes(a.time) < m + duration)) slots.push(time);
    } catch { /* Invalid dates and slots have no availability. */ }
  }
  return slots;
}
// All reservation writes serialize on the same transaction lock. Row checks run after
// the lock is acquired, so concurrent bookings cannot both accept an opening.
export async function lockSchedule(client) {
  await client.query("SELECT pg_advisory_xact_lock(726341901)");
}
export async function assertAvailable(client, v, excludeId, savedDuration) {
  // Approval may supply a persisted duration; booking callers use the service catalog.
  const now = new Date();
  const duration = validateSchedule(v, now, savedDuration);
  const rows = v.vetAliases
    ? (await client.query("SELECT * FROM appointments WHERE date = $1 AND (vet_id = ANY($2::varchar[]) OR pet_id = $3)",[v.date,v.vetAliases,v.petId])).rows
    : (await client.query("SELECT * FROM appointments WHERE date = $1 AND (vet_id = $2 OR pet_id = $3)", [v.date, v.vetId, v.petId])).rows;
  const other = rows.filter(a => a.id !== excludeId && !['Cancelled', 'Rejected', 'No-show'].includes(a.status));
  if (other.some(a => a.pet_id === v.petId)) throw bookingError('This pet already has a visit that day. Review or reschedule that visit.', 409);
  if (!availableSlots(other.filter(a => (v.vetAliases || [v.vetId]).includes(a.vet_id)), { ...v, excludeId }, now, savedDuration).includes(v.time)) throw bookingError('That slot was just taken. Choose another available time.', 409);
  return duration;
}
