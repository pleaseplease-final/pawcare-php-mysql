import { readFileSync } from 'node:fs';
import { query } from './db.js';
import {externalHistoryErrors} from '../src/externalHistory.js';
import { clinicClock, validDate } from './scheduling.js';
import { petPlausibility } from '../src/petLimits.js';

let ready;
export function ensurePetRegistrationSchema() {
  return ready ||= (async () => {
    const exists = (await query("SELECT to_regclass(format('%I.pawcare_schema_migrations', current_schema())) AS migrations")).rows[0]?.migrations;
    if (!exists || !(await query("SELECT version FROM pawcare_schema_migrations WHERE version='pet-registration-v1'")).rows.length)
      await query(readFileSync(new URL('./database/pet-registration.sql', import.meta.url), 'utf8'));
    if (!(await query("SELECT version FROM pawcare_schema_migrations WHERE version='owner-pet-onboarding-v1'")).rows.length)
      await query(readFileSync(new URL('./database/owner-pet-onboarding.sql', import.meta.url), 'utf8'));
    if (!(await query("SELECT version FROM pawcare_schema_migrations WHERE version='patient-reference-history-v1'")).rows.length)
      await query(readFileSync(new URL('./database/patient-reference-history.sql', import.meta.url), 'utf8'));
  })().catch(error => { ready = undefined; throw error; });
}
export const registrationError = (message, status = 400) => Object.assign(new Error(message), { status });

export function validatePetPhoto(photo) {
  if (typeof photo !== 'string' || photo.length > 700000) throw registrationError('Choose a JPG, PNG or WEBP picture up to 500 KB after resizing.');
  if (!photo) return photo;
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(photo);
  if (!match) throw registrationError('Choose a JPG, PNG or WEBP picture.');
  const [, type, encoded] = match;
  const bytes = Buffer.from(encoded, 'base64');
  const valid = type === 'jpeg' ? bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
    : type === 'png' ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  if (!valid || bytes.length > 512 * 1024 || bytes.toString('base64') !== encoded) throw registrationError('That picture could not be read. Choose a JPG, PNG or WEBP up to 500 KB after resizing.');
  return photo;
}

