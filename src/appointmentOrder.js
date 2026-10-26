import {today} from './booking.js';

// Legacy records can use AM/PM; status is deliberately not a sorting key.
export function appointmentMinutes(time) {
  const match = /^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i.exec(String(time || ''));
  if (!match) return 1440;
  let h=Number(match[1]);const m=Number(match[2]),period=match[3]?.toUpperCase();
  if(m>59 || h>(period?12:23) || (period && h<1)) return 1440;
  if(period) h=h%12+(period==='PM'?12:0);
  return h*60+m;
}
export const chronologicalAppointments = (a,b) => String(a.date || '').localeCompare(String(b.date || '')) || appointmentMinutes(a.time)-appointmentMinutes(b.time) || String(a.id || '').localeCompare(String(b.id || ''));
export function upcomingAppointments(a,b,date=today()) {
  const aUpcoming=!!a.date && a.date>=date,bUpcoming=!!b.date && b.date>=date;
  if(aUpcoming!==bUpcoming)return aUpcoming?-1:1;
  return aUpcoming?chronologicalAppointments(a,b):chronologicalAppointments(b,a);
}
