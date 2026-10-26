import { SERVICE_PRICES } from './priceCatalog.js';
import { VACCINE_SERVICE } from '../src/clinicalWorkflow.js';
const fail = message => { throw Object.assign(new Error(message), {status:400}); };
export function clinicalCharges(ids = [], vaccination) {
  if (!Array.isArray(ids) || ids.length > 30 || new Set(ids).size !== ids.length) fail('Select each performed service only once.');
  const selected = new Set(ids);
  if (vaccination) {
    const mapped = VACCINE_SERVICE[vaccination.vaccine];
    if (mapped) selected.add(mapped);
  }
  return [...selected].map(id => {
    const p = SERVICE_PRICES.find(p => p.id === id && !p.requiresPrescription);
    if (!p) fail('Choose performed services from the clinic catalog.');
    return {catalogId:p.id,name:p.name,category:p.category,price:p.price,qty:1,source:'performed'};
  });
}
export function validateClinicalCharges(invoice, services = []) {
  for (const service of services) {
    const lines = invoice.filter(i => i.catalogId === service.catalogId);
    if (lines.length !== 1 || lines[0].qty !== 1 || lines[0].price !== service.price) return 'Retain each veterinarian-confirmed service once at its recorded price.';
  }
  return null;
}
