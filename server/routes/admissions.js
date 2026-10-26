import {ensureVitalsSchema} from '../vitals.js';
import express from 'express';
import { admissionCharges, saveMedicineAction } from '../admissionMedication.js';
import { ensureCheckoutInboxSchema, createCheckoutTask } from '../checkout.js';
import { query, withTransaction } from '../db.js';
import { assignedTo } from '../clinicAccess.js';
import { lockSchedule } from '../scheduling.js';
import { sameIntakeVisit, intakeVisitSnapshot } from '../../src/intakeVisit.js';
import { ensureAdmissionsSchema, admissionError, admissionInput, admissionView, admissionUpdateView, isUuid } from '../admissions.js';

export const admissionsRouter = express.Router();
admissionsRouter.use(async (req,res,next) => {
  res.set('Cache-Control','private, no-store');
  try { await ensureAdmissionsSchema(); await ensureVitalsSchema(); next(); }
  catch { res.status(500).json({error:'Unable to load admissions. Please retry.'}); }
});
const base = `SELECT d.*,p.name pet_name,p.owner_id,o.name owner_name,o.phone owner_phone,a.vet_id,a.status visit_status,a.billing_status,
  COALESCE((SELECT CONCAT('Dr. ',u.first_name,' ',u.last_name) FROM users u WHERE u.id=a.vet_id OR u.vet_id=a.vet_id LIMIT 1),'Veterinarian') vet_name,
  latest.owner_update latest_update,latest.created_at latest_update_at
  FROM admissions d JOIN pets p ON p.id=d.pet_id JOIN owners o ON o.id=p.owner_id JOIN appointments a ON a.id=d.appt_id
  LEFT JOIN LATERAL (SELECT owner_update,created_at FROM admission_updates WHERE admission_id=d.id AND owner_update<>'' ORDER BY created_at DESC,id DESC LIMIT 1) latest ON TRUE`;
