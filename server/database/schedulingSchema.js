import { readFileSync } from 'node:fs';
import { query } from '../db.js';
let ready;
async function prepare() {
  const relation = (await query("SELECT to_regclass(format('%I.pawcare_schema_migrations', current_schema())) AS migrations")).rows[0]?.migrations;
  if (relation && (await query("SELECT version FROM pawcare_schema_migrations WHERE version='booking-reminders-v1'")).rows.length) return;
  await query(readFileSync(new URL('./scheduling.sql', import.meta.url), 'utf8'));
}
export function ensureSchedulingSchema() {
  return ready ||= prepare().catch(error => { ready = undefined; throw error; });
}
