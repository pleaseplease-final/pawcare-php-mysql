import express from 'express';
import { timingSafeEqual } from 'node:crypto';
import { processReminders } from '../reminders.js';
export const jobsRouter = express.Router();
jobsRouter.get('/vaccination-reminders', async (req, res) => {
  const expected = process.env.CRON_SECRET;
  const supplied = req.get('Authorization') || '';
  if (!expected) return res.status(503).json({ error: 'Reminder scheduler is not configured.' });
  const a = Buffer.from(supplied), b = Buffer.from(`Bearer ${expected}`);
  if (a.length !== b.length || !timingSafeEqual(a,b)) return res.status(401).json({ error: 'Unauthorized' });
  res.set('Cache-Control', 'no-store');
  try { res.json({ success: true, ...await processReminders() }); }
  catch { res.status(500).json({ error: 'Reminder processing failed. Inspect the worker and retry.' }); }
});
