// ZIP <-> province/city matching for the Philippines, fully offline (uses the bundled ph-zip.json).
// ph-zip.json rows: { z: ZIP, a: postal area (municipality, or a district for Metro Manila), p: province, r: region }
import { readFileSync } from 'node:fs';

let DATA = [];
try {
  DATA = JSON.parse(readFileSync(new URL('./ph-zip.json', import.meta.url), 'utf8'));
} catch (err) {
  console.warn('Warning: Could not load ph-zip.json:', err?.message);
}
const BY_ZIP = new Map();
for (const r of DATA) (BY_ZIP.get(r.z) ?? BY_ZIP.set(r.z, []).get(r.z)).push(r);

// Normalise a place name so "City of Angeles", "Angeles City" and "ANGELES" all compare equal.
// Official PSGC names that the postal data spells differently.
const ALIAS = { 'science munoz': 'munoz', 'island garden samal': 'samal', 'island garden city of samal': 'samal', 'isabela de basilan': 'isabela', ozamis: 'ozamiz', baliwag: 'baliuag' };
export const nm = (x = '') => { const v = nm0(x); return ALIAS[v] ?? v; };
const nm0 = (x = '') => String(x).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/\([^)]*\)/g, ' ')
  .replace(/\bsta\b/g, 'santa').replace(/\bsto\b/g, 'santo').replace(/\bgen\b/g, 'general')
  .replace(/\b(city of|municipality of|province of|city|cpo|poblacion)\b/g, ' ')
  .replace(/[^a-z0-9]+/g, ' ').trim();

const lev = (a, b) => {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
};
// Same place? Exact after normalising, ignoring spaces ("Daan Bantayan"/"Daanbantayan"), or one typo on long names
// (the postal data has a few, e.g. "San Remegio").
export const samePlace = (a, b) => {
  const A = nm(a), B = nm(b); if (!A || !B) return false;
  if (A === B) return true;
  const a2 = A.replace(/ /g, ''), b2 = B.replace(/ /g, '');
  return a2 === b2 || (a2.length >= 8 && lev(a2, b2) <= 1);
};
// Provinces: normalised equality; Maguindanao was split in 2022 so the old and new names are treated as one.
const sameProv = (a, b) => { const A = nm(a), B = nm(b); return A === B || (A.startsWith('maguindanao') && B.startsWith('maguindanao')); };

// Metro Manila postal areas are districts, not cities, so map ZIP ranges to their city (PHLPost ranges; verified
// against every Metro Manila row in ph-zip.json, see the test script).
const NCR = [
  [1000, 1018, 'Manila'], [1100, 1139, 'Quezon City'], [1200, 1299, 'Makati'], [1300, 1399, 'Pasay'],
  [1400, 1439, 'Caloocan'], [1440, 1469, 'Valenzuela'], [1470, 1484, 'Malabon'], [1485, 1499, 'Navotas'],
  [1500, 1549, 'San Juan'], [1550, 1599, 'Mandaluyong'], [1600, 1619, 'Pasig'], [1620, 1629, 'Pateros'],
  [1630, 1639, 'Taguig'], [1700, 1739, 'Parañaque'], [1740, 1769, 'Las Piñas'], [1770, 1799, 'Muntinlupa'],
  [1800, 1819, 'Marikina'],
];
export const ncrCityOf = (zip) => { const n = +zip; return NCR.find(([a, b]) => n >= a && n <= b)?.[2] ?? null; };
const ncrRangeOf = (city) => {
  const hit = NCR.find(([, , c]) => samePlace(c, city)); if (!hit) return null;
  const zs = DATA.filter((r) => +r.z >= hit[0] && +r.z <= hit[1]).map((r) => r.z).sort();
  return { name: hit[2], lo: zs[0], hi: zs.at(-1) };
};
const NCR_PROV = 'Metro Manila';

const listZips = (zs) => { const u = [...new Set(zs)].sort(); return u.length > 4 ? `${u[0]}–${u.at(-1)}` : u.join(', '); };

