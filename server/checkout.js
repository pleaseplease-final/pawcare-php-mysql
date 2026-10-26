import { readFileSync } from 'node:fs';
import { query } from './db.js';
import { assertAdmissionCheckout } from './admissionMedication.js';
import { sha256 } from './security.js';
let ready;
export function ensureCheckoutInboxSchema() {
  return ready ||= (async () => {
    const exists = (await query("SELECT to_regclass(format('%I.pawcare_schema_migrations', current_schema())) AS migrations")).rows[0]?.migrations;
    if (exists && (await query("SELECT version FROM pawcare_schema_migrations WHERE version='checkout-inbox-v1'")).rows.length) return;
    await query(readFileSync(new URL('./database/checkout-inbox.sql', import.meta.url), 'utf8'));
  })().catch(error => { ready = undefined; throw error; });
}
export const checkoutError = (message, status = 409) => Object.assign(new Error(message), { status });

export async function createCheckoutTask(client, appointmentId) {
  await client.query('INSERT INTO checkout_tasks (appointment_id) VALUES ($1) ON CONFLICT DO NOTHING', [appointmentId]);
}

// Always lock appointment before task. This matches consultation/payment lock order.
export async function lockCheckout(client, appointmentId) {
  const appointment = (await client.query('SELECT * FROM appointments WHERE id = $1 FOR UPDATE', [appointmentId])).rows[0];
  if (!appointment) throw checkoutError('Appointment not found.', 404);
  if (appointment.status !== 'Completed' || appointment.billing_status === 'Paid') throw checkoutError('This visit is no longer waiting for checkout. Refresh the inbox.');
  await assertAdmissionCheckout(client, appointmentId);
  const consultation = (await client.query('SELECT id, prescription_items, prescription FROM consultations WHERE appt_id = $1 ORDER BY date DESC, created_at DESC, id DESC LIMIT 1', [appointmentId])).rows[0];
  if (!consultation) throw checkoutError('A finalized consultation is required before checkout.');
  await createCheckoutTask(client, appointmentId);
  const task = (await client.query('SELECT *, lease_until > NOW() AS active FROM checkout_tasks WHERE appointment_id = $1 FOR UPDATE', [appointmentId])).rows[0];
  return { appointment, task, consultation };
}
export function ownsClaim(task, user, token) {
  return task.status === 'claimed' && task.active && task.claimed_by === user.id && typeof token === 'string' && task.claim_hash === sha256(token);
}
export async function authorizeCheckoutPayment(client, appointmentId, user, token) {
  await createCheckoutTask(client, appointmentId);
  const task = (await client.query('SELECT *, lease_until > NOW() AS active FROM checkout_tasks WHERE appointment_id = $1 FOR UPDATE', [appointmentId])).rows[0];
  if (task.status === 'completed' || (task.status === 'claimed' && task.active && !ownsClaim(task, user, token))) throw checkoutError('Another checkout session is handling this visit. Return to the inbox or wait for its claim to expire.');
  // A client that has lost its lease must explicitly reacquire; retain its form.
  if (token && !ownsClaim(task, user, token)) throw checkoutError('Your checkout claim expired. Reclaim this visit before recording payment.');
}
export async function finishCheckoutTask(client, appointmentId, userId) {
  await client.query("UPDATE checkout_tasks SET status='completed',completed_at=NOW(),completed_by=$2,claim_hash=NULL,lease_until=NULL WHERE appointment_id=$1", [appointmentId,userId]);
}