const speciesNames = new Map([
  ['Canine','Canine'],['Dog','Canine'],['Canine (Dog)','Canine'],
  ['Feline','Feline'],['Cat','Feline'],['Feline (Cat)','Feline'],
  ['Lagomorph','Lagomorph'],['Rabbit','Lagomorph'],['Lagomorph (Rabbit)','Lagomorph'],
  ['Rodent','Rodent'],['Rodent (Hamster / Guinea Pig / etc.)','Rodent'],
  ['Avian','Avian'],['Bird','Avian'],['Avian (Bird)','Avian'],['Other','Other'],['Other / Exotic','Other']
]);
const dentalStatuses = ['Normal / Aligned (Healthy Occlusion)','Incisor Overgrowth (Needs Trim)','Molar Spurs / Malocclusion (Needs Dental Burr)','Signs of Drooling / Wet Chin (Suspected Malocclusion)','Not Evaluated Yet'];
// Extra species-aware sanity checks for new registrations and edits. Older saved requests are not re-judged at approval.
export function validatePetPlausibility(data, body) {
  const errors = petPlausibility({species: data.species, weight: Number(body.weight), birth: body.birth, today: clinicClock().date});
  const message = errors.weight || errors.birth;
  if (message) throw registrationError(message);
}
export function validatePetRegistration(body) {
  const text = (key, max, required = false) => {
    const value = body[key] ?? '';
    if (typeof value !== 'string' || (key === 'notes' ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/ : /[\u0000-\u001f\u007f]/).test(value) || value.trim().length > max || required && !value.trim()) throw registrationError(`Check the ${key} field (maximum ${max} characters).`);
    if (['breed','color','notes'].includes(key) && value.trim() && !/[A-Za-zÀ-ÿ]/.test(value)) throw registrationError(`Use words in the ${key} field.`);
    return value.trim();
  };
  const historyError=Object.values(externalHistoryErrors(body)).find(Boolean);
  if(historyError) throw registrationError(historyError);
  const name = text('name',30,true);
  if (name.length < 2 || !/^[A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9 .'-]*$/.test(name) || !/[A-Za-zÀ-ÿ]/.test(name)) throw registrationError('Use a pet name with 2–30 characters, including at least one letter.');
  const species = speciesNames.get(body.species);
  if (!species) throw registrationError('Choose a species from the list.');
  const speciesOther = text('speciesOther',30,species === 'Other');
  if (species === 'Other' && (speciesOther.length < 3 || !/[A-Za-zÀ-ÿ]/.test(speciesOther))) throw registrationError('Describe the animal species using at least three characters.');
  if (!['Male','Female'].includes(body.sex)) throw registrationError('Choose male or female.');
  const today = clinicClock().date;
  const oldest = `${Number(today.slice(0,4))-40}${today.slice(4)}`;
  if (!validDate(body.birth) || body.birth >= today || body.birth < oldest) throw registrationError('Choose a real birth date within the past 40 years, before today.');
  if (typeof body.weight !== 'number' || !Number.isFinite(body.weight) || body.weight < 0.05 || body.weight > 120 || Math.abs(body.weight*100-Math.round(body.weight*100)) > 0.000001) throw registrationError('Enter a weight from 0.05 to 120 kg, with at most two decimal places.');
  if (!['Yes','No','Not sure'].includes(body.neutered)) throw registrationError('Choose the spay/neuter status.');
  const dentalOcclusion = text('dentalOcclusion',100);
  if (species === 'Rodent' && !dentalStatuses.includes(dentalOcclusion)) throw registrationError('Choose the dental status, or select Not Evaluated Yet.');
  return { priorVaccines:(body.priorVaccines || []).map(v=>v.trim()),externalClinicNotes:(body.externalClinicNotes || '').trim(), name, species, speciesOther:species === 'Other' ? speciesOther : '', breed:text('breed',50), sex:body.sex, birth:body.birth, weight:body.weight, neutered:body.neutered, color:text('color',40), notes:text('notes',200), dentalOcclusion:species === 'Rodent' ? dentalOcclusion : '', photo:validatePetPhoto(body.photo ?? '') };
}

// Lock the owner before any request: create/edit/approve share this order.
export async function lockRegistrationOwner(client, ownerId) {
  if (!ownerId || !(await client.query('SELECT id FROM owners WHERE id = $1 FOR UPDATE',[ownerId])).rows.length) throw registrationError('Your owner profile is unavailable. Contact the clinic.',404);
}
export async function checkRegistrationCapacity(client, ownerId, name, excludeId = null, {pendingRequest = true} = {}) {
  const pets = (await client.query("SELECT name FROM pets WHERE owner_id = $1 AND NOT EXISTS (SELECT 1 FROM pet_requests r WHERE r.pet_id=pets.id AND r.status<>'Approved')",[ownerId])).rows;
  const requests = (await client.query("SELECT name,status FROM pet_requests WHERE owner_id = $1 AND status <> 'Approved' AND ($2::varchar IS NULL OR id <> $2)",[ownerId,excludeId])).rows;
  if (pets.length + requests.length >= 10) throw registrationError('One account can hold up to 10 pets and registration requests.',409);
  if (pendingRequest && requests.filter(r=>r.status==='Pending').length >= 3) throw registrationError('Three requests are already waiting for the clinic. Wait for a review before sending more.',409);
  if ([...pets,...requests].some(p=>p.name.trim().toLowerCase()===name.toLowerCase())) throw registrationError(`A pet or request named ${name} is already on your account. Open the existing record.`,409);
}
export function checkRequestRevision(request, revision) {
  if (!Number.isInteger(revision) || revision !== request.revision) throw registrationError('This request changed while you were reviewing it. Close and reopen it to see the latest details.',409);
}
export async function registrationAudit(client, user, action) {
  await client.query('INSERT INTO audit_logs (user_name,user_role,action) VALUES ($1,$2,$3)',[user.name,user.role,action]);
}

export async function savePendingPatient(client, request) {
  const id=request.pet_id || 'p_pending_'+crypto.randomUUID();
  const {rows}=await client.query(`INSERT INTO pets(id,owner_id,name,species,species_other,breed,sex,birth,weight,color,neutered,notes,photo,dental_occlusion,registration_status)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'Pending')
    ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,species=EXCLUDED.species,species_other=EXCLUDED.species_other,breed=EXCLUDED.breed,
      sex=EXCLUDED.sex,birth=EXCLUDED.birth,weight=EXCLUDED.weight,color=EXCLUDED.color,neutered=EXCLUDED.neutered,notes=EXCLUDED.notes,
      photo=EXCLUDED.photo,dental_occlusion=EXCLUDED.dental_occlusion,registration_status='Pending'
    WHERE pets.owner_id=EXCLUDED.owner_id AND pets.registration_status<>'Verified' RETURNING *`,
    [id,request.owner_id,request.name,request.species,request.species_other || '',request.breed || '',request.sex,request.birth,request.weight,request.color,request.neutered,request.notes,request.photo,request.dental_occlusion]);
  if(!rows.length) throw registrationError('This patient is already verified. Refresh your records.',409);
  await client.query('UPDATE pets SET prior_vaccines=$2,external_clinic_notes=$3 WHERE id=$1',[id,JSON.stringify(request.prior_vaccines || []),request.external_clinic_notes || '']);
  rows[0].prior_vaccines=request.prior_vaccines || []; rows[0].external_clinic_notes=request.external_clinic_notes || '';
  await client.query('UPDATE pet_requests SET pet_id=$2 WHERE id=$1',[request.id,id]);
  await client.query('UPDATE owners SET first_pet_registered_at=COALESCE(first_pet_registered_at,clock_timestamp()) WHERE id=$1',[request.owner_id]);
  request.pet_id=id;
  return rows[0];
}
