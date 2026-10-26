import { ensurePrescriptionSchema } from "../prescriptions.js";
import express from 'express';
import { ensureAdmissionsSchema } from '../admissions.js';
import { admissionCharges } from '../admissionMedication.js';
import { query, withTransaction } from '../db.js';
import { sha256 } from '../security.js';
import { ensureCheckoutInboxSchema, lockCheckout, ownsClaim, checkoutError } from '../checkout.js';
export const checkoutRouter = express.Router();
checkoutRouter.use(async (req,res,next) => {
  try { await ensureCheckoutInboxSchema(); await ensurePrescriptionSchema(); await ensureAdmissionsSchema(); next(); }
  catch { res.status(500).json({ error:'Unable to load the checkout inbox. Please retry.' }); }
});
checkoutRouter.get('/', async (req,res) => {
  try {
    // Recover pre-migration completions and missed/browser-closed handoffs.
    await query(`INSERT INTO checkout_tasks (appointment_id,created_at)
      SELECT a.id,COALESCE((SELECT MAX(c.created_at) FROM consultations c WHERE c.appt_id=a.id),NOW())
      FROM appointments a WHERE a.status='Completed' AND COALESCE(a.billing_status,'')<>'Paid'
        AND EXISTS (SELECT 1 FROM consultations c WHERE c.appt_id=a.id)
      ON CONFLICT DO NOTHING`);
    const rows=(await query(`SELECT t.appointment_id,t.created_at,t.lease_until,
      CASE WHEN t.status='claimed' AND t.lease_until>NOW() AND t.claimed_by IS NOT NULL THEN 'claimed' ELSE 'pending' END AS status,
      CASE WHEN t.lease_until>NOW() THEN t.claimed_by END AS claimed_by,
      CASE WHEN t.lease_until>NOW() THEN CONCAT(u.first_name,' ',u.last_name) END AS claimed_name,
      p.name AS pet_name,o.name AS owner_name,a.date,a.time
      FROM checkout_tasks t JOIN appointments a ON a.id=t.appointment_id JOIN pets p ON p.id=a.pet_id
      JOIN owners o ON o.id=p.owner_id LEFT JOIN users u ON u.id=t.claimed_by
      WHERE a.status='Completed' AND COALESCE(a.billing_status,'')<>'Paid' AND t.status<>'completed' AND NOT EXISTS (SELECT 1 FROM admissions d WHERE d.appt_id=a.id AND d.status='Admitted')
      ORDER BY t.created_at,t.appointment_id LIMIT 200`)).rows;
    res.set('Cache-Control','no-store').json({ tasks:rows.map(t=>({ appointmentId:t.appointment_id,createdAt:t.created_at,status:t.status,claimedBy:t.claimed_by,claimedName:t.claimed_name,leaseUntil:t.lease_until,petName:t.pet_name,ownerName:t.owner_name,date:t.date,time:t.time })) });
  } catch { res.status(500).json({ error:'Unable to load the checkout inbox. Please retry.' }); }
});
checkoutRouter.post('/:id/:action', async (req,res) => {
  const {id,action}=req.params;
  if (!['claim','renew','release'].includes(action)) return res.status(404).json({ error:'Checkout action not found.' });
  try {
    const result=await withTransaction(async client=>{
      const {task,appointment,consultation}=await lockCheckout(client,id);
      if (action==='claim') {
        if (task.status==='completed' || task.status==='claimed' && task.active && task.claimed_by) throw checkoutError('This visit is already open in another checkout session.');
        const token=crypto.randomUUID();
        const row=(await client.query("UPDATE checkout_tasks SET status='claimed',claimed_by=$2,claim_hash=$3,lease_until=NOW()+INTERVAL '5 minutes' WHERE appointment_id=$1 RETURNING lease_until",[id,req.user.id,sha256(token)])).rows[0];
        await client.query('INSERT INTO audit_logs (user_name,user_role,action) VALUES ($1,$2,$3)',[req.user.name,req.user.role,`Claimed checkout ${id}`]);
        return {claimToken:token,leaseUntil:row.lease_until,invoiceItems:[...(appointment.invoice_items || []).filter(line => line.source !== 'admission'),...await admissionCharges(client,id)],prescriptionItems:consultation.prescription_items || [],prescription:consultation.prescription || ""};
      }
      if (!ownsClaim(task,req.user,req.body.claimToken)) throw checkoutError('Your checkout claim is no longer active. Reclaim it before continuing.');
      if (action==='renew') {
        const row=(await client.query("UPDATE checkout_tasks SET lease_until=NOW()+INTERVAL '5 minutes' WHERE appointment_id=$1 RETURNING lease_until",[id])).rows[0];
        return {leaseUntil:row.lease_until};
      }
      await client.query("UPDATE checkout_tasks SET status='pending',claimed_by=NULL,claim_hash=NULL,lease_until=NULL WHERE appointment_id=$1",[id]);
      await client.query('INSERT INTO audit_logs (user_name,user_role,action) VALUES ($1,$2,$3)',[req.user.name,req.user.role,`Released checkout ${id}`]);
      return {};
    });
    res.json({success:true,...result});
  } catch(error) { res.status(error.status||500).json({error:error.status?error.message:'Unable to update checkout. Retry without closing your form.'}); }
});
