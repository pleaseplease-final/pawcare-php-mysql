import express from 'express';
import {query,withTransaction} from '../db.js';
import {ensureVitalsSchema,vitalError,vitalView} from '../vitals.js';
import {correctionErrors} from '../../src/vitalValidation.js';
import {assignedTo} from '../clinicAccess.js';
import {assessWeight,assessTemp} from '../../src/roles/vitals.js';
export const vitalsRouter=express.Router({mergeParams:true});
vitalsRouter.use(async(req,res,next)=>{res.set('Cache-Control','private, no-store');try{await ensureVitalsSchema();next();}catch{res.status(500).json({error:'Unable to load vital history. Please retry.'});}});
async function patientAccess(execute,petId,user) {
 const params=[petId];let scope='';
 if(user.role==='owner'){params.push(user.ownerId);scope=' AND owner_id=$2';}
 if(user.role==='vet'){params.push([user.id,user.vetId].filter(Boolean));scope=' AND EXISTS(SELECT 1 FROM appointments WHERE pet_id=pets.id AND vet_id=ANY($2::varchar[]))';}
 const pet=(await execute(`SELECT * FROM pets WHERE id=$1${scope}`,params)).rows[0];
 if(!pet)throw vitalError('Patient not found or no longer assigned to you.',404);return pet;
}
const errorResponse=(res,error)=>res.status(error.status || (error.code==='23505'?409:500)).json({error:error.status?error.message:error.code==='23505'?'This measurement already has a correction. Refresh the history.':'Unable to save or load vital history. Please retry.'});
vitalsRouter.get('/',async(req,res)=>{
 try {
  const pet=await patientAccess(query,req.params.petId,req.user),params=[pet.id];
  let filter="m.pet_id=$1";
  // Preserve the existing admission privacy boundary: clinical observations remain staff-only.
  if(req.user.role==='owner') filter+=" AND m.source<>'admission'";
  if(req.query.cursor){
   let cursor;try{cursor=JSON.parse(Buffer.from(req.query.cursor,'base64url').toString());}catch{throw vitalError('Invalid history cursor.');}
   if(!cursor || typeof cursor.id!=='string' || cursor.id.length>150 || typeof cursor.at!=='string' || !/^\d{4}-\d{2}-\d{2}T/.test(cursor.at) || !Number.isFinite(Date.parse(cursor.at)))throw vitalError('Invalid history cursor.');
   params.push(cursor.at,cursor.id);filter+=' AND (m.recorded_at,m.id)<($2::timestamptz,$3)';
  }
  const rows=(await query(`SELECT m.*,to_char(m.recorded_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') cursor_at,(SELECT c.id FROM vital_measurements c WHERE c.corrects_id=m.id) superseded_by FROM vital_measurements m WHERE ${filter} ORDER BY m.recorded_at DESC,m.id DESC LIMIT 51`,params)).rows;
  const more=rows.length>50,page=rows.slice(0,50),last=page.at(-1);
  const registrations=(await query('SELECT id,weight,requested_at FROM pet_requests WHERE pet_id=$1 ORDER BY created_at',[pet.id])).rows;
  res.json({success:true,measurements:page.map(vitalView),registrationReports:registrations.map(r=>({id:r.id,value:Number(r.weight),unit:'kg',date:r.requested_at,origin:'registration'})),page:{hasMore:more,cursor:more?Buffer.from(JSON.stringify({id:last.id,at:last.cursor_at})).toString('base64url'):null}});
 }catch(error){errorResponse(res,error);}
});
vitalsRouter.post('/:id/correct',async(req,res)=>{
 try {
  if(!['assistant','vet'].includes(req.user.role))throw vitalError('Only clinical staff can correct a measurement.',403);
  const {requestId,value,reason}=req.body;
  if(typeof requestId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId))throw vitalError('Reopen the correction form before saving.');
  const id='correction-'+requestId.toLowerCase();
  const saved=await withTransaction(async client=>{
   // Match clinical writers: lock visit before patient to serialize snapshot correction.
   const target=(await client.query('SELECT * FROM vital_measurements WHERE id=$1 AND pet_id=$2',[req.params.id,req.params.petId])).rows[0];
   if(!target)throw vitalError('Measurement not found.',404);
   const visit=target.appt_id?(await client.query('SELECT * FROM appointments WHERE id=$1 FOR UPDATE',[target.appt_id])).rows[0]:null;
   await patientAccess(client.query.bind(client),target.pet_id,req.user);
   const patient=(await client.query('SELECT * FROM pets WHERE id=$1 FOR UPDATE',[target.pet_id])).rows[0];
   if(req.user.role==='vet' && (!visit || !assignedTo(visit,req.user)))throw vitalError('Only the assigned veterinarian can correct this visit measurement.',403);
   if(!['weight','temp'].includes(target.kind)||target.origin!=='clinic')throw vitalError('Only a clinic measurement can receive a vital correction. Registration reports remain separate.',409);
   const invalid=Object.values(correctionErrors(value,reason,target.kind)).find(Boolean);
   if(typeof value!=='number'||invalid)throw vitalError(invalid || 'Enter a numeric measurement.');
   const replay=(await client.query('SELECT * FROM vital_measurements WHERE id=$1',[id])).rows[0];
   if(replay){if(replay.corrects_id!==target.id||Number(replay.value)!==value||replay.correction_reason!==reason.trim()||replay.staff_id!==req.user.id)throw vitalError('This correction identifier was already used. Reopen the form.',409);return replay;}
   if((await client.query('SELECT id FROM vital_measurements WHERE corrects_id=$1',[target.id])).rows.length)throw vitalError('This measurement already has a correction. Refresh and correct the latest entry.',409);
   const row=(await client.query(`INSERT INTO vital_measurements(id,pet_id,appt_id,kind,value,unit,measured_at,measurement_date,staff_id,staff_name,staff_role,source,origin,notes,admission_update_id,corrects_id,correction_reason)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,[id,target.pet_id,target.appt_id,target.kind,value,target.unit,target.measured_at,target.measurement_date,req.user.id,req.user.name,req.user.role,target.source,target.origin,target.notes,target.admission_update_id,target.id,reason.trim()])).rows[0];
   // The old entry stays unchanged. Refresh only a snapshot that still references it.
   if(visit?.intake_vitals?.measurementIds?.[target.kind]===target.id){
    const snapshot={...visit.intake_vitals,[target.kind]:value,measurementIds:{...visit.intake_vitals.measurementIds,[target.kind]:id}};
    snapshot[target.kind==='weight'?'weightAnalysis':'tempAnalysis']=target.kind==='weight'?assessWeight(value,patient.species,patient.breed):assessTemp(value,patient.species);
    await client.query('UPDATE appointments SET intake_vitals=$2 WHERE id=$1',[visit.id,JSON.stringify(snapshot)]);
   }
   if(target.kind==='weight' && target.source!=='admission'){
    const latest=(await client.query("SELECT id FROM vital_measurements m WHERE pet_id=$1 AND kind='weight' AND origin='clinic' AND source<>'admission' AND NOT EXISTS(SELECT 1 FROM vital_measurements c WHERE c.corrects_id=m.id) ORDER BY measurement_date DESC,measured_at DESC NULLS LAST,recorded_at DESC LIMIT 1",[target.pet_id])).rows[0];
    if(latest?.id===id)await client.query("UPDATE pets SET weight=$2,weight_origin='clinic' WHERE id=$1",[target.pet_id,value]);
    await client.query('INSERT INTO pet_weights(pet_id,date,kg,recorded_by,origin,appt_id,measured_at,staff_id,staff_role,vital_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[target.pet_id,target.measurement_date,value,req.user.name,'clinic',target.appt_id,target.measured_at,req.user.id,req.user.role,id]);
   }
   await client.query('INSERT INTO audit_logs(user_name,user_role,action) VALUES($1,$2,$3)',[req.user.name,req.user.role,`Corrected vital measurement ${target.id} with ${id}: ${reason.trim()}`]);
   return row;
  });
  res.json({success:true,measurement:vitalView(saved)});
 }catch(error){errorResponse(res,error);}
});
