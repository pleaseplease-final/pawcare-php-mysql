import { readFileSync } from 'node:fs';
import { query } from './db.js';
let ready;
export function ensureStaffAccessSchema() {
  return ready ||= (async () => {
    const exists = (await query("SELECT to_regclass(format('%I.pawcare_schema_migrations', current_schema())) AS migrations")).rows[0]?.migrations;
    const applied = async version => exists && (await query('SELECT version FROM pawcare_schema_migrations WHERE version=$1', [version])).rows.length;
    if (!await applied('staff-access-v1')) await query(readFileSync(new URL('./database/staff-access.sql',import.meta.url),'utf8'));
    if (!await applied('staff-admin-role-v1')) await query(readFileSync(new URL('./database/staff-admin-role.sql',import.meta.url),'utf8'));
  })().catch(error => { ready=undefined; throw error; });
}
