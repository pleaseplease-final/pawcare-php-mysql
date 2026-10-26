// Diagnosis -> care plan -> products. Everything here is a suggestion the veterinarian
// reviews and edits. Products come only from the clinic's own catalog (by id, or by name
// match for medicines the clinic stocks); amounts and package contents are never invented.
import {computeAgeDetails} from './preventiveSchedule.js';

const dayDiff = (from, to) => Math.round((Date.parse(to) - Date.parse(from)) / 86400000);
export const WEEK = 7;
export const courseDays = (value, unit) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n * (unit === 'weeks' ? WEEK : 1) : NaN;
};
export const DOSE_UNITS = ['tablet', 'capsule', 'mL', 'g', 'drop'];
export const DOSE_ROUTES = ['by mouth', 'on skin', 'in ear', 'in eye'];

// Dosed products get the course calculator; others get ready-made directions.
const dosed = (id, unit, route, timesPerDay, duration, durationUnit = 'days') => ({id, dosed: true, unit, route, timesPerDay, duration, durationUnit});
const plain = (id, directions, quantity = 1) => ({id, dosed: false, directions, quantity});
const medicine = (key, label, re, unit, route, timesPerDay, duration, durationUnit = 'days') => ({key, label, re, unit, route, timesPerDay, duration, durationUnit});

