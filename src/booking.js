/* Booking service catalog and legacy client helpers.
   Pure JS, no React. "Today" is read from the clock each time, so a long-running server never goes stale. */

export const pad = n => String(n).padStart(2, "0");
export const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const clinicParts = () => Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date()).map(p => [p.type, p.value]));
export const today = () => { const p = clinicParts(); return `${p.year}-${p.month}-${p.day}`; };
export const plus = n => new Date(Date.parse(today() + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
export const nowHM = () => { const p = clinicParts(); return `${p.hour}:${p.minute}`; };
export const fmt12 = t => { const [h, m] = t.split(":").map(Number); return `${h % 12 || 12}:${pad(m)} ${h < 12 ? "AM" : "PM"}`; };

export const VETS = [["v1", "Dr. Ana Cruz"], ["v2", "Dr. Ben Lim"]];
export const DAY_START = "08:00", DAY_END = "17:00", STEP = 30;
export const MAX_DAYS = 90;
export const lastDay = () => plus(MAX_DAYS);
const BUSY = ["Cancelled", "Rejected", "No-show"];
export const OPEN = ["Pending Approval", "Scheduled"];
const LEGACY_DUR = 30;   // visits booked without a service (e.g. by staff) count as 30 min

export const SERVICES = {
  vaccination: { label: "Vaccination", icon: "💉", dur: 30, blurb: "Vaccines and boosters", pick: "Which vaccine?", hint: "Not sure? Choose “Not sure” and the vet will advise", prefix: "Vaccination – ",
    options: ["Anti-rabies", "5-in-1", "6-in-1", "8-in-1", "Kennel cough", "Feline 4-in-1", "Not sure, ask the vet", "Other"] },
  deworming: { label: "Deworming", icon: "💊", dur: 30, blurb: "Worm and parasite prevention", pick: "Reason for visit", hint: "Treatment is decided by your veterinarian", prefix: "Deworming – ", options: ["Routine deworming", "Follow-up", "Other"] },
  surgery: { retired: true, label: "Surgery / Dental", icon: "🩺", dur: 120, blurb: "Assessment and procedure slot", pick: "Reason for visit", hint: "The clinic confirms preparation and suitability", prefix: "Surgery – ", options: ["Surgical assessment", "Dental assessment", "Follow-up", "Other"] },
  grooming: { label: "Grooming", icon: "✂️", dur: 60, blurb: "Grooming and sanitary care", pick: "Reason for visit", hint: "The clinic confirms the service", prefix: "Grooming – ", options: ["Routine grooming", "Sanitary care", "Other"] },
  checkup: { label: "Check-up", icon: "🩺", dur: 60, blurb: "Exam and consultation", pick: "Reason for the check-up", hint: "Choose the closest match", prefix: "",
    options: ["Annual check-up", "Skin or ear problem", "Limping or injury", "Vomiting or diarrhea", "Not eating or drinking", "Dental check", "Follow-up visit", "Other"] },
};
/* Surgery and dental are no longer booked directly: the vet decides during a check-up.
   The entry stays so older visits keep their length and label. */
export const bookableServices = (keep) => Object.entries(SERVICES).filter(([k, s]) => !s.retired || k === keep);
export const CANCEL_WHY = ["Schedule conflict", "My pet is feeling better", "Booked by mistake", "Need a different date", "Other"];

/* Philippine holidays: the clinic is closed. Each year add that year's one-off dates to HOLIDAYS_BY_YEAR. */
const FIXED_HOLIDAYS = {
  "01-01": "New Year’s Day", "04-09": "Araw ng Kagitingan", "05-01": "Labor Day", "06-12": "Independence Day",
  "08-21": "Ninoy Aquino Day", "11-01": "All Saints’ Day", "11-30": "Bonifacio Day", "12-08": "Feast of the Immaculate Conception",
  "12-25": "Christmas Day", "12-30": "Rizal Day", "12-31": "New Year’s Eve",
};
const HOLIDAYS_BY_YEAR = { 2026: { "02-17": "Chinese New Year", "03-20": "Eid’l Fitr", "11-02": "All Souls’ Day", "12-24": "Christmas Eve" } };
const ymdOf = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, g = Math.floor((b - Math.floor((b + 8) / 25) + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mo = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(y, mo - 1, day);
}
const shiftDay = (dt, n) => { const x = new Date(dt); x.setDate(x.getDate() + n); return ymdOf(x.getFullYear(), x.getMonth() + 1, x.getDate()); };
function movable(y) {
  const E = easter(y), out = { [shiftDay(E, -3)]: "Maundy Thursday", [shiftDay(E, -2)]: "Good Friday", [shiftDay(E, -1)]: "Black Saturday" };
  const last = new Date(y, 7, 31); while (last.getDay() !== 1) last.setDate(last.getDate() - 1);
  out[ymdOf(y, 8, last.getDate())] = "National Heroes Day";
  return out;
}
export function holidayName(date) {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return "";
  const y = Number(date.slice(0, 4)), md = date.slice(5);
  return FIXED_HOLIDAYS[md] || (HOLIDAYS_BY_YEAR[y] || {})[md] || movable(y)[date] || "";
}

const toMin = t => {
  const match=/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i.exec(String(t || ''));
  if(!match)return NaN;
  let h=Number(match[1]);const m=Number(match[2]),period=match[3]?.toUpperCase();
  if(m>59 || h>(period?12:23) || (period && h<1))return NaN;
  if(period)h=h%12+(period==='PM'?12:0);
  return h*60+m;
};
const toHM = n => `${pad(Math.floor(n / 60))}:${pad(n % 60)}`;
export const addMin = (t, n) => toHM(toMin(t) + n);
export const durText = n => { const h = Math.floor(n / 60), m = n % 60; return [h ? `${h} hr${h > 1 ? "s" : ""}` : "", m ? `${m} min` : ""].filter(Boolean).join(" "); };
export const niceDay = d => new Date(d + "T00:00:00").toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric" });

export const inferService = r => {
  if (!r) return "";
  // Deworming is its own service, as it is on the server.
  if (/deworm/i.test(r)) return "deworming";
  if (/vaccin|rabies|booster|5-in-1|6-in-1|8-in-1|kennel|feline|\bshot/i.test(r)) return "vaccination";
  return "checkup";
};
export const serviceOf = a => a.service && SERVICES[a.service] ? a.service : inferService(a.reason);
export const durOf = a => a.durationMinutes || (SERVICES[a.service] || { dur: LEGACY_DUR }).dur;

export const makeReason = (service, sel, other) => {
  const S = SERVICES[service], d = sel === "Other" ? other : sel;
  if (sel === "Deworming") return "Deworming";
  if (sel === "Not sure, ask the vet") return "Vaccination";
  return S.prefix + d;
};
export const splitReason = (service, reason) => {
  const S = SERVICES[service]; if (!S || !reason) return ["", ""];
  if (service === "vaccination" && reason === "Deworming") return ["Deworming", ""];
  if (service === "vaccination" && reason === "Vaccination") return ["Not sure, ask the vet", ""];
  const rest = S.prefix && reason.startsWith(S.prefix) ? reason.slice(S.prefix.length) : reason;
  return S.options.includes(rest) && rest !== "Other" ? [rest, ""] : ["Other", rest];
};

/* Every visit that blocks a vet's time: the owner's own plus anonymous "busy" blocks from other clients. */
const everyone = db => [...(db.appts || []), ...(db.busy || [])];

export function openSlots(db, { service, vetId, date }, editing) {
  const S = SERVICES[service]; if (!S || !vetId || !date || date < today() || date > lastDay() || holidayName(date)) return [];
  const busy = everyone(db).filter(a => (!editing || a.id !== editing.id) && !BUSY.includes(a.status) && a.bookingKind !== "walk-in" && a.vetId === vetId && a.date === date).map(a => [toMin(a.time), toMin(a.time) + durOf(a)]);
  const out = [], end = toMin(DAY_END), t0 = today(), now = nowHM();
  for (let m = toMin(DAY_START); m + S.dur <= end; m += STEP) {
    const t = toHM(m);
    if (date === t0 && t <= now) continue;
    if (busy.some(([a, b]) => m < b && a < m + S.dur)) continue;
    out.push(t);
  }
  return out;
}
export function allowedTimes(db, v, editing) {
  const list = openSlots(db, v, editing);
  if (editing && editing.vetId === v.vetId && editing.date === v.date && serviceOf(editing) === v.service && !list.includes(editing.time)) return [...list, editing.time].sort();
  return list;
}
export function nextOpenDay(db, v, editing) {
  const last = lastDay();
  for (let i = 1; i <= MAX_DAYS; i++) { const d = plus(i); if (d > v.date && d <= last && openSlots(db, { ...v, date: d }, editing).length) return d; }
  return null;
}

/* The full booking check. `ownPets` are the pets this owner may book for. */
export function validateBooking(db, ownPets, v, editing) {
  const e = {}, S = SERVICES[v.service], T = today(), LAST = lastDay();
  if (!v.service) e.service = "Choose a service"; else if (!S) e.service = "Pick a service from the list"; else if (S.retired && !(editing && editing.service === v.service)) e.service = "Book a check-up. The veterinarian will advise if surgery or a dental procedure is needed";
  if (!v.petId) e.petId = "Choose which pet is visiting"; else if (!ownPets.some(p => p.id === v.petId)) e.petId = "Pick one of your own pets";
  if (!v.vetId) e.vetId = "Choose a veterinarian"; else if (!VETS.some(x => x[0] === v.vetId)) e.vetId = "Pick a veterinarian from the list";
  const sameDay = editing && editing.date === v.date;
  if (!v.date) e.date = "Choose a date";
  else if (isNaN(new Date(v.date + "T00:00:00"))) e.date = "Enter a valid date";
  else if (v.date < T && !sameDay) e.date = "Date can’t be in the past";
  else if (v.date > LAST) e.date = `You can book up to ${MAX_DAYS} days ahead (until ${LAST})`;
  else if (holidayName(v.date) && !sameDay) e.date = `The clinic is closed on ${holidayName(v.date)} (holiday). Please pick another day`;
  if (!v.time) e.time = !v.service ? "Choose a service first" : v.date && v.vetId ? "Choose a time" : "Choose a veterinarian and date first";
  else if (S && !allowedTimes(db, v, editing).includes(v.time)) e.time = `That time isn’t open for ${S.label.toLowerCase()} (${durText(S.dur)}). Pick one of the open times`;
  if (!e.petId && v.date && !e.date) {
    const x = everyone(db).find(a => (!editing || a.id !== editing.id) && !BUSY.includes(a.status) && a.petId === v.petId && a.date === v.date);
    const pn = (ownPets.find(p => p.id === v.petId) || {}).name || "This pet";
    if (x) e.date = `${pn} already has a visit that day at ${fmt12(x.time)}`;
  }
  if (S) {
    if (!v.reasonSel) e.reasonSel = "Choose one";
    else if (!S.options.includes(v.reasonSel)) e.reasonSel = "Pick one from the list";
    else if (v.reasonSel === "Other") { const r = String(v.reasonOther || "").trim(); if (!r) e.reasonOther = "Please describe it"; else if (r.length < 3) e.reasonOther = "Use at least 3 characters"; else if (r.length > 200) e.reasonOther = "Keep it under 200 characters"; else if (!/[A-Za-zÀ-ÿ]/.test(r)) e.reasonOther = "Describe it in words, not only numbers or symbols"; }
  }
  const nt = String(v.notes || "").trim(); if (nt.length > 200) e.notes = "Keep notes under 200 characters"; else if (nt && !/[A-Za-zÀ-ÿ]/.test(nt)) e.notes = "Write a few words, not only numbers or symbols";
  return e;
}

export function validateCancel(v) {
  const e = {};
  if (!v.why) e.why = "Please tell us why"; else if (!CANCEL_WHY.includes(v.why)) e.why = "Pick a reason from the list";
  else if (v.why === "Other") { const o = String(v.other || "").trim(); if (o.length < 3) e.other = "Add a short reason (3+ characters)"; else if (o.length > 120) e.other = "Keep it under 120 characters"; else if (!/[A-Za-zÀ-ÿ]/.test(o)) e.other = "Use words, not only numbers or symbols"; }
  return e;
}

/* ---- the visit life cycle, enforced on the server ---- */
export const FLOW = { 'Pending Approval': ["Scheduled", "Cancelled"], Scheduled: ["Checked-in", "Cancelled", "No-show"], "Checked-in": ["In consultation"], "In consultation": ["Completed"], Completed: [], Cancelled: [], "No-show": [] };
export const ACT = { Scheduled: ["assistant", "admin"], "Checked-in": ["assistant", "admin"], "In consultation": ["vet"], Completed: ["vet"], Cancelled: ["assistant", "admin", "owner"], "No-show": ["assistant", "admin"] };

/* Staff and server use this to stop two visits overlapping for one vet (the exact start time isn't enough for longer services). */
export function vetConflict(appts, a) {
  const s = toMin(a.time), e = s + durOf(a);
  return appts.find(x => x.id !== a.id && !BUSY.includes(x.status) && x.vetId === a.vetId && x.date === a.date && s < toMin(x.time) + durOf(x) && toMin(x.time) < e) || null;
}

export function reservationCovers(appointment, time) {
  if (BUSY.includes(appointment.status) || appointment.bookingKind === "walk-in") return false;
  const start = toMin(appointment.time), slot = toMin(time);
  return slot >= start && slot < start + durOf(appointment);
}
