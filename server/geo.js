// Location + contact validation APIs (mounted at /api/geo and /api/check in server.js).
// Data: country-state-city (offline), libphonenumber-js (mobile).
import { Router } from 'express';
import dns from 'node:dns/promises';
import { readFileSync } from 'node:fs';
import { Country, State, City } from 'country-state-city';
import { parsePhoneNumberFromString, getCountryCallingCode } from 'libphonenumber-js/max';
import { PUBLIC } from './domains.js';
import { checkPhZip, zipsFor } from './zipmatch.js';

// Postal-code formats for every country that has a postal system. The ~66 that have none fall back to a loose 3-10 char check.
const ZIP = Object.fromEntries(Object.entries({
  AD: "^(?:AD)*(\\d{3})$", AF: "^(\\d{4})$", AI: "^(AI-?\\d{4})$", AL: "^(\\d{4})$", AM: "^[0-9]{4}$", AR: "^[A-Z]?\\d{4}[A-Z]{0,3}$",
  AS: "^96799(?:-[0-9]{4})?$", AT: "^(\\d{4})$", AU: "^(\\d{4})$", AX: "^(?:FI)*(\\d{5})$", AZ: "^(?:AZ )*(\\d{4})$", BA: "^(\\d{5})$",
  BB: "^(?:BB)*(\\d{5})$", BD: "^(\\d{4})$", BE: "^(\\d{4})$", BG: "^(\\d{4})$", BH: "^(\\d{3}\\d?)$", BL: "^(\\d{5})$",
  BM: "^([A-Z]{2}\\s?[A-Z0-9]{2})$", BN: "^([A-Z]{2}\\d{4})$", BR: "^\\d{5}-\\d{3}$", BT: "^(\\d{5})$", BY: "^(\\d{6})$",
  CA: "^([ABCEGHJKLMNPRSTVXY]\\d[ABCEGHJKLMNPRSTVWXYZ])(?: ?(\\d[ABCEGHJKLMNPRSTVWXYZ]\\d))?$", CC: "^(\\d{4})$", CH: "^(\\d{4})$", CL: "^(\\d{7})$",
  CN: "^(\\d{6})$", CO: "^(\\d{6})$", CR: "^(\\d{5})$", CU: "^(?:CP ?)?[0-9]{5}$", CV: "^(\\d{4})$", CX: "^(\\d{4})$", CY: "^(\\d{4})$",
  CZ: "^\\d{3}\\s?\\d{2}$", DE: "^(\\d{5})$", DK: "^(\\d{4})$", DO: "^(\\d{5})$", DZ: "^(\\d{5})$", EC: "^(\\d{6})$", EE: "^(\\d{5})$",
  EG: "^(\\d{5})$", ES: "^(\\d{5})$", ET: "^(\\d{4})$", FI: "^(?:FI)*(\\d{5})$", FK: "^(FIQQ\\s?1ZZ)$", FM: "^(\\d{5})$", FO: "^(?:FO)*(\\d{3})$",
  FR: "^(\\d{5})$", GB: "^[A-Z]{1,2}\\d[A-Z\\d]? ?\\d[A-Z]{2}$", GE: "^(\\d{4})$", GF: "^((97|98)3\\d{2})$",
  GG: "^[A-Z]{1,2}\\d[A-Z\\d]? ?\\d[A-Z]{2}$", GI: "GX11 1AA", GL: "^(\\d{4})$", GP: "^((97|98)\\d{3})$", GR: "^[0-9]{3} ?[0-9]{2}$",
  GS: "^(SIQQ\\s?1ZZ)$", GT: "^(\\d{5})$", GU: "^(969\\d{2})$", GW: "^(\\d{4})$", HM: "^(\\d{4})$", HN: "^(?:[0-9]{5}|[A-Z]{2}[0-9]{4})$",
  HR: "^(?:HR)*(\\d{5})$", HT: "^(?:HT)*(\\d{4})$", HU: "^(\\d{4})$", ID: "^(\\d{5})$",
  IE: "^(?:D6W|[AC-FHKNPRTV-Y][0-9]{2}) ?[AC-FHKNPRTV-Y0-9]{4}$", IL: "^(\\d{7}|\\d{5})$", IM: "^[A-Z]{1,2}\\d[A-Z\\d]? ?\\d[A-Z]{2}$",
  IN: "^(\\d{6})$", IO: "^(BBND\\s?1ZZ)$", IQ: "^(\\d{5})$", IR: "^(\\d{5}(?:\\d{5})?)$", IS: "^(\\d{3})$", IT: "^(\\d{5})$",
  JE: "^[A-Z]{1,2}\\d[A-Z\\d]? ?\\d[A-Z]{2}$", JO: "^(\\d{5})$", JP: "^\\d{3}-\\d{4}$", KE: "^(\\d{5})$", KG: "^(\\d{6})$", KH: "^(\\d{6})$",
  KR: "^(\\d{5})$", KW: "^(\\d{5})$", KY: "^KY\\d-\\d{4}$", KZ: "^(?:[0-9]{6}|[A-Z][0-9]{2}[A-Z][0-9][A-Z][0-9])$", LA: "^(\\d{5})$",
  LB: "^[0-9]{4}(?: ?[0-9]{4})?$", LI: "^(\\d{4})$", LK: "^(\\d{5})$", LR: "^(\\d{4})$", LS: "^(\\d{3})$", LT: "^(?:LT-)?[0-9]{5}$",
  LU: "^(?:L-)?\\d{4}$", LV: "^(?:LV-)?[0-9]{4}$", MA: "^(\\d{5})$", MC: "^(\\d{5})$", MD: "^MD-\\d{4}$", ME: "^(\\d{5})$", MF: "^(\\d{5})$",
  MG: "^(\\d{3})$", MH: "^969\\d{2}(?:-\\d{4})?$", MK: "^(\\d{4})$", MM: "^(\\d{7})$", MN: "^(\\d{5})$", MP: "^9695\\d{1}$", MQ: "^(\\d{5})$",
  MT: "^[A-Z]{3}\\s?\\d{4}$", MU: "^(\\d{5})$", MV: "^(\\d{5})$", MW: "^(\\d{6})$", MX: "^(\\d{5})$", MY: "^(\\d{5})$", MZ: "^(\\d{4})$",
  NA: "^(\\d{5})$", NC: "^(\\d{5})$", NE: "^(\\d{4})$", NF: "^(\\d{4})$", NG: "^(\\d{6})$", NI: "^[0-9]{5}$", NL: "^(\\d{4}(?:\\s?[A-Za-z]{2})?)$",
  NO: "^(\\d{4})$", NP: "^(\\d{5})$", NR: "^(NRU68)$", NU: "^(\\d{4})$", NZ: "^(\\d{4})$", OM: "^(\\d{3})$",
  PA: "^(?:[A-Z0-9]{5}-?[A-Z0-9]{5}|[A-Z][0-9]{4}|[0-9]{4})$", PE: "^(\\d{5})$", PF: "^((97|98)7\\d{2})$", PG: "^(\\d{3})$", PH: "^(\\d{4})$",
  PK: "^(\\d{5})$", PL: "^\\d{2}-\\d{3}$", PM: "^(97500)$", PN: "^(PCRN\\s?1ZZ)$", PR: "^00[679]\\d{2}(?:-\\d{4})?$",
  PT: "^\\d{4}-\\d{3}\\s?[a-zA-Z]{0,25}$", PW: "^(96940)$", PY: "^(\\d{4}|\\d{6})$", RE: "^((97|98)(4|7|8)\\d{2})$", RO: "^(\\d{6})$",
  RS: "^(\\d{5})$", RU: "^(\\d{6})$", SA: "^(\\d{5})$", SD: "^(\\d{5})$", SE: "^(?:SE)?\\d{3}\\s\\d{2}$", SG: "^(\\d{6})$",
  SH: "^((?:STHL|ASCN|TDCU)\\s?1ZZ)$", SI: "^(?:SI)*(\\d{4})$", SJ: "^(\\d{4})$", SK: "^\\d{3}\\s?\\d{2}$", SM: "^(4789\\d)$", SN: "^(\\d{5})$",
  SO: "^(?:[A-Z]{2} {0,2}[0-9]{5}|[0-9]{4,5})$", SV: "^(?:CP ?)?[0-9]{4}$", SZ: "^([A-Z]\\d{3})$", TC: "^(TKCA\\s?1ZZ)$", TF: "^(\\d{5})$",
  TH: "^(\\d{5})$", TJ: "^(\\d{6})$", TM: "^(\\d{6})$", TN: "^(\\d{4})$", TR: "^(\\d{5})$", TT: "^(\\d{6})$", TW: "^(\\d{3}(?:\\d{2,3})?)$",
  TZ: "^(\\d{5})$", UA: "^(\\d{5})$", UM: "^(\\d{5})$", US: "^\\d{5}(-\\d{4})?$", UY: "^(\\d{5})$", UZ: "^(\\d{6})$", VA: "^(\\d{5})$",
  VC: "^VC\\d{4}$", VE: "^(\\d{4})$", VG: "^VG\\d{4}$", VI: "^008\\d{2}(?:-\\d{4})?$", VN: "^[0-9]{5,6}$", WF: "^(986\\d{2})$", WS: "^WS[0-9]{4}$",
  XK: "^(\\d{5})$", YT: "^(\\d{5})$", ZA: "^(\\d{4})$", ZM: "^(\\d{5})$",
}).map(([k, v]) => [k, new RegExp(v, 'i')]));   // per-country postal formats (source: countries-states-cities-database); countries with no postal system use LOOSE below
const LOOSE = /^[A-Za-z0-9][A-Za-z0-9 -]{1,8}[A-Za-z0-9]$/;