// Postal areas that are a barrio / district / camp / spelling variant of a city or municipality, mapped to the place(s) that own them
// (names as in ph-locations.json). Without this, e.g. Balibago 2024 would not be offered to Angeles City, nor Canlubang 4028 to Calamba.
const OWNER = {
  1871: ['Antipolo City'], 1872: ['Antipolo City'], 1873: ['Antipolo City'], 1874: ['Antipolo City'], 1875: ['Antipolo City'],
  2007: ['Floridablanca'], 2023: ['Angeles City', 'Mabalacat City'], 2024: ['Angeles City'], 2025: ['Lubao'], 2026: ['Mabalacat City'],
  2104: ['Limay'], 2106: ['Mariveles'], 2109: ['Mariveles'], 2301: ['Tarlac City'], 2507: ['Santo Tomas'],
  2602: ['Baguio City'], 2609: ['Mankayan'], 3024: ['City of San Jose del Monte', 'San Jose Del Monte City'], 3025: ['San Rafael'],
  3120: ['Science City of Muñoz'], 3125: ['General Mamerto Natividad'], 3130: ['Palayan City'],
  4006: ['Majayjay'], 4012: ['Calauan'], 4028: ['Calamba City'], 4029: ['Calamba City'], 4031: ['Los Baños'], 4034: ['Biñan City'],
  4101: ['Cavite City'], 4115: ['Dasmariñas City'], 4124: ['General Emilio Aguinaldo'], 4125: ['Cavite City'], 4126: ['Dasmariñas City'], 4135: ['Bacoor City'],
  4218: ['Lipa City'], 4300: ['Lucena City'], 4317: ['Lopez'], 4339: ['Polillo'], 4612: ['Labo'], 4701: ['Sorsogon City'],
  5107: ['Paluan'], 5110: ['Lubang'], 5301: ['Puerto Princesa City'], 5306: ['Bataraza'], 5323: ['Dr. Jose P. Rizal'],
  5421: ['Claveria'], 5700: ['San Jose'], 6016: ['Lapu-Lapu City'], 6117: ['Silay City'], 6123: ['Sagay City'], 6133: ['Salvador Benedicto'],
  6334: ['Getafe'], 6703: ['Paranas'], 7022: ['Sominot'], 7036: ['Vincenzo A. Sagun'], 7102: ['Pres. Manuel A. Roxas'], 7108: ['Sergio Osmeña Sr.'],
  7121: ['Sirawai'], 7216: ['Don Victoriano'], 7402: ['Old Panamao'], 7406: ['Tongkil'], 7416: ['Kalingalan Caluang'],
  8016: ['Davao City'], 8017: ['Davao City'], 8018: ['Davao City'], 8019: ['Davao City'], 8020: ['Davao City'], 8021: ['Davao City'],
  8022: ['Davao City'], 8023: ['Davao City'], 8024: ['Davao City'], 8025: ['Davao City'], 8026: ['Davao City'],
  8118: ['Island Garden City of Samal'], 8120: ['Island Garden City of Samal'], 8121: ['Island Garden City of Samal'], 8210: ['Governor Generoso'],
  8313: ['Cortes'], 8319: ['Tagbina'], 9308: ['Lumbaca-Unayan'], 8705: ['Manolo Fortich'], 8710: ['Maramag'], 9316: ['Bacolod-Kalawi'], 9320: ['Amai Manabilang'], 9405: ['President Roxas'],
  9618: ['Gen. S.K. Pendatun'], 9631: ['Pagagawan'], 9637: ['Talitay'], 9713: ['Ditsaan-Ramain'], 9802: ['Lambayong'], 9804: ['President Quirino'],
};
const owns = (r, city) => samePlace(r.a, city) || (OWNER[r.z] ?? []).some((c) => samePlace(c, city));   // does postal row r belong to this city/municipality?

// -> { ok: true } | { ok: false, error }   (state = province name as shown in the form, e.g. "Pampanga" / "Metro Manila")
export function checkPhZip({ state, city, zip }) {
  const z = String(zip ?? '').trim(), recs = BY_ZIP.get(z);
  if (!recs) return { ok: false, error: `${z} is not a valid Philippine ZIP code.` };

  const inNcr = sameProv(state, NCR_PROV), zNcr = ncrCityOf(z);
  const zipPlace = zNcr ? `${zNcr}, ${NCR_PROV}` : `${recs[0].a.replace(/\s*\([^)]*\)/g, '')}, ${recs[0].p}`;

  // 1) province
  const provOk = inNcr ? !!zNcr || recs.some((r) => sameProv(r.p, NCR_PROV)) : recs.some((r) => sameProv(r.p, state));
  if (!provOk) return { ok: false, error: `ZIP ${z} belongs to ${zipPlace}, not ${city}.` };   // the province is derived from the city, so name the city

  // 2) city: matches a postal area of this ZIP (municipalities, Metro Manila districts)...
  if (recs.some((r) => owns(r, city))) return { ok: true };
  if (inNcr) {                                                       // ...or the Metro Manila city that owns this ZIP range
    if (zNcr && samePlace(zNcr, city)) return { ok: true };
    const own = ncrRangeOf(city);
    if (!own) return { ok: true };                                   // not a name we can map (e.g. a barangay): province-level check only
    return { ok: false, error: `ZIP ${z} is in ${zNcr ?? 'another city'}, not ${own.name}. ZIP codes for ${own.name}: ${own.lo}–${own.hi}.` };
  }
  const mine = DATA.filter((r) => sameProv(r.p, state) && owns(r, city));
  if (!mine.length) return { ok: true };                             // this city has no postal area of its own in the data: province-level check only
  return { ok: false, error: `ZIP ${z} belongs to ${recs[0].a.replace(/\s*\([^)]*\)/g, '')}, not ${city}. ZIP code for ${city}: ${listZips(mine.map((r) => r.z))}.` };
}

// ZIP codes that belong to a city/municipality, for the registration dropdown.
// Uses exactly the same matching rules as checkPhZip, so every ZIP offered here is accepted by the validator.
// -> { zips: [{ zip, area }], exact }   exact=false means the data has no postal area named after this city,
//    so the province's ZIPs are offered instead (checkPhZip only does a province-level check in that case).
export function zipsFor({ state, city }) {
  const clean = (a) => a.replace(/\s*\([^)]*\)/g, '').trim();
  const rows = (rs) => rs.map((r) => ({ zip: r.z, area: clean(r.a) })).sort((a, b) => a.zip.localeCompare(b.zip) || a.area.localeCompare(b.area));
  if (sameProv(state, NCR_PROV)) {
    const own = ncrRangeOf(city);
    if (own) return { zips: rows(DATA.filter((r) => +r.z >= +own.lo && +r.z <= +own.hi)), exact: true };
    const mine = DATA.filter((r) => sameProv(r.p, NCR_PROV) && samePlace(r.a, city));
    return mine.length ? { zips: rows(mine), exact: true } : { zips: rows(DATA.filter((r) => sameProv(r.p, NCR_PROV))), exact: false };
  }
  const mine = DATA.filter((r) => sameProv(r.p, state) && owns(r, city));
  if (mine.length) return { zips: rows(mine), exact: true };
  return { zips: rows(DATA.filter((r) => sameProv(r.p, state))), exact: false };
}