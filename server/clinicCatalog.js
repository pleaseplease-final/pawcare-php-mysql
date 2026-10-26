import { readFileSync } from 'node:fs';
import { query } from './db.js';
import { RX_CATEGORIES } from '../src/catalogRules.js';

// Administrator-managed items sit on top of the built-in list. The rows are cached for a few
// seconds so every price lookup stays synchronous; saving a change refreshes the cache at once.
const TTL_MS = 15000;
let rows = [], loadedAt = 0, ready, inFlight;
export function ensureCatalogSchema() {
  return ready ||= (async () => {
    const exists = (await query("SELECT to_regclass(format('%I.pawcare_schema_migrations', current_schema())) AS migrations")).rows[0]?.migrations;
    if (!exists || !(await query("SELECT version FROM pawcare_schema_migrations WHERE version='clinic-catalog-v1'")).rows.length)
      await query(readFileSync(new URL('./database/clinic-catalog.sql', import.meta.url), 'utf8'));
  })().catch(error => { ready = undefined; throw error; });
}
export async function refreshManagedCatalog({force = false} = {}) {
  if (!force && Date.now() - loadedAt < TTL_MS) return;
  inFlight ||= (async () => {
    await ensureCatalogSchema();
    rows = (await query('SELECT * FROM clinic_catalog_items')).rows;
    loadedAt = Date.now();
  })().finally(() => { inFlight = undefined; });
  return inFlight;
}
export const managedRows = () => rows;
export const resetManagedCatalog = () => { rows = []; loadedAt = 0; };

export function mergeManaged(base, saved = rows) {
  const byId = new Map(saved.map(row => [row.id, row]));
  const merged = base.map(item => {
    const row = byId.get(item.id);
    if (!row) return {...item, active: true, builtIn: true, priorPrices: []};
    return {...item, price: Number(row.price), unit: row.unit || item.unit, desc: row.description || item.desc, active: row.active, builtIn: true,
      priorPrices: (row.previous_prices || []).map(Number), revision: row.revision, updatedAt: row.updated_at, updatedBy: row.updated_by};
  });
  for (const row of saved) if (!base.some(item => item.id === row.id)) merged.push({id: row.id, name: row.name, category: row.category, price: Number(row.price),
    unit: row.unit, desc: row.description, requiresPrescription: RX_CATEGORIES.includes(row.category), active: row.active, builtIn: false,
    priorPrices: (row.previous_prices || []).map(Number), revision: row.revision, updatedAt: row.updated_at, updatedBy: row.updated_by});
  return merged;
}
