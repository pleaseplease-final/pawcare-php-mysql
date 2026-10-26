import {paymentDate, paymentTime, paymentMethod, money} from './assistantWorkflow.js';
import {ownerBill} from './ownerBilling.js';

// Spreadsheet-safe cell: quotes values with commas or newlines and defuses formulas.
export const csvCell = value => {
  const raw = String(value ?? '');
  const text = /^[\s]*[=+@-]/.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
const METHOD = {cash: 'Cash', gcash: 'GCash', maya: 'Maya', card: 'Credit / Debit Card', other: 'Other', unrecorded: 'Not recorded'};

// One row per settled visit, then totals worked out from the same rows.
export function salesCsv({visits, db, label, collections}) {
  const rows = [['Date paid', 'Time paid', 'Visit reference', 'Patient', 'Owner', 'Items', 'Payment method', 'Reference', 'Amount (PHP)']];
  let cents = 0;
  for (const a of visits) {
    const pet = (db.pets || []).find(p => p.id === a.petId) || {}, owner = (db.owners || []).find(o => o.id === pet.ownerId) || {};
    const bill = ownerBill(a), amount = bill.amount;
    if (amount !== null) cents += Math.round(amount * 100);
    rows.push([paymentDate(a.paidAt) || 'Not recorded', paymentTime(a.paidAt), a.id, pet.name || a.petId || '', owner.name || '',
      bill.items.map(i => `${i.qty} x ${i.name}`).join('; '), METHOD[paymentMethod(a.paymentMethod)], a.paymentReference || '', amount === null ? 'Not recorded' : amount.toFixed(2)]);
  }
  rows.push([], ['Summary', 'Value'], ['Report', label], ['Payments listed', String(visits.length)], ['Total of listed payments', (cents / 100).toFixed(2)]);
  if (collections) for (const [key, name] of Object.entries(METHOD)) if (collections.methods[key]) rows.push([`${name} (all payments that day)`, collections.methods[key].toFixed(2)]);
  if (collections && collections.total !== null) rows.push(['All collections that day', money(collections.total).replace('₱', '')]);
  return '\uFEFF' + rows.map(r => r.map(csvCell).join(',')).join('\r\n');
}
