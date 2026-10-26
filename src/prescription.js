import { DOSE_UNITS, DOSE_ROUTES } from "./clinicalGuide.js";
// Supply arithmetic only: clinical choices and package contents are entered by
// the veterinarian. Never infer a dose from weight, diagnosis or product name.
export function calculateSupply(dose) {
  if (!dose || typeof dose !== 'object') throw new Error('Complete the supply calculation.');
  const { amount, timesPerDay, days, unitsPerItem, unit, route } = dose;
  if (![amount, timesPerDay, days, unitsPerItem].every(n => typeof n === 'number' && Number.isFinite(n) && n > 0) || amount > 10000 || unitsPerItem > 100000 || !Number.isInteger(timesPerDay) || timesPerDay > 24 || !Number.isInteger(days) || days > 365) throw new Error('Enter a positive dose and package contents, 1–24 doses/day and 1–365 days.');
  if (!['tablet', 'capsule', 'mL', 'g', 'drop'].includes(unit) || !['by mouth', 'on skin', 'in ear', 'in eye'].includes(route)) throw new Error('Select the dose unit and route.');
  const scale = 10000;
  const scaledAmount = Math.round(amount * scale), scaledPackage = Math.round(unitsPerItem * scale);
  if (scaledAmount < 1 || scaledPackage < 1 || Math.abs(amount * scale - scaledAmount) > 0.000001 || Math.abs(unitsPerItem * scale - scaledPackage) > 0.000001) throw new Error('Use at most four decimal places for dose and package contents.');
  const scaledTotal = scaledAmount * timesPerDay * days;
  const totalUnits = scaledTotal / scale;
  const quantity = Math.ceil(scaledTotal / scaledPackage);
  if (quantity < 1 || quantity > 1000) throw new Error('The calculated supply must be 1–1000 items/packages.');
  return { quantity, totalUnits, directions: `${amount} ${unit} ${route}, ${timesPerDay} time(s) per day for ${days} day(s).` };
}
export function prescriptionText(items, notes = '') {
  const lines = items.map(p => `${p.name} — ${p.instructions} Supply: ${p.quantity} ${p.unit || 'item / package'}${p.dose ? ` (${p.dose.unitsPerItem} ${p.dose.unit} per item/package)` : ''}.`);
  if (notes.trim()) lines.push(notes.trim());
  return lines.join('\n');
}

// Old drafts may contain a calculator entry. Present it as editable directions
// and quantity; an unfinished calculation falls back to manual entry.
export function editablePrescription(item) {
  if (!item.dose) return item;
  try {
    const supply = calculateSupply(item.dose);
    return {...item,quantity:supply.quantity,instructions:supply.directions,dose:null};
  } catch { return {...item,dose:null}; }
}

// Inline checks shared by the builder (per field) and the finalize step.
export function rxLineErrors(item) {
  const e = {}, d = item.dose;
  if (d) {
    const amount = Number(d.amount), times = Number(d.timesPerDay), days = Number(d.days), pack = Number(d.unitsPerItem);
    const decimals = n => Math.abs(n * 10000 - Math.round(n * 10000)) < 0.000001;
    if (d.amount === '' || !(amount > 0) || amount > 10000) e.amount = 'Enter the dose amount (more than 0, up to 10,000).';
    else if (!decimals(amount)) e.amount = 'Use at most four decimal places.';
    if (!DOSE_UNITS.includes(d.unit)) e.unit = 'Choose the dose unit.';
    if (!DOSE_ROUTES.includes(d.route)) e.route = 'Choose how it is given.';
    if (!Number.isInteger(times) || times < 1 || times > 24) e.timesPerDay = 'Enter 1 to 24 doses per day.';
    if (!Number.isInteger(days) || days < 1 || days > 365) e.duration = 'Enter a course of 1 to 365 days (52 weeks).';
    if (d.unitsPerItem === '' || !(pack > 0) || pack > 100000) e.unitsPerItem = 'Enter how many units one item/package contains.';
    else if (!decimals(pack)) e.unitsPerItem = 'Use at most four decimal places.';
  }
  if (!item.instructions?.trim()) e.instructions = 'Directions / administration instructions are required.';
  else if (item.instructions.length > 1000) e.instructions = 'Use no more than 1,000 characters.';
  const q = Number(item.quantity);
  if (item.quantity === '' || !Number.isInteger(q) || q < 1 || q > 1000) e.quantity = 'Enter a whole quantity from 1 to 1000.';
  return e;
}
