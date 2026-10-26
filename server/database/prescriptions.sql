ALTER TABLE consultations
 ADD COLUMN IF NOT EXISTS prescription_items JSONB NOT NULL DEFAULT '[]';
