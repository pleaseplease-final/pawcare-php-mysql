import 'dotenv/config';
import { processReminders } from '../reminders.js';
import { pool } from '../db.js';
const once = process.argv.includes('--once');
let stopping = false;
for (const signal of ['SIGTERM','SIGINT']) process.on(signal, () => { stopping = true; });
do {
  try { console.log('Vaccination reminders:', await processReminders()); }
  catch (error) { console.error('Reminder worker failed:', error.message); if (once) process.exitCode = 1; }
  if (once || stopping) break;
  // Short interruptible delay; no browser session required.
  for (let i=0; i<300 && !stopping; i++) await new Promise(resolve => setTimeout(resolve,1000));
} while (!stopping);
await pool.end();
