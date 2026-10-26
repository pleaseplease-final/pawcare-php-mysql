const externalReference=v=>v.batch==='EXTERNAL-HIST' || /external history.*guide/i.test(v.protocol_type || '');
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {query} from './db.js';
import {ensureVitalsSchema} from './vitals.js';
import {ensureCheckoutSchema} from './database/clinicSchema.js';
import {ensureCareSchema} from './careWorkflow.js';
let ready;
export const cardError=(message,status=400)=>Object.assign(Error(message),{status});
export function ensureDigitalVetCardSchema(){
 return ready ||= (async()=>{
  await ensureVitalsSchema();await ensureCheckoutSchema();await ensureCareSchema();
  if(!(await query("SELECT version FROM pawcare_schema_migrations WHERE version='digital-vet-card-v1'")).rows.length)
   await query(readFileSync(new URL('./database/digital-vet-card.sql',import.meta.url),'utf8'));
  if(!(await query("SELECT version FROM pawcare_schema_migrations WHERE version='vaccination-card-fields-v1'")).rows.length)
   await query(readFileSync(new URL('./database/vaccination-card-fields.sql',import.meta.url),'utf8'));
 })().catch(error=>{ready=undefined;throw error;});
}
export async function cardPatient(client,petId,user){
 const params=[petId];let scope='';
 if(user?.role==='owner'){params.push(user.ownerId);scope=' AND owner_id=$2';}
 if(user?.role==='vet'){params.push([user.id,user.vetId].filter(Boolean));scope=' AND EXISTS(SELECT 1 FROM appointments WHERE pet_id=pets.id AND vet_id=ANY($2::varchar[]))';}
 const pet=(await client.query(`SELECT * FROM pets WHERE id=$1${scope} FOR UPDATE`,params)).rows[0];
 if(!pet)throw cardError('Patient not found or no longer assigned to you.',404);
 return pet;
}
export async function internalCardReference(client,petId,current){
 if(current?.trim())return current;
 return (await client.query("UPDATE pets SET vaccination_card_id='PAT-'||md5(id) WHERE id=$1 AND NULLIF(trim(vaccination_card_id),'') IS NULL RETURNING vaccination_card_id",[petId])).rows[0]?.vaccination_card_id || (await client.query('SELECT vaccination_card_id FROM pets WHERE id=$1',[petId])).rows[0]?.vaccination_card_id;
}
const date=value=>value instanceof Date?value.toISOString().slice(0,10):value || null;
const iso=value=>value instanceof Date?value.toISOString():value || null;
export async function cardHistory(client,pet){
 const owner=(await client.query('SELECT name,address,phone,email FROM owners WHERE id=$1',[pet.owner_id])).rows[0] || {};
 const vets=(await client.query("SELECT id,vet_id,first_name,last_name FROM users WHERE role='vet' ORDER BY id")).rows;
 const vetName=id=>{const vet=vets.find(v=>v.id===id||v.vet_id===id);return vet?`${vet.first_name} ${vet.last_name}`:'Not recorded';};
 const vaccinations=(await client.query('SELECT * FROM vaccinations WHERE pet_id=$1 AND done=true ORDER BY date,id',[pet.id])).rows
  .filter(v=>!externalReference(v) && !/flea|tick|heartworm|prophylaxis/i.test(`${v.vaccine} ${v.protocol_type || ''}`))
  .map(v=>({id:v.id,kind:/deworm|parasiticide/i.test(v.vaccine)?'deworming':'vaccination',date:date(v.date),createdAt:iso(v.created_at),visitId:v.appt_id || null,vaccine:v.vaccine,brand:v.brand || '',manufacturer:v.manufacturer || '',batch:v.batch || '',serialNumber:v.serial_number || '',nextDue:date(v.next_due),vetName:vetName(v.vet_id)}));
 // Corrections remain in the clinical history; the card uses the current measured weight.
 const weights=(await client.query(`SELECT m.* FROM vital_measurements m WHERE pet_id=$1 AND kind='weight' AND origin='clinic' AND source<>'admission'
  AND NOT EXISTS(SELECT 1 FROM vital_measurements c WHERE c.corrects_id=m.id) ORDER BY measurement_date,id`,[pet.id])).rows
  .map(m=>({id:m.id,kind:'weight',date:date(m.measurement_date),visitId:m.appt_id || null,value:Number(m.value),unit:'kg'}));
 const events=[...vaccinations,...weights].sort((a,b)=>`${b.date || ''}|${b.id}`.localeCompare(`${a.date || ''}|${a.id}`));
 return {complete:true,pet:{id:pet.id,internalReference:pet.vaccination_card_id,name:pet.name,species:pet.species,speciesOther:pet.species_other || '',breed:pet.breed,sex:pet.sex,birth:date(pet.birth),color:pet.color || '',neutered:pet.neutered || '',microchipNumber:pet.microchip_number || '',microchipDate:date(pet.microchip_date),ownerName:owner.name || 'Not recorded'},owner,events};
}
// Caller owns the transaction. Card changes and their audit entry commit together.
export async function refreshDigitalVetCard(client,petId,{pet,history}={}){
 pet ||= await cardPatient(client,petId);
 const snapshot=history || await cardHistory(client,pet);
 const contentHash=createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
 const saved=(await client.query(`INSERT INTO digital_vet_cards(pet_id,document_reference,revision,content_hash,snapshot)
  VALUES($1::varchar,'DVC-'||md5($1::text),1,$2,$3) ON CONFLICT(pet_id) DO UPDATE SET revision=digital_vet_cards.revision+1,refreshed_at=clock_timestamp(),content_hash=EXCLUDED.content_hash,snapshot=EXCLUDED.snapshot
  WHERE digital_vet_cards.content_hash<>EXCLUDED.content_hash RETURNING *`,[petId,contentHash,JSON.stringify(snapshot)])).rows[0];
 if(saved)await client.query('INSERT INTO audit_logs(user_name,user_role,action) VALUES($1,$2,$3)',['Document publisher','system',`Published Digital Vet Card ${saved.document_reference} revision ${saved.revision} for patient ${petId}`]);
 const row=saved || (await client.query('SELECT * FROM digital_vet_cards WHERE pet_id=$1',[petId])).rows[0];
 return {reference:row.document_reference,revision:row.revision,issuedAt:iso(row.issued_at),refreshedAt:iso(row.refreshed_at),snapshot:row.snapshot};
}
