import { query } from '../db.js';

let ready;
// Existing installations predate the checkout columns in the schema file.
export function ensureCheckoutSchema() {
  if (!ready) ready = query(`ALTER TABLE appointments
    ADD COLUMN IF NOT EXISTS payment_method VARCHAR(30),
    ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS invoice_items JSONB NOT NULL DEFAULT '[]',
    ADD COLUMN IF NOT EXISTS payment_details JSONB NOT NULL DEFAULT '{}'`)
    .catch(error => { ready = undefined; throw error; });
  return ready;
}
