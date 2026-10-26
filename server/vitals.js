import {readFileSync} from 'node:fs';
import {query} from './db.js';
import {ensureAdmissionsSchema} from './admissions.js';
import {ensurePetRegistrationSchema} from './petRegistration.js';
export const vitalError=(message,status=400)=>Object.assign(Error(message),{status});
let ready;
export function ensureVitalsSchema() {
 return ready ||= (async()=>{
  await ensurePetRegistrationSchema();await ensureAdmissionsSchema();
  const exists=(await query("SELECT to_regclass(format('%I.pawcare_schema_migrations', current_schema())) AS migrations")).rows[0]?.migrations;
  if(!exists || !(await query("SELECT version FROM pawcare_schema_migrations WHERE version='vitals-history-v1'")).rows.length)
   await query(readFileSync(new URL('./database/vitals-history.sql',import.meta.url),'utf8'));
 })().catch(error=>{ready=undefined;throw error;});
}
export function vitalView(r) {
 return {id:r.id,petId:r.pet_id,visitId:r.appt_id,kind:r.kind,value:r.value===null?null:Number(r.value),unit:r.unit,measuredAt:r.measured_at,date:r.measurement_date,recordedAt:r.source==='legacy intake snapshot'?null:r.recorded_at,staffId:r.staff_id,staffName:r.staff_name,staffRole:r.staff_role,source:r.source,origin:r.origin,notes:r.notes,correctsId:r.corrects_id,correctionReason:r.correction_reason,supersededBy:r.superseded_by || null};
}
