import { today, plus } from './booking.js';
import {addressError, externalHistoryErrors} from './externalHistory.js';
import {vaccineChoiceError} from './vaccineBooking.js';
import {normalizeSpecies} from './preventiveSchedule.js';

export const walkInBirthWindow = () => { const date = today(); return {today:date,yesterday:plus(-1),oldest:`${Number(date.slice(0,4))-40}${date.slice(4)}`}; };
export function validWalkInBirth(value) {
  const {today:date,oldest} = walkInBirthWindow();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0,10) === value && value < date && value >= oldest;
}
export function savedWalkInRegistration(data, expected) {
  if (!data?.success || !data.owner?.id || !data.pet?.id || !data.pet.vaccinationCardId) throw new Error('The server did not confirm registration. Refresh clinic records before continuing.');
  if (expected?.addToQueue) savedWalkInArrival(data,{petId:data.pet.id,vetId:expected.vetId,reason:expected.reason,service:walkInService(expected.serviceCategory)});
  if (expected?.vaccineId !== undefined && (!data.appointment?.id || data.appointment.petId !== data.pet.id || data.appointment.vetId !== expected.vetId || data.appointment.reason !== expected.reason || data.appointment.service !== 'vaccination' || data.appointment.status !== 'Scheduled')) throw new Error('The server did not confirm the requested vaccination arrival. Refresh clinic records before continuing.');
  return {owner:data.owner,pet:data.pet,appointment:data.appointment || null,
    vacc:(data.vaccs || []).map(v => ({id:v.id,petId:v.pet_id,cardId:v.card_id,
      vaccine:v.vaccine,brand:v.brand || '',batch:v.batch || '',date:v.date || '',nextDue:v.next_due || null,
      doseNo:v.dose_no,doseOf:v.dose_of,done:Boolean(v.done),automated:Boolean(v.automated),
      vetId:v.vet_id || '',recordedBy:v.recorded_by || '',protocolType:v.protocol_type || '',notes:v.notes || ''}))};
}

export const walkInServices = ['consultation','vaccination','deworming','flea_tick','grooming','emergency'];
export const walkInService = category => ['vaccination','deworming','grooming'].includes(category) ? category : 'checkup';
export function walkInReasonError(reason) {
  if(typeof reason!=='string' || reason.trim().length<3 || reason.length>300) return 'Enter a visit reason between 3 and 300 characters.';
  if(!/\p{L}/u.test(reason) || /[\u0000-\u001f\u007f]/.test(reason)) return 'Describe the reason for the visit using words.';
  return '';
}
export function walkInVisitErrors(v,{vets}={}) {
  if(!v.addToQueue) return {};
  const errors={};
  if(!walkInServices.includes(v.serviceCategory ?? 'consultation')) errors.serviceCategory='Choose a purpose from the list.';
  if(typeof v.vetId!=='string' || !v.vetId.trim() || vets && !vets.some(vet=>vet.id===v.vetId)) errors.vetId='Choose an available veterinarian.';
  if(v.serviceCategory==='vaccination') errors.vaccineId=vaccineChoiceError(v.vaccineId,normalizeSpecies(v.species));
  else errors.reason=walkInReasonError(v.reason);
  return Object.fromEntries(Object.entries(errors).filter(([,error])=>error));
}
export function savedWalkInArrival(data,expected) {
  const visit=data?.appointment;
  if(data?.success!==true || !visit?.id || visit.petId!==expected.petId || visit.vetId!==expected.vetId || visit.reason!==expected.reason || visit.service!==expected.service || visit.status!=='Scheduled' || visit.bookingKind!=='walk-in' || !/^\d{4}-\d{2}-\d{2}$/.test(visit.date || '')) throw new Error('The server did not confirm this arrival. Refresh clinic records before continuing.');
  return visit;
}

