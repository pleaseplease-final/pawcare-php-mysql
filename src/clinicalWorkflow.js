// Calendar arithmetic uses date-only UTC values, independent of browser timezone.
export function boosterDate(date, intervalDays) {
  if (!['string','number'].includes(typeof intervalDays)) return '';
  const d = new Date(`${date}T00:00:00Z`);
  const days = Number(intervalDays);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !Number.isFinite(d.getTime()) || d.toISOString().slice(0,10) !== date || !Number.isInteger(days) || days < 1 || days > 3650) return '';
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0,10);
}
export const VACCINE_SERVICE = {'Anti-rabies':'srv_rabies','5-in-1':'srv_dhpp','Feline 4-in-1':'srv_fvrcp','Deworming':'srv_deworm'};
export function followUpVisit(record, appts) {
  const linked = appts.filter(a => a.followUpId === record.id);
  return linked.find(a => a.status === 'Completed') || linked.find(a => !['Cancelled','Rejected','No-show'].includes(a.status)) || linked.sort((a,b) => (b.date+b.time).localeCompare(a.date+a.time))[0];
}
export function openFollowUps(db, petId) {
  return db.records.filter(r => r.followUpDate && r.careStatus !== 'Routine care' && (!petId || r.petId === petId) && !['Completed','Pending Approval','Scheduled','Checked-in','In consultation'].includes(followUpVisit(r, db.appts)?.status));
}
