import { query, withTransaction } from './db.js';
import { ensureSchedulingSchema } from './database/schedulingSchema.js';
import { deliverReminder, UncertainDelivery } from './reminderDelivery.js';
import { clinicClock, shiftDate } from './scheduling.js';

export async function reconcileReminders(now = new Date()) {
  await ensureSchedulingSchema();
  const today = clinicClock(now).date;
  await withTransaction(async client => {
    await client.query('SELECT pg_advisory_xact_lock(726341902)');
    // A crashed sender must be inspected rather than resent blindly.
    await client.query(`UPDATE vaccination_reminders SET status='uncertain',last_error='Sender stopped before acceptance was recorded; verify with provider before contacting again.' WHERE status='sending' AND claimed_at < $1::timestamptz - INTERVAL '10 minutes'`, [now]);
    await client.query(`UPDATE vaccination_reminders r SET status='cancelled', last_error='Schedule superseded or reminder window ended'
      WHERE r.status IN ('pending','failed') AND (
        NOT EXISTS (SELECT 1 FROM current_vaccination_due v WHERE v.id=r.vaccination_id AND v.next_due=r.due_date)
        OR r.due_date <= $1::date
        OR (r.milestone=30 AND r.due_date - 14 <= $1::date)
        OR (r.milestone=14 AND r.due_date - 3 <= $1::date))`, [today]);
    await client.query(`INSERT INTO vaccination_reminders (vaccination_id,due_date,milestone,channel,scheduled_at,next_attempt_at)
      SELECT v.id,v.next_due,m.days,c.channel,
        ((v.next_due - m.days) + TIME '09:00') AT TIME ZONE 'Asia/Manila',
        ((v.next_due - m.days) + TIME '09:00') AT TIME ZONE 'Asia/Manila'
      FROM current_vaccination_due v CROSS JOIN (VALUES(30),(14),(3)) m(days)
      CROSS JOIN (VALUES('email'),('sms')) c(channel)
      WHERE v.next_due > $1::date
        AND v.next_due - m.days >= (v.created_at AT TIME ZONE 'Asia/Manila')::date
        AND (m.days<>30 OR v.next_due-14 > $1::date)
        AND (m.days<>14 OR v.next_due-3 > $1::date)
      ON CONFLICT (vaccination_id,due_date,milestone,channel) DO NOTHING`, [today]);
  });
}

export async function processReminders({ now = new Date(), limit = 500, deliver = deliverReminder } = {}) {
  await reconcileReminders(now);
  await query("INSERT INTO reminder_worker_health (id,last_started_at) VALUES (1,$1) ON CONFLICT (id) DO UPDATE SET last_started_at=$1", [now]);
  const stats = { accepted: 0, retrying: 0, failed: 0, uncertain: 0 };
  const deadline = Date.now() + 240000;
  for (let i = 0; i < Math.min(limit, 500) && Date.now() < deadline; i++) {
    // Claim is durable before contacting a provider. Concurrent workers skip it.
    const job = await withTransaction(async client => {
      const row = (await client.query(`SELECT r.*,p.name AS pet_name,o.email,o.phone,v.vaccine
        FROM vaccination_reminders r JOIN current_vaccination_due v ON v.id=r.vaccination_id AND v.next_due=r.due_date
        JOIN pets p ON p.id=v.pet_id JOIN owners o ON o.id=p.owner_id
        WHERE r.status='pending' AND r.next_attempt_at <= $1 AND r.scheduled_at <= $1
          AND r.due_date > ($1::timestamptz AT TIME ZONE 'Asia/Manila')::date
          AND (r.milestone<>30 OR r.due_date-14 > ($1::timestamptz AT TIME ZONE 'Asia/Manila')::date)
          AND (r.milestone<>14 OR r.due_date-3 > ($1::timestamptz AT TIME ZONE 'Asia/Manila')::date)
        ORDER BY r.next_attempt_at,r.id FOR UPDATE OF r SKIP LOCKED LIMIT 1`, [now])).rows[0];
      if (!row) return null;
      await client.query("UPDATE vaccination_reminders SET status='sending',attempts=attempts+1,claimed_at=$2 WHERE id=$1", [row.id, now]);
      return { ...row, attempts: row.attempts + 1 };
    });
    if (!job) break;
    const recipient = job.channel === 'email' ? job.email : job.phone;
    const message = `PawCare reminder: ${job.pet_name}'s ${job.vaccine} booster is due on ${job.due_date}. Please book a clinic visit through your pet portal or contact reception. Your veterinarian will confirm the care needed.`;
    try {
      if (!recipient) throw new Error('Owner contact is missing');
      const result = await deliver(job.channel, recipient, message);
      if (!result?.provider || result.provider === 'dev_outbox') throw new Error('No delivery provider accepted this reminder');
      // Failure to persist acceptance is ambiguous, never automatically resend.
      try {
        const saved = await query("UPDATE vaccination_reminders SET status='accepted',accepted_at=$2,provider=$3,provider_id=$4,last_error=NULL WHERE id=$1 AND status='sending'", [job.id, now, result.provider, result.id || null]);
        if (saved.rowCount !== 1) throw new Error("Reminder claim changed");
      } catch { throw new UncertainDelivery('Acceptance could not be recorded; verify with provider'); }
      stats.accepted++;
    } catch (error) {
      const uncertain = error instanceof UncertainDelivery;
      const terminal = job.attempts >= 5;
      const status = uncertain ? 'uncertain' : terminal ? 'failed' : 'pending';
      // Store controlled adapter messages only; no raw recipient/provider response.
      const safeError = uncertain ? 'Submission could not be confirmed. Check the provider before sending again.' : 'Provider rejected delivery or contact/configuration is missing.';
      const next = new Date(now.getTime() + Math.min(1440, 15 * 2 ** (job.attempts - 1)) * 60000);
      await query('UPDATE vaccination_reminders SET status=$2,next_attempt_at=$3,last_error=$4 WHERE id=$1 AND status=\'sending\'', [job.id,status,next,safeError]);
      stats[uncertain ? 'uncertain' : terminal ? 'failed' : 'retrying']++;
    }
  }
  await query("UPDATE reminder_worker_health SET last_completed_at=$1 WHERE id=1", [now]);
  return stats;
}

export const validateBoosterDate = (date, nextDue) => {
  if (!nextDue) return;
  // Dates are verified independently of any automatically suggested protocol.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDue) || isNaN(Date.parse(nextDue)) || shiftDate(nextDue,0) !== nextDue || nextDue <= date) throw Object.assign(new Error('The next booster date must be a valid date after administration.'), { status: 400 });
};
