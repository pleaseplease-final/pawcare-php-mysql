-- Extend existing stays without rewriting historical discharges.
ALTER TABLE admissions ADD COLUMN IF NOT EXISTS discharge_approved_at TIMESTAMPTZ;
ALTER TABLE admissions DROP CONSTRAINT IF EXISTS admissions_status_check;
ALTER TABLE admissions ADD CONSTRAINT admissions_status_check CHECK (status IN ('Admitted','Ready for discharge','Discharged'));
ALTER TABLE admissions DROP CONSTRAINT IF EXISTS admissions_check;
ALTER TABLE admissions ADD CONSTRAINT admissions_check CHECK (
 (status='Admitted' AND discharged_at IS NULL) OR
 (status='Ready for discharge' AND discharged_at IS NULL AND discharge_approved_at IS NOT NULL) OR
 (status='Discharged' AND discharged_at IS NOT NULL));
DROP INDEX IF EXISTS one_active_admission_per_pet;
CREATE UNIQUE INDEX one_active_admission_per_pet ON admissions(pet_id) WHERE status<>'Discharged';
ALTER TABLE admission_updates ADD COLUMN IF NOT EXISTS medication JSONB NOT NULL DEFAULT '{}';
ALTER TABLE admission_updates DROP CONSTRAINT IF EXISTS admission_updates_kind_check;
ALTER TABLE admission_updates ADD CONSTRAINT admission_updates_kind_check CHECK (kind IN
 ('Admission','Observation','Veterinarian update','Discharge','Release','Medication order','Medication stopped','Medicine administration','Medication correction'));
CREATE TABLE IF NOT EXISTS admission_medication_orders (
 id UUID PRIMARY KEY REFERENCES admission_updates(id),
 admission_id UUID NOT NULL REFERENCES admissions(id),
 medicine TEXT NOT NULL,
 dose TEXT NOT NULL,
 route TEXT NOT NULL,
 frequency TEXT NOT NULL,
 instructions TEXT NOT NULL DEFAULT '',
 catalog_id TEXT,
 supply_limit INTEGER NOT NULL DEFAULT 0 CHECK (supply_limit BETWEEN 0 AND 1000),
 ordered_by TEXT NOT NULL,
 ordered_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 stopped_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS admission_medication_order_stay ON admission_medication_orders(admission_id,ordered_at);
CREATE TABLE IF NOT EXISTS pawcare_schema_migrations (version TEXT PRIMARY KEY,applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
INSERT INTO pawcare_schema_migrations(version) VALUES ('admission-workflow-v1') ON CONFLICT DO NOTHING;