export const GUIDES = [
  {id: 'digestive', title: 'Digestive upset', match: /gastroenteritis|vomit|diarrhea|dietary indiscretion|giardiasis|intestinal parasit|constipation/i,
    plan: ['Offer small, frequent bland meals and plenty of fresh water; withhold rich food and treats.', 'Monitor vomiting, stool and appetite at home and call the clinic if it worsens.'],
    products: [dosed('product_probiotic', 'g', 'by mouth', 2, 5), plain('product_gi_diet', 'Feed the gastrointestinal diet exclusively for 7 days, then transition back gradually over 3 days.')],
    medicines: [medicine('antiemetic', 'Anti-nausea medicine (if indicated)', /maropitant|ondansetron/i, 'tablet', 'by mouth', 1, 3)],
    services: ['srv_cbc'], followUpDays: 3},
  {id: 'skin', title: 'Skin condition', match: /dermatitis|pyoderma|dermatophytosis|mange|demodicosis|atopic|allergic/i,
    plan: ['Bathe with the medicated product as directed and dry the coat fully.', 'Prevent licking and scratching; keep bedding clean.'],
    products: [plain('product_medicated_wash', 'Bathe twice weekly for 4 weeks. Leave on for 10 minutes before rinsing.'), dosed('product_omega3', 'capsule', 'by mouth', 1, 4, 'weeks')],
    medicines: [medicine('skin-antibiotic', 'Antibiotic (only if infection is confirmed)', /cefalexin|cephalexin|clavulan|amoxicillin|clindamycin/i, 'tablet', 'by mouth', 2, 2, 'weeks')],
    services: [], followUpDays: 14},
  {id: 'ear', title: 'Ear problem', match: /otitis|ear mite|ear infection/i,
    plan: ['Clean the ears as directed and keep the canal dry.', 'Avoid cotton buds inside the canal.'],
    products: [dosed('product_ear_flush', 'mL', 'in ear', 1, 7)],
    medicines: [medicine('ear-drops', 'Medicated ear drops (if indicated)', /otic|ear drop|ear med/i, 'drop', 'in ear', 2, 7)],
    services: ['srv_ear'], followUpDays: 7},
  {id: 'parasite', title: 'External parasites', match: /tick|flea|ehrlichiosis|anaplasmosis|babesiosis|parasitic infection/i,
    plan: ['Treat all pets in the household and wash bedding in hot water.', 'Continue monthly parasite prevention after treatment.'],
    products: [plain('product_fipronil_shampoo', 'Bathe once, leave on for 10 minutes, then rinse. Repeat in 7 days if directed.')],
    medicines: [], services: ['srv_cbc', 'srv_heartworm'], followUpDays: 14},
  {id: 'dental', title: 'Dental disease', match: /dental|gingivitis|periodontal/i,
    plan: ['Start daily tooth care and a dental diet as advised.', 'Arrange a dental scaling and polish if the veterinarian recommends it.'],
    products: [plain('product_toothpaste', 'Brush teeth daily with the enzymatic toothpaste.'), plain('product_dental_chews', 'Give one chew daily as a plaque-control aid.')],
    medicines: [], services: ['srv_dental'], followUpDays: 30, procedure: 'Dental procedure'},
  {id: 'wound', title: 'Wound / soft tissue injury', match: /injury|wound|abscess|soft tissue/i,
    plan: ['Keep the wound clean and dry; do not allow licking.', 'Restrict activity and check the wound daily for swelling or discharge.'],
    products: [plain('product_hard_collar', 'Keep the collar on at all times until the wound has healed.')],
    medicines: [medicine('wound-antibiotic', 'Antibiotic (if indicated)', /amoxicillin|clavulan|cefalexin|cephalexin/i, 'tablet', 'by mouth', 2, 7)],
    services: ['srv_wound'], followUpDays: 7},
  {id: 'joint', title: 'Joint / mobility', match: /osteoarthritis|lameness|arthritis/i,
    plan: ['Restrict high-impact exercise; use short, controlled walks.', 'Keep weight in the ideal range.'],
    products: [dosed('product_joint_support', 'tablet', 'by mouth', 1, 8, 'weeks')],
    medicines: [medicine('pain', 'Pain relief (if indicated)', /meloxicam|carprofen/i, 'tablet', 'by mouth', 1, 5)],
    services: [], followUpDays: 14},
  {id: 'urinary', title: 'Urinary tract', match: /urinary|cystitis|urolithiasis/i,
    plan: ['Encourage water intake and frequent toilet breaks.', 'Report straining, blood in urine or reduced urination straight away.'],
    products: [plain('product_urinary_diet', 'Feed the urinary diet exclusively as directed.')],
    medicines: [medicine('urinary-antibiotic', 'Antibiotic (only if infection is confirmed)', /amoxicillin|clavulan|enrofloxacin|doxycycline/i, 'tablet', 'by mouth', 2, 7)],
    services: ['srv_cbc', 'srv_chem'], followUpDays: 7},
  {id: 'kidney', title: 'Kidney disease', match: /kidney|renal/i,
    plan: ['Feed a renal-support diet and keep fresh water available at all times.', 'Repeat blood work as the veterinarian directs.'],
    products: [plain('product_renal_diet', 'Feed the renal-support diet exclusively as directed.')],
    medicines: [], services: ['srv_chem'], followUpDays: 14, admitHint: true},
  {id: 'liver', title: 'Liver / pancreas', match: /hepatic|liver|pancreatitis/i,
    plan: ['Feed small, low-fat meals and avoid treats.', 'Repeat blood work as the veterinarian directs.'],
    products: [dosed('product_silymarin', 'tablet', 'by mouth', 1, 4, 'weeks')],
    medicines: [], services: ['srv_chem', 'srv_cbc'], followUpDays: 14, admitHint: true},
  {id: 'respiratory', title: 'Respiratory infection', match: /respiratory|pneumonia/i,
    plan: ['Rest, keep warm and away from other pets, and keep the nose and eyes clean.', 'Return sooner if breathing becomes laboured.'],
    products: [dosed('product_vitamin_c', 'tablet', 'by mouth', 1, 7)],
    medicines: [medicine('respiratory-antibiotic', 'Antibiotic (only if bacterial infection is suspected)', /doxycycline|amoxicillin|clavulan/i, 'tablet', 'by mouth', 2, 7)],
    services: ['srv_cbc'], followUpDays: 5, admitHint: true},
  {id: 'viral-enteritis', title: 'Viral enteritis', match: /parvovir|panleukopenia/i,
    plan: ['Isolate from other pets and disinfect the area.', 'Intensive supportive care is usually needed. Consider admitting the patient.'],
    products: [plain('product_recovery_food', 'Offer the high-calorie recovery food in small portions when the veterinarian allows feeding.')],
    medicines: [], services: ['srv_cbc'], followUpDays: 2, admitHint: true},
  {id: 'eye', title: 'Eye problem', match: /conjunctivitis|corneal/i,
    plan: ['Prevent rubbing of the eye and keep the area clean.'],
    products: [plain('product_hard_collar', 'Keep the collar on until the eye has healed.')],
    medicines: [], services: [], followUpDays: 3},
  {id: 'wellness', title: 'Healthy / routine check', match: /no abnormal findings/i,
    plan: ['Continue the preventive care schedule: vaccines, parasite control and regular exams.'],
    products: [], medicines: [], services: [], followUpDays: 0},
  {id: 'pending', title: 'Diagnosis pending tests', match: /pending diagnos/i,
    plan: ['Run the diagnostic tests and review the results at the recheck.'],
    products: [], medicines: [], services: ['srv_cbc', 'srv_chem'], followUpDays: 3},
];