const norm = (s = '') => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/\b(city of|city|province of|province|municipality of|region|state of)\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const same = (a, b) => { a = norm(a); b = norm(b); return !!a && !!b && (a === b || a.includes(b) || b.includes(a)); };

const fold = (s = '') => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const rank = (n, q) => { n = fold(n); return n.startsWith(q) ? 0 : n.split(/[ -]/).some((w) => w.startsWith(q)) ? 1 : n.includes(q) ? 2 : 9; };
const search = (list, q, get = (x) => x) => { q = fold(q); return !q ? list : list.filter((x) => rank(get(x), q) < 9).sort((a, b) => rank(get(a), q) - rank(get(b), q) || get(a).localeCompare(get(b))); };
const cc = (c) => String(c ?? '').toUpperCase();
export const countryInfo = (code) => {
  const c = Country.getCountryByCode(cc(code)); if (!c) return null;
  let dial; try { dial = '+' + getCountryCallingCode(c.isoCode); } catch { dial = '+' + String(c.phonecode).split('-')[0].replace(/\D/g, ''); }
  return { code: c.isoCode, name: c.name, dial, flag: c.flag, zipFormat: (ZIP[c.isoCode] ?? LOOSE).source, zipFlags: (ZIP[c.isoCode] ?? LOOSE).flags };
};

