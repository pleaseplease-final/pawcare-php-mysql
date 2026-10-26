// Status / category filter and summary figures for the admin reports.
// Everything is computed from the saved records shown in the report, never typed in.
import {currentVaccinationDue, vaccinationStatus} from './ownerVaccination.js';
import {normalizeSpecies} from './preventiveSchedule.js';
import {today} from './booking.js';

const money = cents => `₱${(cents / 100).toLocaleString('en-PH', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
const cents = value => { const n = Math.round(Number(value) * 100); return Number.isSafeInteger(n) && n > 0 ? n : 0; };
const tally = (list, keyOf) => {
  const counts = new Map();
  for (const item of list) { const key = keyOf(item) || 'Not recorded'; counts.set(key, (counts.get(key) || 0) + 1); }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
};
const vetName = (db, id) => (db.vets || []).find(v => v.id === id)?.name || (id ? 'Veterinarian not recorded' : 'Unassigned');

// What the "Status / category" filter matches for each report.
export function categoryOf(type, item, db, due = currentVaccinationDue(db.vacc || [])) {
  if (type === 'appts') return item.status || 'Pending Approval';
  if (type === 'vacc') return vaccinationStatus(item, due, today());
  if (type === 'records') return item.careStatus || 'Routine care';
  if (type === 'pets') return normalizeSpecies(item.species);
  if (type === 'sales') return item.paymentMethod?.trim() || 'Not recorded';
  return '';
}
export const CATEGORY_LABEL = {appts: 'Status', vacc: 'Status', records: 'Care status', pets: 'Species', sales: 'Payment method'};

export function categoryOptions(type, list, db) {
  const due = currentVaccinationDue(db.vacc || []);
  return [...new Set(list.map(item => categoryOf(type, item, db, due)))].sort();
}

// Rows of [label, value] for the summary strip, the printout and the CSV footer.
export function summarize(type, list, db) {
  const due = currentVaccinationDue(db.vacc || []);
  const rows = [['Matching records', String(list.length)]];
  if (!list.length) return rows;
  const count = key => tally(list, item => categoryOf(type, item, db, due)).filter(([k]) => k === key)[0]?.[1] || 0;
  if (type === 'appts') {
    for (const [status, n] of tally(list, item => item.status)) rows.push([status, String(n)]);
    const closed = count('Completed') + count('No-show') + count('Cancelled') + count('Rejected');
    if (closed) rows.push(['Completion rate (of closed visits)', `${Math.round(count('Completed') / closed * 100)}%`]);
    if (count('No-show') + count('Completed')) rows.push(['No-show rate (of arrivals expected)', `${Math.round(count('No-show') / (count('No-show') + count('Completed')) * 100)}%`]);
    const paid = list.filter(a => a.billingStatus === 'Paid');
    rows.push(['Paid visits', String(paid.length)], ['Paid amount', money(paid.reduce((sum, a) => sum + cents(a.amount), 0))]);
    const unpaid = list.filter(a => a.status === 'Completed' && a.billingStatus !== 'Paid');
    if (unpaid.length) rows.push(['Completed, awaiting payment', String(unpaid.length)]);
  } else if (type === 'vacc') {
    for (const [status, n] of tally(list, item => categoryOf(type, item, db, due))) rows.push([status, String(n)]);
    const top = tally(list, item => item.vaccine).slice(0, 3).map(([k, n]) => `${k} (${n})`).join(', ');
    if (top) rows.push(['Most recorded', top]);
    rows.push(['Patients covered', String(new Set(list.map(item => item.petId)).size)]);
  } else if (type === 'records') {
    rows.push(['Patients seen', String(new Set(list.map(item => item.petId)).size)]);
    rows.push(['With a follow-up requested', String(list.filter(item => item.careStatus && item.careStatus !== 'Routine care').length)]);
    for (const [name, n] of tally(list, item => vetName(db, item.vetId))) rows.push([`Seen by ${name}`, String(n)]);
  } else if (type === 'sales') {
    const total = list.reduce((sum, a) => sum + cents(a.amount), 0);
    rows.push(['Total collected', money(total)], ['Average per paid visit', money(Math.round(total / list.length))]);
    for (const [method, n] of tally(list, item => categoryOf(type, item, db, due))) {
      rows.push([`${method} payments`, `${n} · ${money(list.filter(a => categoryOf(type, a, db, due) === method).reduce((sum, a) => sum + cents(a.amount), 0))}`]);
    }
    rows.push(['Items sold', String(list.reduce((sum, a) => sum + (Array.isArray(a.invoiceItems) ? a.invoiceItems.reduce((n, i) => n + (Number(i.qty) || 0), 0) : 0), 0))]);
  } else if (type === 'pets') {
    for (const [species, n] of tally(list, item => normalizeSpecies(item.species))) rows.push([species, String(n)]);
    const weights = list.map(item => Number(item.weight)).filter(w => Number.isFinite(w) && w > 0);
    if (weights.length) rows.push(['Average recorded weight', `${(weights.reduce((a, b) => a + b, 0) / weights.length).toFixed(1)} kg`]);
    rows.push(['Owners represented', String(new Set(list.map(item => item.ownerId)).size)]);
  }
  return rows;
}