export function matchGuides(diagnosis) {
  const lines = String(diagnosis || '').split(/\r?\n|;/).map(l => l.trim()).filter(Boolean);
  const found = new Map();
  for (const line of lines) for (const g of GUIDES) if (g.match.test(line) && !found.has(g.id)) found.set(g.id, {...g, because: line});
  return [...found.values()];
}

// Several diagnoses share one plan: lines and products are merged once; the soonest recheck wins.
export function mergeGuides(guides) {
  const plan = [...new Set(guides.flatMap(g => g.plan))];
  const products = new Map(), medicines = new Map();
  for (const g of guides) {
    for (const p of g.products) if (!products.has(p.id)) products.set(p.id, {...p, because: g.title});
    for (const m of g.medicines) if (!medicines.has(m.key)) medicines.set(m.key, {...m, because: g.title});
  }
  const days = guides.map(g => g.followUpDays).filter(n => n > 0);
  return {plan, products: [...products.values()], medicines: [...medicines.values()],
    services: [...new Set(guides.flatMap(g => g.services))], followUpDays: days.length ? Math.min(...days) : 0,
    admitHint: guides.some(g => g.admitHint), procedure: guides.find(g => g.procedure)?.procedure || ''};
}

// A catalog row -> a prescription line. Amount and package contents stay blank for the vet.
export function prescriptionLine(spec, product) {
  const base = {catalogId: product.id, name: product.name, price: product.price, unit: product.unit || 'item / package', category: product.category};
  if (!spec.dosed) return {...base, quantity: spec.quantity || 1, instructions: spec.directions};
  return {...base, quantity: 1, instructions: '', durationValue: spec.duration, durationUnit: spec.durationUnit,
    dose: {amount: '', unit: spec.unit, route: spec.route, timesPerDay: spec.timesPerDay, days: courseDays(spec.duration, spec.durationUnit), unitsPerItem: ''}};
}

export const courseEnd = items => {
  const days = items.filter(p => p.dose).map(p => courseDays(p.durationValue, p.durationUnit)).filter(Number.isFinite);
  return days.length ? Math.max(...days) : 0;
};

// Calculated facts for the examination, from saved intake and records only.
export function checkupSnapshot({pet, vitals, vaccs = [], today}) {
  const lines = [], plan = [];
  const age = computeAgeDetails(pet.birth);
  if (pet.birth) lines.push(`Age: ${age.formatted}${/canine|dog/i.test(pet.species || '') ? ` (${age.lifeStageLabel})` : ''}.`);
  if (vitals?.weight != null) lines.push(`Weight: ${vitals.weight} kg${vitals.weightAnalysis?.label ? ` (${vitals.weightAnalysis.label})` : ''}${vitals.weightAnalysis?.trend ? `, ${vitals.weightAnalysis.trend}` : ''}.`);
  if (vitals?.temp != null) lines.push(`Temperature: ${vitals.temp}°C${vitals.tempAnalysis?.label ? ` (${vitals.tempAnalysis.label})` : ''}.`);
  const latest = new Map();
  for (const v of vaccs) if (v.done && v.vaccine && (!latest.get(v.vaccine) || v.date > latest.get(v.vaccine).date)) latest.set(v.vaccine, v);
  if (!latest.size) { lines.push('Preventive care: no vaccination or deworming recorded.'); plan.push('Start the preventive-care schedule (vaccination and deworming).'); }
  for (const v of latest.values()) {
    if (!v.nextDue) continue;
    const d = dayDiff(today, v.nextDue);
    lines.push(`${v.vaccine}: next due ${v.nextDue} (${d < 0 ? `${-d} day(s) overdue` : d === 0 ? 'due today' : `in ${d} day(s)`}).`);
    if (d < 0) plan.push(`${v.vaccine} is overdue. Book it for ${pet.name}.`);
    else if (d <= 14) plan.push(`${v.vaccine} is due within ${d} day(s). Book it for ${pet.name}.`);
  }
  if (pet.birth && age.isSenior) plan.push('Senior patient: consider a senior wellness exam and blood work.');
  return {lines, plan};
}