// ---- Philippines: live PSGC API (official Philippine Standard Geographic Code), with a bundled offline fallback ----
// country-state-city files many PH cities under the wrong province, so for PH the provinces and their cities/municipalities
// come straight from the PSGC API: GET /provinces.json and GET /provinces/{code}/cities-municipalities.json (Metro Manila via its region).
// If the API is unreachable the bundled ph-locations.json (same PSGC data, built by `npm run build:locations`) is used instead.
const PSGC = (process.env.PSGC_API_URL ?? 'https://psgc.gitlab.io/api').replace(/\/$/, ''), NCR = '130000000';
let PHD = { provinces: [], places: [] };
try {
  PHD = JSON.parse(readFileSync(new URL('./ph-locations.json', import.meta.url), 'utf8'));
} catch (err) {
  console.warn('Warning: Could not load ph-locations.json:', err?.message);
}
const phn = (x = '') => String(x).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/\bsta\b/g, 'santa').replace(/\bsto\b/g, 'santo').replace(/\b(city of|city)\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim();   // "City of Makati" == "Makati City" == "Makati"
const phLabel = (n) => String(n).replace(/\s+/g, ' ').trim().replace(/^City of (.+)$/i, '$1 City');   // one format: "Makati City"
const memo = new Map();   // short-lived (24 h) in-memory cache of API responses so the API isn't hit on every keystroke
const psgc = (path) => {
  const hit = memo.get(path); if (hit && Date.now() - hit.t < 864e5) return hit.p;
  const p = fetch(PSGC + path, { signal: AbortSignal.timeout(6000), headers: { Accept: 'application/json' } })
    .then((r) => { if (!r.ok) throw new Error(`PSGC API ${r.status}`); return r.json(); })
    .then((j) => { const a = Array.isArray(j) ? j : j?.data ?? []; if (!a.length) throw new Error('PSGC API empty'); return a; });
  memo.set(path, { t: Date.now(), p }); p.catch(() => memo.delete(path)); return p;
};
const PH_SHORT = { qc: 'Quezon City', cdo: 'Cagayan de Oro City', gensan: 'General Santos City', zambo: 'Zamboanga City', ncr: 'Metro Manila' };   // what people really type
const phSearch = (names, q) => {                                              // type-ahead: "angeles", "city of angeles", "sta rosa", "cdo" all work
  const x = phn(q), hit = PH_SHORT[fold(q)]; if (!x) return names;
  const rk = (n) => { if (n === hit) return -1; const a = phn(n); return a.startsWith(x) ? 0 : a.split(' ').some((w) => w.startsWith(x)) ? 1 : a.includes(x) ? 2 : 9; };
  return names.filter((n) => rk(n) < 9).sort((a, b) => rk(a) - rk(b) || a.localeCompare(b));
};
const fallbackStates = () => PHD.provinces.map((p) => ({ isoCode: p.name, name: p.name, alt: p.name === 'Metro Manila' ? 'NCR National Capital Region' : p.region, ncr: p.name === 'Metro Manila' }));
const phStates = async () => {
  let L; try { L = [...(await psgc('/provinces.json')).filter((p) => String(p.regionCode) !== NCR).map((p) => ({ isoCode: String(p.code), name: p.name })),
    { isoCode: NCR, name: 'Metro Manila', alt: 'NCR National Capital Region', ncr: true }]; } catch { L = fallbackStates(); }   // NCR has no provinces in PSGC; its cities/municipalities hang off the region
  return L.sort((a, b) => a.name.localeCompare(b.name));
};
const phCities = async (st) => {
  let names; try { names = (await psgc(st.ncr ? `/regions/${NCR}/cities-municipalities.json` : `/provinces/${st.isoCode}/cities-municipalities.json`)).map((c) => c.name); }
  catch { names = PHD.places.filter((c) => phn(c.province) === phn(st.name)).map((c) => c.name); }
  return [...new Set(names.map(phLabel))];
};
const states = async (code) => cc(code) === 'PH' ? phStates() : State.getStatesOfCountry(cc(code));
const findState = async (code, v) => {
  const all = await states(code), exact = all.find((s) => s.isoCode.toLowerCase() === String(v).toLowerCase() || norm(s.name) === norm(v));
  return exact ?? (cc(code) === 'PH' ? undefined : all.find((s) => same(s.name, v)));
};
const DOWN = 'The Philippine location service is unavailable right now. Please try again in a moment.';
const hasCity = (code, name, stateCode) => {
  const all = stateCode ? City.getCitiesOfState(cc(code), stateCode) : City.getCitiesOfCountry(cc(code)) ?? [];
  return all.some((c) => same(c.name, name));
};

// ---- checks (also used by /api/register) ----
export function checkMobile(country, mobile) {
  const c = countryInfo(country); if (!c) return { ok: false, error: 'Select a country first.' };
  const p = parsePhoneNumberFromString(String(mobile ?? ''), c.code);   // handles trunk "0" and typed +prefix
  if (!p || p.country !== c.code && !(p.countryCallingCode === c.dial.slice(1)) || !p.isValid()) return { ok: false, dial: c.dial, error: `Invalid ${c.name} mobile number.` };
  const t = p.getType();
  if (t && !['MOBILE', 'FIXED_LINE_OR_MOBILE'].includes(t)) return { ok: false, dial: c.dial, error: `That is not a ${c.name} mobile number.` };
  return { ok: true, dial: c.dial, e164: p.number, national: p.nationalNumber, example: undefined };
}

// MX/DNS lookup is OFF by default (it can fail on restricted networks). Turn on with EMAIL_MX_CHECK=on in .env.
export async function checkEmail(email, { mx = process.env.EMAIL_MX_CHECK === 'on' } = {}) {
  const em = String(email ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em) || em.length > 255) return { ok: false, error: 'Enter a valid email address.' };
  const domain = em.split('@')[1];
  if (!PUBLIC.has(domain)) return { ok: false, domain, error: 'Only public email providers (Gmail, Outlook, Yahoo, iCloud...) are allowed.' };
  if (mx) { try { if (!(await dns.resolveMx(domain)).length) throw 0; } catch { return { ok: false, domain, error: 'That email domain cannot receive mail.' }; } }
  return { ok: true, email: em, domain };
}