function scope(user, params) {
  if (user.role === 'owner') { params.push(user.ownerId); return `p.owner_id=$${params.length}`; }
  if (user.role === 'vet') { params.push([user.vetId,user.id].filter(Boolean)); return `a.vet_id=ANY($${params.length}::varchar[])`; }
  return 'TRUE';
}
async function readAdmission(execute, id, user) {
  const params = [id];
  const row = (await execute(`${base} WHERE d.id=$1 AND ${scope(user,params)}`,params)).rows[0];
  if (!row) throw admissionError('Admission not found or no longer assigned to you.',404);
  return row;
}
function errorResponse(res,error) {
  res.status(error.status || (error.code === '23505' ? 409 : 500)).json({error:error.status ? error.message : error.code === '23505' ? 'This pet or visit already has an admission. Refresh admissions before retrying.' : 'Unable to save or load the admission. Keep your entries and retry.'});
}
admissionsRouter.get('/', async (req,res) => {
  try {
    const status = req.query.status || 'Active';
    const offset = Number(req.query.offset || 0);
    if (!['Active','Admitted','Ready for discharge','Discharged'].includes(status) || !Number.isSafeInteger(offset) || offset < 0 || offset > 1000000) throw admissionError('Choose a valid admission status and page.');
    const params = [status];
    const filter = `($1='Active' AND d.status<>'Discharged' OR d.status=$1) AND ${scope(req.user,params)}`;
    const count = (await query(`SELECT count(*)::int total FROM admissions d JOIN pets p ON p.id=d.pet_id JOIN appointments a ON a.id=d.appt_id WHERE ${filter}`,params)).rows[0].total;
    params.push(offset);
    const {rows} = await query(`${base} WHERE ${filter} ORDER BY d.admitted_at DESC,d.id DESC LIMIT 50 OFFSET $${params.length}`,params);
    res.json({admissions:rows.map(row => admissionView(row,req.user.role === 'owner')),total:count,offset,status,limit:50,checkedAt:new Date().toISOString()});
  } catch (error) { errorResponse(res,error); }
});
admissionsRouter.get('/eligible', async (req,res) => {
  try {
    const {rows} = await query(`SELECT a.*,p.name pet_name,o.name owner_name FROM appointments a JOIN pets p ON p.id=a.pet_id JOIN owners o ON o.id=p.owner_id
      WHERE a.vet_id=ANY($1::varchar[]) AND (a.status='In consultation' OR (a.status='Completed' AND EXISTS (SELECT 1 FROM consultations c WHERE c.appt_id=a.id)))
      AND COALESCE(a.billing_status,'')<>'Paid' AND NOT EXISTS (SELECT 1 FROM admissions d WHERE d.appt_id=a.id OR (d.pet_id=a.pet_id AND d.status<>'Discharged')) ORDER BY a.date DESC,a.time DESC`,[[req.user.vetId,req.user.id].filter(Boolean)]);
    res.json({visits:rows.map(row => ({...intakeVisitSnapshot(row),petName:row.pet_name,ownerName:row.owner_name}))});
  } catch (error) { errorResponse(res,error); }
});
// Owner-safe saved document: no internal care notes, inpatient orders or audit payloads.
admissionsRouter.get('/:id/discharge-summary', async (req,res) => {
  try {
    if (!isUuid(req.params.id)) throw admissionError('Admission not found.',404);
    const params = [req.params.id];
    const row = (await query(`${base.replace("SELECT d.*,", "SELECT document.appointment,document.consultation,d.*,")}, LATERAL (SELECT to_jsonb(a2) appointment,
      (SELECT to_jsonb(c) FROM consultations c WHERE c.appt_id=a2.id ORDER BY c.date DESC,c.created_at DESC,c.id DESC LIMIT 1) consultation
      FROM appointments a2 WHERE a2.id=d.appt_id) document WHERE d.id=$1 AND ${scope(req.user,params)}`,params)).rows[0];
    if (!row) throw admissionError('Admission not found or no longer assigned to you.',404);
    if (row.status === 'Admitted') throw admissionError('The veterinarian must approve discharge before a discharge summary is available.',409);
    const a = row.appointment, c = row.consultation || {}, payment = a.payment_details || {};
    res.json({admission:admissionView(row,true),ownerName:row.owner_name,
      consultation:{diagnosis:c.diagnosis || '',treatment:c.treatment || '',prescription:c.prescription || '',prescriptionItems:(c.prescription_items || []).map(item=>({name:item.name,quantity:item.quantity,unit:item.unit,instructions:item.instructions}))},
      appointment:{id:a.id,status:a.status,billingStatus:a.billing_status,admissionStatus:row.status,amount:a.amount === null ? null : Number(a.amount),
        invoiceItems:a.invoice_items || [],discount:payment.discount ?? 0,paymentMethod:a.payment_method,paidAt:a.paid_at,
        paymentReference:payment.reference || '',cashTendered:payment.cashTendered ?? null,changeAmount:payment.changeAmount ?? null},
      generatedAt:new Date().toISOString()});
  } catch (error) { errorResponse(res,error); }
});
admissionsRouter.get('/:id', async (req,res) => {
  try {
    if (!isUuid(req.params.id)) throw admissionError('Admission not found.',404);
    const row = await readAdmission(query,req.params.id,req.user);
    const owner = req.user.role === 'owner', params = [row.id];
    let filter = `admission_id=$1${owner ? " AND owner_update<>''" : ''}`;
    if (req.query.before) {
      let cursor;
      try { cursor = JSON.parse(Buffer.from(req.query.before,'base64url').toString()); } catch { throw admissionError('Invalid update page.'); }
      if (!cursor || !isUuid(cursor.id) || typeof cursor.at !== 'string' || !Number.isFinite(Date.parse(cursor.at))) throw admissionError('Invalid update page.');
      params.push(cursor.at,cursor.id); filter += ' AND (created_at,id)<($2::timestamptz,$3::uuid)';
    }
    const rows = (await query(`SELECT id,kind,created_at,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') cursor_at,actor_name,actor_role,owner_update${owner ? '' : ",clinical_note,care_plan,measurements,medication,care_details,EXISTS (SELECT 1 FROM admission_updates correction WHERE correction.admission_id=admission_updates.admission_id AND correction.kind='Medication correction' AND correction.medication->>'voids'=admission_updates.id::text) AS voided"} FROM admission_updates WHERE ${filter} ORDER BY created_at DESC,id DESC LIMIT 51`,params)).rows;
    const more = rows.length > 50; rows.length = Math.min(rows.length,50);
    const last = rows.at(-1);
    const orders = owner ? [] : (await query('SELECT id,medicine,dose,route,frequency,instructions,catalog_id,supply_limit,ordered_by,ordered_at,stopped_at FROM admission_medication_orders WHERE admission_id=$1 ORDER BY ordered_at,id',[row.id])).rows;
    res.json({...(owner ? {} : {medicationOrders:orders}),admission:admissionView(row,owner),updates:rows.map(update => admissionUpdateView(update,owner)),nextCursor:more ? Buffer.from(JSON.stringify({at:last.cursor_at,id:last.id})).toString('base64url') : null,checkedAt:new Date().toISOString()});
  } catch (error) { errorResponse(res,error); }
});
const audit = (client,user,action) => client.query('INSERT INTO audit_logs (user_name,user_role,action) VALUES ($1,$2,$3)',[user.name,user.role,action]);
async function addUpdate(client,req,id,kind,data,payload=data) {
  const ownerMessage = kind === 'Discharge' ? [data.ownerUpdate,data.dischargeInstructions].filter(Boolean).join('\n\n') : data.ownerUpdate;
  await client.query(`INSERT INTO admission_updates (id,admission_id,kind,clinical_note,care_plan,measurements,owner_update,actor_id,actor_name,actor_role,request_payload,medication,care_details)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,[req.body.requestId,id,kind,data.clinicalNote,data.carePlan || '',JSON.stringify(data.measurements),ownerMessage,req.user.id,req.user.name,req.user.role,JSON.stringify(payload),JSON.stringify(data.medication || {}),JSON.stringify(data.careDetails || {})]);
}
async function saveCareDetails(client,req,id,data,row) {
  const details = {};
  for (const key of ['reasonChoice','planTemplate','observationTemplate','planConfirmed']) if (data[key] !== undefined) details[key] = data[key];
  const now = (await client.query('SELECT clock_timestamp() now')).rows[0].now;
  if (data.nextObservationAt) {
    if (Date.parse(data.nextObservationAt) <= now.getTime()) throw admissionError('Set a future time for the next observation.');
    details.nextObservationAt = data.nextObservationAt;
    details.observationInstructions = data.observationInstructions;
    if (row) await client.query('UPDATE admissions SET next_observation_at=$2,observation_instructions=$3,observation_completed_at=NULL WHERE id=$1',[id,data.nextObservationAt,data.observationInstructions]);
  }
  if (data.consent) {
    details.consent = {...data.consent,recordedAt:now.toISOString(),recordedBy:req.user.name,staffId:req.user.id,staffRole:req.user.role};
    if (row) await client.query('UPDATE admissions SET consent=$2 WHERE id=$1',[id,JSON.stringify(details.consent)]);
  }
  if (data.completeObservation) {
    if (!row.next_observation_at || row.observation_completed_at) throw admissionError('There is no pending observation. Refresh the care plan.',409);
    details.completedObservation = {dueAt:row.next_observation_at,instructions:row.observation_instructions,completedAt:now.toISOString()};
    await client.query('UPDATE admissions SET observation_completed_at=$2 WHERE id=$1',[id,now]);
  }
  return details;
}
async function replay(client,req,id,data) {
  const row = (await client.query('SELECT admission_id,actor_id,request_payload=$2::jsonb AS same FROM admission_updates WHERE id=$1',[req.body.requestId,JSON.stringify(data)])).rows[0];
  if (!row) return false;
  if (row.admission_id !== id || row.actor_id !== req.user.id || !row.same) throw admissionError('This save identifier was already used for different entries. Reopen the form.',409);
  return true;
}
admissionsRouter.post('/', async (req,res) => {
  try {
    const data = admissionInput(req.body,'create',req.user.role), id = req.body.requestId;
    await ensureCheckoutInboxSchema();
    const saved = await withTransaction(async client => {
      await lockSchedule(client);
      // Match consultation/handoff locking: appointment first, then admission.
      const visit = (await client.query('SELECT * FROM appointments WHERE id=$1 FOR UPDATE',[data.apptId])).rows[0];
      if (!visit || !assignedTo(visit,req.user)) throw admissionError('An assigned consultation is required.',403);
      const active = (await client.query("SELECT id FROM users WHERE id=$1 AND role='vet' AND COALESCE(to_jsonb(users)->>'is_active','true')<>'false'",[req.user.id])).rows[0];
      if (!active) throw admissionError('Your account is inactive. Contact the clinic administrator.',403);
      if (await replay(client,req,id,data)) return readAdmission(client.query.bind(client),id,req.user);
      if (visit.billing_status === 'Paid') throw admissionError('A paid visit cannot start a new admission. Reception must create a new visit.',409);
      const checkout = (await client.query("SELECT appointment_id FROM checkout_tasks WHERE appointment_id=$1 AND status='claimed' AND lease_until>NOW()",[visit.id])).rows[0];
      if (checkout) throw admissionError('Reception is already checking out this visit. Close its checkout before admitting the pet.',409);
      if (!['In consultation','Completed'].includes(visit.status)) throw admissionError('Start the consultation before admitting this pet.',409);
      if (!req.body.expectedVisit || !sameIntakeVisit(visit,req.body.expectedVisit)) throw admissionError('This visit changed. Refresh clinic records and reopen admission.',409);
      if (visit.status === 'Completed' && !(await client.query('SELECT id FROM consultations WHERE appt_id=$1',[visit.id])).rows.length) throw admissionError('A completed visit needs saved SOAP notes before admission.',409);
      await client.query('SELECT id FROM pets WHERE id=$1 FOR UPDATE',[visit.pet_id]);
      const careDetails = await saveCareDetails(client,req,id,data);
      await client.query('INSERT INTO admissions (id,pet_id,appt_id,reason,care_plan,next_observation_at,observation_instructions,consent) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',[id,visit.pet_id,visit.id,data.clinicalNote,data.carePlan,data.nextObservationAt,data.observationInstructions,JSON.stringify(careDetails.consent || null)]);
      await addUpdate(client,req,id,'Admission',{...data,careDetails},data);
      await audit(client,req.user,`Admitted pet ${visit.pet_id} for visit ${visit.id} (${id})`);
      return readAdmission(client.query.bind(client),id,req.user);
    });
    res.json({success:true,admission:admissionView(saved)});
  } catch (error) { errorResponse(res,error); }
});
admissionsRouter.post('/:id/:action', async (req,res) => {
  try {
    const {action} = req.params;
    const id = req.params.id.toLowerCase();
    if (!isUuid(id)) throw admissionError('Admission not found.',404);
    if (!['update','consent','discharge','release','order','stop-medication','medication','correct-medication'].includes(action)) throw admissionError('Admission action not found.',404);
    const data = admissionInput(req.body,action,req.user.role);
    if (action === 'discharge') await ensureCheckoutInboxSchema();
    const saved = await withTransaction(async client => {
      const source = (await client.query('SELECT appt_id FROM admissions WHERE id=$1',[id])).rows[0];
      if (!source) throw admissionError('Admission not found.',404);
      const visit = (await client.query('SELECT * FROM appointments WHERE id=$1 FOR UPDATE',[source.appt_id])).rows[0];
      if (req.user.role === 'vet' && !assignedTo(visit,req.user)) throw admissionError('This admission is no longer assigned to you.',403);
      const row = (await client.query('SELECT * FROM admissions WHERE id=$1 FOR UPDATE',[id])).rows[0];
      if (await replay(client,req,id,data)) return readAdmission(client.query.bind(client),id,req.user);
      if (row.revision !== req.body.revision) throw admissionError('Another staff member updated this admission. Close this form, refresh and review the latest notes before saving.',409);
      if (action === 'release') {
        if (row.status !== 'Ready for discharge' || visit.billing_status !== 'Paid') throw admissionError('Release requires veterinarian discharge approval and a saved final payment.',409);
        await client.query("UPDATE admissions SET status='Discharged',discharged_at=clock_timestamp(),revision=revision+1 WHERE id=$1",[id]);
        await addUpdate(client,req,id,'Release',data);
      } else {
        if (row.status !== 'Admitted' && !(action==='consent' && row.status==='Ready for discharge')) throw admissionError('Care recording is closed after discharge approval. Refresh admission records.',409);
        if (action === 'discharge') {
          if (visit.status !== 'Completed' || !(await client.query('SELECT id FROM consultations WHERE appt_id=$1',[visit.id])).rows.length) throw admissionError('Finalize the consultation SOAP notes before approving discharge.',409);
          await client.query("UPDATE admissions SET status='Ready for discharge',discharge_approved_at=clock_timestamp(),discharge_instructions=$2,revision=revision+1 WHERE id=$1",[id,data.dischargeInstructions]);
          await createCheckoutTask(client,visit.id);
          await addUpdate(client,req,id,'Discharge',data);
        } else if (action === 'update' || action==='consent') {
          await client.query("UPDATE admissions SET care_plan=COALESCE(NULLIF($2,''),care_plan),revision=revision+1 WHERE id=$1",[id,data.carePlan || '']);
          const careDetails = await saveCareDetails(client,req,id,data,row);
          await addUpdate(client,req,id,req.user.role === 'vet' ? 'Veterinarian update' : 'Observation',{...data,careDetails},data);
        } else {
          const event = await saveMedicineAction(client,req,row,data);
          await addUpdate(client,req,id,event.kind,{...data,...event},data);
          if (action === 'order') await client.query(`INSERT INTO admission_medication_orders(id,admission_id,medicine,dose,route,frequency,instructions,catalog_id,supply_limit,ordered_by)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[req.body.requestId,id,data.medicine,data.dose,data.route,data.frequency,data.instructions,data.catalogId,data.supplyLimit,req.user.name]);
          const charges = await admissionCharges(client,visit.id);
          if (charges.some(line => line.qty>1000) || charges.length>30) throw admissionError('Admission medicine supplies exceed the invoice limit. Review the recorded quantities.');
          await client.query('UPDATE admissions SET revision=revision+1 WHERE id=$1',[id]);
        }
      }
      await audit(client,req.user,`${action === 'discharge' ? 'Approved discharge for' : action === 'release' ? 'Released' : 'Updated'} admission ${id} (${action})`);
      return readAdmission(client.query.bind(client),id,req.user);
    });
    res.json({success:true,admission:admissionView(saved)});
  } catch (error) { errorResponse(res,error); }
});
