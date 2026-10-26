import {isCheckoutAddon} from '../src/checkoutProducts.js';
import { GUIDE_PRODUCTS } from "./productGuide.js";
import { mergeManaged } from './clinicCatalog.js';
export const SERVICE_PRICES = [
  { id: "srv_consult", category: "Consultation & Exam", name: "Routine General Consultation & Exam", price: 500, desc: "Standard physical evaluation of vitals & condition" },
  { id: "srv_senior", category: "Consultation & Exam", name: "Senior Comprehensive Wellness Exam", price: 750, desc: "In-depth geriatric health review (7+ yrs)" },
  { id: "srv_rabies", category: "Vaccination & Preventive", name: "Anti-Rabies Vaccine (Annual Booster)", price: 350, desc: "RA 9482 certified anti-rabies shot & official certificate" },
  { id: "srv_dhpp", category: "Vaccination & Preventive", name: "DHPP 5-in-1 Core Canine Vaccine", price: 650, desc: "Core Distemper, Adenovirus, Parvovirus, Parainfluenza" },
  { id: "srv_fvrcp", category: "Vaccination & Preventive", name: "FVRCP 4-in-1 Core Feline Vaccine", price: 700, desc: "Core Rhinotracheitis, Calicivirus, Panleukopenia" },
  { id: "srv_deworm", category: "Vaccination & Preventive", name: "Broad-Spectrum Deworming Dose", price: 250, desc: "Canex/Drontal oral tablet/suspension for round/hook/tapeworms" },
  { id: "srv_heartworm", category: "Diagnostic & Lab", name: "Heartworm Rapid Antigen Test (Snap)", price: 850, desc: "Dirofilaria immitis blood test before preventive dispense" },
  { id: "srv_nexgard", requiresPrescription: true, category: "Pharmacy & Parasiticide", name: "NexGard Spectra Chewable Tablet", price: 550, desc: "Monthly flea, tick, heartworm and intestinal worm chewable" },
  { id: "srv_simparica", requiresPrescription: true, category: "Pharmacy & Parasiticide", name: "Simparica Trio Chewable Tablet", price: 600, desc: "Monthly flea, tick, heartworm broad-spectrum chewable" },
  { id: "srv_cbc", category: "Diagnostic & Lab", name: "Complete Blood Count (CBC)", price: 750, desc: "WBC, RBC, Hemoglobin, Platelet count analysis" },
  { id: "srv_chem", category: "Diagnostic & Lab", name: "Comprehensive Blood Chemistry Panel", price: 1400, desc: "Kidney, liver enzymes, glucose screening" },
  { id: "srv_dental", category: "Dental & Surgery", name: "Ultrasonic Dental Scaling & Polish", price: 1800, desc: "Periodontal calculus removal & enamel polish" },
  { id: "srv_ear", category: "Procedures & Care", name: "Deep Ear Cleaning & Cytology", price: 400, desc: "Canal flush and microscopic ear swab exam" },
  { id: "srv_wound", category: "Procedures & Care", name: "Wound Treatment & Antiseptic Bandaging", price: 450, desc: "Antiseptic lavage and protective dressing" },
  { id: "srv_groom", category: "Procedures & Care", name: "Sanitary Grooming & Nail Trim", price: 250, desc: "Nail clip, paw pad trim, anal gland expression" }
];

// Deployment-owned prices; never accept product prices from a checkout request.
const productTypes = ['Pet shampoo', 'Pet vitamins', 'Pet medicine', 'Pet accessories', 'Prescription diet', 'Dental & ear care'];
// Built-in items plus anything set in the deployment; administrator changes are layered on by priceCatalog().
export function baseCatalog() {
  const products = JSON.parse(process.env.CLINIC_PRODUCTS_JSON || '[]');
  if (!Array.isArray(products) || products.some(p => !p || typeof p.id !== 'string' || !/^product_[a-z0-9_]+$/.test(p.id) || typeof p.name !== 'string' || !p.name.trim() || !productTypes.includes(p.category) || (typeof p.price !== "number" || !Number.isFinite(p.price) || Math.abs(p.price * 100 - Math.round(p.price * 100)) > 0.000001) || p.price <= 0 || p.price > 10000000) || new Set(products.map(p => p.id)).size !== products.length) throw new Error('Invalid clinic product catalog configuration');
  const catalog = [...SERVICE_PRICES, ...GUIDE_PRODUCTS, ...products.map(({id, name, category, price}) => ({id, name, category, price, unit: 'item / package', requiresPrescription: ['Pet medicine', 'Prescription diet'].includes(category)}))];
  if (new Set(catalog.map(p => p.id)).size !== catalog.length) throw new Error('Duplicate clinic product catalog ID');
  return catalog;
}
// Retired items stay priceable so visits already carrying them can still be billed; new sales use active items only.
export function priceCatalog({includeRetired = false} = {}) {
  const merged = mergeManaged(baseCatalog());
  return includeRetired ? merged : merged.filter(item => item.active !== false);
}
export function canonicalInvoice(items, catalog = priceCatalog({includeRetired: true}), admission = []) {
  if (!Array.isArray(items) || !items.length || items.length > 100) return null;
  const result = [];
  for (const item of items) {
    const official = item?.source === 'admission' ? admission.find(p => p.catalogId === item.catalogId && p.price === item.price && p.name === item.name) : catalog.find(p => p.id === item?.catalogId);
    // A price changed after the care was recorded: the visit keeps the price it was recorded at.
    const earlier = item?.source !== 'admission' && item.price !== official?.price && (official?.priorPrices || []).includes(item.price);
    if (!official || (item.price !== official.price && !earlier) || item.name !== official.name || !Number.isInteger(item.qty) || item.qty < 1 || item.qty > 1000) return null;
    result.push({catalogId: official.id || official.catalogId, name: official.name, category: official.category, price: earlier ? item.price : official.price, qty: item.qty,...(item.source === 'admission' ? {source:'admission'} : {})});
  }
  return result;
}

// Validate against saved clinical decisions, never the source/category supplied by reception.
export function validateCheckoutAddons(invoice, consultation, saved = [], catalog = priceCatalog()) {
  const seen = new Set();
  for (const line of invoice.filter(i => i.source !== 'admission')) {
    if (seen.has(line.catalogId)) return 'Use one invoice line per product or service.';
    seen.add(line.catalogId);
    if (isCheckoutAddon(catalog.find(p => p.id === line.catalogId))) continue;
    const service = (consultation.performed_services || []).find(p => p.catalogId === line.catalogId);
    const prescription = (consultation.prescription_items || []).find(p => p.catalogId === line.catalogId);
    const recorded = saved.find(p => p.source !== 'admission' && p.catalogId === line.catalogId && p.name === line.name && p.price === line.price);
    if ((service && line.qty === service.qty) || (prescription && line.qty <= prescription.quantity) || (recorded && line.qty <= recorded.qty)) continue;
    return 'Only shampoo and accessories can be added at checkout. Clinical services and other products must come from the saved visit.';
  }
  return null;
}