// ---- ZIP <-> city outside the Philippines: free Zippopotam.us lookup (no offline dataset exists for these) ----
// Blocking only when the ZIP is clearly in a different state (US/CA/AU, where state codes are reliable) or is not a US ZIP.
// Everywhere else a mismatch is just a warning, and if the service is unreachable we fall back to the format check.
const ZIPPO = new Set('AD AR AS AT AU BD BE BG BR CA CH CZ DE DK DO ES FI FO FR GB GF GG GL GP GT GU HR HU IE IN IS IT JP LI LK LT LU LV MC MD MH MK MP MQ MT MX MY NL NO NZ PK PL PM PR PT RE RO RU SE SG SI SJ SK SM TH TR UA US UY VA VI WF YT ZA'.split(' '));
const STRICT_STATE = new Set(['US', 'CA', 'AU']);
const zmemo = new Map();
const zippoKey = (code, z) => code === 'GB' ? z.toUpperCase().split(/\s+/)[0] : code === 'CA' ? z.toUpperCase().replace(/\s+/g, '').slice(0, 3) : code === 'NL' ? z.slice(0, 4) : z;
const zippo = (code, z) => {
  const key = `/${code.toLowerCase()}/${encodeURIComponent(zippoKey(code, z))}`;
  const hit = zmemo.get(key); if (hit && Date.now() - hit.t < 864e5) return hit.p;
  if (zmemo.size > 500) zmemo.clear();
  const p = fetch('https://api.zippopotam.us' + key, { signal: AbortSignal.timeout(4000), headers: { Accept: 'application/json' } })
    .then((r) => r.status === 404 ? { places: [] } : r.ok ? r.json() : Promise.reject(new Error(`Zippopotam ${r.status}`)))
    .then((j) => j.places ?? []);
  zmemo.set(key, { t: Date.now(), p }); p.catch(() => zmemo.delete(key)); return p;
};
async function checkZipPlace(c, st, city, z) {   // -> { error? } | { warning? } | {}
  if (!ZIPPO.has(c.code)) return {};
  let pl; try { pl = await zippo(c.code, z); } catch { return {}; }
  if (!pl.length) return c.code === 'US' ? { error: `${z} is not a valid US ZIP code.` } : {};
  const stOk = pl.some((p) => String(p['state abbreviation'] ?? '').toUpperCase() === String(st.isoCode ?? '').toUpperCase() || norm(p.state) === norm(st.name));
  if (!stOk && STRICT_STATE.has(c.code)) return { error: `ZIP ${z} is in ${[...new Set(pl.map((p) => p.state))].join(' / ')}, not ${st.name}.` };
  if (!stOk || !pl.some((p) => same(p['place name'], city)))
    return { warning: `ZIP ${z} is listed under ${[...new Set(pl.map((p) => p['place name']))].slice(0, 3).join(' / ')}. Double-check that it matches ${city}.` };
  return {};
}

