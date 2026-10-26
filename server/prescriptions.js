import { readFileSync } from 'node:fs';
import { query } from './db.js';
import { priceCatalog } from './priceCatalog.js';
import { calculateSupply, prescriptionText } from '../src/prescription.js';
let ready;
export function ensurePrescriptionSchema() {
  if (!ready) ready = query(readFileSync(new URL('./database/prescriptions.sql', import.meta.url), 'utf8')).catch(e => { ready = undefined; throw e; });
  return ready;
}
export function normalizePrescription(input = [], notes = '', catalog = priceCatalog()) {
  if (!Array.isArray(input) || input.length > 30 || typeof notes !== 'string' || notes.length > 3000) throw Object.assign(new Error('Use at most 30 prescription products and 3000 characters of additional instructions.'), { status: 400 });
  const seen = new Set();
  const items = input.map(row => {
    const product = catalog.find(p => p.id === row?.catalogId);
    if (!product || !(product.id.startsWith('product_') || product.requiresPrescription) || seen.has(product.id)) throw Object.assign(new Error('Select each prescription product once from the current catalog.'), { status: 400 });
    seen.add(product.id);
    let instructions = row.instructions, quantity = row.quantity, dose;
    if (row.dose != null) {
      try {
        const result = calculateSupply(row.dose);
        if (quantity !== result.quantity) throw new Error('The supply quantity does not match the prescription calculation.');
        instructions = result.directions;
        const {amount, unit, route, timesPerDay, days, unitsPerItem} = row.dose;
        dose = {amount, unit, route, timesPerDay, days, unitsPerItem};
      } catch (e) { throw Object.assign(new Error(e.message), {status: 400}); }
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1000 || typeof instructions !== 'string' || !instructions.trim() || instructions.length > 1000) throw Object.assign(new Error('Each prescription needs instructions and a whole supply quantity from 1 to 1000.'), {status: 400});
    return { catalogId: product.id, name: product.name, category: product.category, price: product.price, unit: product.unit || 'item / package', quantity, instructions: instructions.trim(), ...(dose ? {dose} : {}) };
  });
  const text = prescriptionText(items, notes);
  if (text.length > 10000) throw Object.assign(new Error('The complete prescription is too long (maximum 10000 characters).'), {status: 400});
  return {items, text};
}
export function prescriptionInvoice(items) {
  return items.map(p => ({catalogId:p.catalogId, name:p.name, category:p.category, price:p.price, qty:p.quantity}));
}
// Staff may dispense less than prescribed, but cannot add unprescribed medicines
// or prescription diets or increase their quantity by splitting invoice lines.
export function validatePrescriptionSale(invoice, prescribed, catalog = priceCatalog({includeRetired: true})) {
  const totals = new Map();
  for (const line of invoice) totals.set(line.catalogId, (totals.get(line.catalogId) || 0) + line.qty);
  for (const [id, quantity] of totals) {
    if (!catalog.find(p => p.id === id)?.requiresPrescription) continue;
    const allowed = prescribed.find(p => p.catalogId === id);
    if (!allowed || quantity > allowed.quantity) return 'Medicines and prescription diets require a recorded product prescription for this visit; quantities cannot exceed the prescribed supply.';
  }
  return null;
}
