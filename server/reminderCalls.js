import {readFileSync} from 'node:fs';
import {query,withTransaction} from './db.js';
import {ensureSchedulingSchema} from './database/schedulingSchema.js';
import {validateReminderCall} from '../src/reminderCall.js';
let ready;
const ensureSchema=()=> ready ||= query(readFileSync(new URL('./database/reminder-calls.sql',import.meta.url),'utf8')).catch(error=>{ready=undefined;throw error});
const serialize=row=>({id:row.id,vaccinationId:row.vaccination_id,petId:row.pet_id,ownerId:row.owner_id,vaccine:row.vaccine,dueDate:row.due_date,phone:row.phone,outcome:row.outcome,notes:row.notes,staffName:row.staff_name,createdAt:row.created_at});
const conflict=message=>Object.assign(new Error(message),{status:409});
export async function logReminderCall(req,res) {
  try {
    const b=validateReminderCall(req.body);
    await ensureSchedulingSchema();await ensureSchema();
    const row=await withTransaction(async client=>{
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[b.requestId]);
      const prior=(await client.query('SELECT * FROM reminder_call_logs WHERE id=$1',[b.requestId])).rows[0];
      if (prior) {
        if (prior.staff_id !== req.user.id || prior.vaccination_id !== b.vaccinationId || prior.pet_id !== b.petId || prior.owner_id !== b.ownerId || prior.due_date !== b.dueDate || prior.outcome !== b.outcome || prior.notes !== b.notes || prior.phone !== b.expectedPhone) throw conflict('This call request was already saved. Reload call history before recording another call.');
        return prior;
      }
      const current=(await client.query(`SELECT v.id,v.pet_id,v.vaccine,v.next_due,p.owner_id,o.phone FROM current_vaccination_due v
        JOIN pets p ON p.id=v.pet_id JOIN owners o ON o.id=p.owner_id WHERE v.id=$1 AND p.id=$2 FOR SHARE OF p,o`,[b.vaccinationId,b.petId])).rows[0];
      if (!current || current.owner_id !== b.ownerId || current.next_due !== b.dueDate || (current.phone || '').trim() !== b.expectedPhone) throw conflict('The recall or owner contact has changed. Refresh clinic records and reopen the call form.');
      const saved=(await client.query(`INSERT INTO reminder_call_logs(id,vaccination_id,pet_id,owner_id,vaccine,due_date,phone,outcome,notes,staff_id,staff_name)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,[b.requestId,b.vaccinationId,b.petId,b.ownerId,current.vaccine,b.dueDate,b.expectedPhone,b.outcome,b.notes,req.user.id,req.user.name])).rows[0];
      await client.query('INSERT INTO audit_logs(user_name,user_role,action) VALUES($1,$2,$3)',[req.user.name,req.user.role,`Recorded reminder call ${saved.id} for ${b.petId}: ${b.outcome}`]);
      return saved;
    });
    res.json({success:true,call:serialize(row)});
  } catch(error) { res.status(error.status || 500).json({error:error.status?error.message:'Unable to save the call record. Your notes are retained; retry to check this request.'}); }
}
export async function reminderCallHistory(req,res) {
  if (typeof req.query.petId !== 'string' || !req.query.petId || req.query.petId.length>50) return res.status(400).json({error:'Choose a saved patient.'});
  try {
    await ensureSchema();
    const rows=(await query('SELECT * FROM reminder_call_logs WHERE pet_id=$1 ORDER BY created_at DESC,id DESC LIMIT 20',[req.query.petId])).rows;
    res.json({success:true,calls:rows.map(serialize)});
  } catch { res.status(500).json({error:'Unable to load saved call history.'}); }
}
