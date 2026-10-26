// Rules for the clinic's price list, shared by the admin form and the server.
export const PRODUCT_CATEGORIES = ['Pet shampoo', 'Pet vitamins', 'Pet medicine', 'Pet accessories', 'Prescription diet', 'Dental & ear care'];
export const SERVICE_CATEGORIES = ['Consultation & Exam', 'Vaccination & Preventive', 'Diagnostic & Lab', 'Procedures & Care', 'Dental & Surgery'];
export const RX_CATEGORIES = ['Pet medicine', 'Prescription diet'];
export const NAME_RULE = /^[\p{L}0-9][\p{L}0-9 .,'’()\/&+%-]*$/u;
export const MAX_PRICE = 1000000;

export const isProduct = category => PRODUCT_CATEGORIES.includes(category);
export const idFor = (name, category, taken = []) => {
  const base = `${isProduct(category) ? 'product' : 'srv'}_${String(name).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 50) || 'item'}`;
  let id = base, n = 1;
  while (taken.includes(id)) id = `${base}_${++n}`;
  return id;
};

// `items` is the whole catalog (id, name, active). `editing` is the item being changed, if any.
export function catalogErrors(input, items = [], editing = null) {
  const e = {}, name = String(input.name ?? '').trim();
  if (!editing) {
    if (!name) e.name = 'Enter the item name.';
    else if (name.length < 3) e.name = 'Use at least 3 characters.';
    else if (name.length > 80) e.name = 'Keep the name under 80 characters.';
    else if (!NAME_RULE.test(name) || !/\p{L}/u.test(name)) e.name = 'Start with a letter or number and include at least one letter. Use letters, numbers and . , \' ( ) / & + % - only.';
    else if (items.some(item => item.name.trim().toLowerCase() === name.toLowerCase())) e.name = 'An item with this name already exists in the price list.';
    if (!SERVICE_CATEGORIES.includes(input.category) && !isProduct(input.category)) e.category = 'Choose a category from the list.';
  }
  const raw = String(input.price ?? '').trim();
  const price = Number(raw);
  if (raw === '') e.price = 'Enter the price in pesos.';
  else if (!/^\d+(\.\d{1,2})?$/.test(raw)) e.price = 'Use numbers only, with at most 2 decimal places.';
  else if (!(price > 0)) e.price = 'The price must be more than ₱0.';
  else if (price > MAX_PRICE) e.price = `The price cannot be more than ₱${MAX_PRICE.toLocaleString()}.`;
  const unit = String(input.unit ?? '').trim();
  if (!unit) e.unit = 'Enter the unit, for example "item / package".';
  else if (unit.length > 40) e.unit = 'Keep the unit under 40 characters.';
  else if (/[\u0000-\u001f\u007f]/.test(unit)) e.unit = 'Remove special characters.';
  const description = String(input.description ?? '').trim();
  if (description.length > 200) e.description = 'Keep the description under 200 characters.';
  else if (/[\u0000-\u001f\u007f]/.test(description.replace(/\n/g, ' '))) e.description = 'Remove special characters.';
  return e;
}