export async function checkAddress({ country, state, city, zip }) {
  const c = countryInfo(country), errors = {}; const out = { ok: false, errors };
  if (!c) return { ...out, errors: { country: 'Select a country.' } };
  const z = String(zip ?? '').trim();
  if (!(ZIP[c.code] ?? LOOSE).test(z)) errors.zip_code = `Invalid ZIP/postal code for ${c.name}.`;
  let sl, st;
  try { sl = await states(c.code); st = sl.length ? await findState(c.code, state) : null; } catch { return { ...out, errors: { ...errors, state: DOWN } }; }
  if (sl.length && !st) errors.state = c.code === 'PH' ? `"${state}" is not a province of the Philippines. Pick one from the list.` : `"${state}" is not a state/province of ${c.name}.`;
  const warnings = [];
  let phName = null;
  if (c.code === 'PH' && city && st) {                       // Philippines: the city/municipality must be one of the province's own
    let L; try { L = await phCities(st); } catch { return { ...out, errors: { ...errors, city: DOWN } }; }
    phName = L.find((n) => phn(n) === phn(city)) ?? null;
    if (!phName) errors.city = `"${city}" is not a city or municipality of ${st.name}. Pick one from the list.`;
  }
  if (city && !errors.state && c.code !== 'PH') {   // other countries: the city must belong to the selected state
    const inState = City.getCitiesOfState(c.code, st?.isoCode ?? '') ?? [];
    if (inState.length ? !inState.some((x) => same(x.name, city)) : false) {
      const other = (City.getCitiesOfCountry(c.code) ?? []).find((x) => same(x.name, city));
      const os = other && sl.find((x) => x.isoCode === other.stateCode);
      if (other) errors.city = `\"${city}\" is in ${os?.name ?? 'another state/province'}, not ${st.name}.`;
      else warnings.push(`\"${city}\" is not in our city list; double-check the spelling.`);
    }
  }
  // The ZIP must belong to the chosen city (PH: offline from ph-zip.json; elsewhere: live lookup, see checkZipPlace)
  let zipWarning;
  if (!errors.zip_code && !errors.state && !errors.city && st && city) {
    if (c.code === 'PH') { const m = checkPhZip({ state: st.name, city: phName, zip: z }); if (!m.ok) errors.zip_code = m.error; }
    else { const m = await checkZipPlace(c, st, city, z); if (m.error) errors.zip_code = m.error; else if (m.warning) { zipWarning = m.warning; warnings.push(m.warning); } }
  }
  out.warnings = warnings;
  return { ...out, ok: !Object.keys(errors).length, errors, zipWarning, state: st?.name ?? state, stateCode: st?.isoCode };
}