const NAME_RE = /^[A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9 .'\-]*$/;
const LETTER_RE = /[A-Za-zÀ-ÿ]/;
const PH_MOBILE_RE = /^(09|\+639)\d{9}$/;
const DECIMAL_RE = /^(\d{1,3}(\.\d{1,2})?|\.\d{1,2})$/;

export function validateWalkInFields(v, {vets} = {}) {
  const {today:TODAY,oldest:OLDEST} = walkInBirthWindow();
  const e = {};

  // 1. Owner Name
  const oName = (v.ownerName || "").trim();
  if (!oName) e.ownerName = "Enter owner's full name";
  else if (oName.length < 2) e.ownerName = "Use at least 2 characters";
  else if (oName.length > 60) e.ownerName = "Keep name under 60 characters";
  else if (!/^[A-Za-zÀ-ÿ.'\- ]+$/.test(oName) || !LETTER_RE.test(oName)) e.ownerName = "Letters, spaces, . ' - only";

  // 2. Mobile Phone (required, valid Philippine format)
  const rawPh = (v.phone || "").trim().replace(/[\s-]/g, "");
  if (!rawPh) e.phone = "Enter owner's mobile number";
  else if (!PH_MOBILE_RE.test(rawPh)) e.phone = "Use valid PH mobile: 09XXXXXXXXX or +639XXXXXXXXX";

  // 3. Email (optional, validated if present)
  const em = (v.email || "").trim();
  if (em && (em.length>255 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em))) e.email = "Enter a valid email address";

  // 4. Address (optional)
  const addr = (v.address || "").trim();
  if (addressError(addr)) e.address = addressError(addr);

  // 5. Pet Name
  const pName = (v.petName || "").trim();
  if (!pName) e.petName = "Enter pet's name";
  else if (pName.length < 2) e.petName = "Use at least 2 characters";
  else if (pName.length > 30) e.petName = "Keep name under 30 characters";
  else if (!NAME_RE.test(pName)) e.petName = "Start with a letter or number. Use letters, numbers and . ' - only";
  else if (!LETTER_RE.test(pName)) e.petName = "The name needs at least one letter";

  // 6. Species
  if (!v.species) e.species = "Select animal species classification";

  // 7. Other species details
  if (v.species && v.species.includes("Other")) {
    const o = (v.otherSpecies || "").trim();
    if (!o) e.otherSpecies = "Specify what kind of animal";
    else if (o.length < 3) e.otherSpecies = "Use at least 3 characters";
    else if (o.length > 30) e.otherSpecies = "Keep it under 30 characters";
    else if (!LETTER_RE.test(o)) e.otherSpecies = "Use words, not only numbers or symbols";
  }

  // 8. Breed
  const br = (v.breed || "").trim();
  if (br.length > 50) e.breed = "Keep breed under 50 characters";
  for (const [key,max,label] of [['breed',50,'breed'],['color',40,'color'],['notes',200,'notes']]) {
    const value=String(v[key] || '').trim();
    if(value && (!LETTER_RE.test(value) || value.length>max)) e[key]=`Use words for ${label}, up to ${max} characters.`;
  }
  for (const [key,max,active] of [['customBreed',50,v.species?.includes('Other') || v.breed?.startsWith('Other')],['customColor',40,v.color?.startsWith('Other')]]) {
    const value=String(v[key] || '').trim();
    if(active && value && (!LETTER_RE.test(value) || value.length>max)) e[key]=`Use words, up to ${max} characters.`;
  }

  // 9. Sex
  if (!v.sex) e.sex = "Choose male or female";
  else if (!["Male", "Female"].includes(v.sex)) e.sex = "Pick one from the list";

  // 10. Birth date (Must be yesterday or earlier; never in the future)
  if (!v.birth) e.birth = "Enter the birth date (yesterday or earlier)";
  else if (!validWalkInBirth(v.birth)) e.birth = "Enter a valid birth date";
  else if (v.birth >= TODAY) e.birth = "Birth date cannot be today or in the future. Please select yesterday or earlier";
  else if (v.birth < OLDEST) e.birth = "That date is too far back. Check the year";

  // 11. Weight
  const wt = String(v.weight ?? "").trim();
  if (!wt) e.weight = "Enter patient weight in kg";
  else if (!DECIMAL_RE.test(wt)) e.weight = "Use numbers only, for example 5.5";
  else if (+wt < 0.05) e.weight = "Weight must be at least 0.05 kg";
  else if (+wt > 120) e.weight = "Weight cannot exceed 120 kg";

  // 12. Neutered
  if (!v.neutered) e.neutered = "Choose spayed/neutered status";

  // 13. Rodent Dental Occlusion
  if (v.species && v.species.includes("Rodent")) {
    if (!v.dentalOcclusion) e.dentalOcclusion = "Please select occlusion status";
  }

  // 14. Notes
  const notes = (v.notes || "").trim();
  if (notes.length > 200) e.notes = "Keep notes under 200 characters";

  Object.assign(e,walkInVisitErrors(v,{vets}));
  Object.assign(e,externalHistoryErrors({priorVaccines:v.hasExternalHistory ? v.priorVaccines : [],externalClinicNotes:v.hasExternalHistory ? v.externalClinicNotes : ''}));

  return e;
}

// Approval adds measurement history on the next state refresh. Only facts
// relevant to this arrival review should invalidate its confirmation.
export function walkInReviewContext({pet,owner,vetId,reason,service,vaccineId,activeVisits,doctors,estimate,date}) {
  return {
    pet:pet ? {id:pet.id,ownerId:pet.ownerId,name:pet.name,species:pet.species,registrationStatus:pet.registrationStatus || 'Verified'} : null,
    owner:owner ? {id:owner.id,name:owner.name,phone:owner.phone || '',email:owner.email || '',address:owner.address || ''} : null,
    vetId,reason,service,vaccineId,date,estimate,
    activeVisits:activeVisits.map(a=>({id:a.id,status:a.status})),doctors,
  };
}