// ---- routes ----
export const geo = Router();
geo.get('/countries', (q, r) => r.json(search(Country.getAllCountries().map((c) => countryInfo(c.isoCode)).filter(Boolean), q.query.q, (c) => c.name)));   // ?q=p -> Philippines, Pakistan, ... (type-ahead)
geo.get('/countries/:code', (q, r) => { const c = countryInfo(q.params.code); c ? r.json(c) : r.status(404).json({ error: 'Unknown country.' }); });
geo.get('/states', async (q, r) => {
  if (!countryInfo(q.query.country)) return r.status(400).json({ error: 'Valid ?country=XX required.' });
  try { r.json(search((await states(q.query.country)).map((s) => ({ code: s.isoCode, name: s.name, alt: s.alt ?? '' })), q.query.q, (s) => (s.name + ' ' + (s.alt ?? '')).trim())); }
  catch (err) { console.error('states:', err.message); r.status(503).json({ error: DOWN }); }
});
geo.get('/cities', async (q, r) => {
  const { country, state } = q.query; if (!countryInfo(country)) return r.status(400).json({ error: 'Valid ?country=XX required.' });
  try {
    if (cc(country) === 'PH') { const pv = state ? await findState('PH', state) : null; return r.json(pv ? phSearch(await phCities(pv), q.query.q) : []); }   // only the places of the chosen province (no 100-item cut)
    const s = state ? await findState(country, state) : null;
    let L = (s ? City.getCitiesOfState(cc(country), s.isoCode) : null) ?? [];
    if (!L.length && !s) L = City.getCitiesOfCountry(cc(country)) ?? [];   // no state chosen yet; with a state chosen we never leak other states' cities
    const names = [...new Set(L.map((c) => c.name))].sort((a, b) => a.localeCompare(b));
    r.json(search(names, q.query.q).slice(0, 100));
  } catch (err) { console.error('cities:', err.message); r.status(503).json({ error: DOWN }); }
});
geo.get('/zips', (q, r) => {   // Philippines only: the ZIP codes of one city/municipality (feeds the ZIP dropdown)
  const { country, state, city } = q.query;
  if (cc(country) !== 'PH') return r.status(400).json({ error: 'ZIP list is only available for the Philippines.' });
  if (!state || !city) return r.json({ zips: [], exact: true });
  r.json(zipsFor({ state: String(state), city: String(city) }));
});
geo.post('/validate', async (q, r) => r.json(await checkAddress(q.body ?? {})));   // country/state + ZIP format

export const check = Router();
check.post('/mobile', (q, r) => r.json(checkMobile(q.body?.country, q.body?.mobile)));
check.post('/email', async (q, r) => r.json(await checkEmail(q.body?.email)));