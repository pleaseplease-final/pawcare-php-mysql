-- Add audit metadata without changing patient, appointment or history identities.
ALTER TABLE appointments
 ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
 ADD COLUMN IF NOT EXISTS approved_by TEXT,
 ADD COLUMN IF NOT EXISTS approved_by_user_id TEXT;
ALTER TABLE pet_requests
 ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
 ADD COLUMN IF NOT EXISTS approved_by_user_id TEXT;
CREATE TABLE IF NOT EXISTS pawcare_schema_migrations (
 version TEXT PRIMARY KEY,
 applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO pawcare_schema_migrations(version) VALUES ('appointment-approval-v1') ON CONFLICT DO NOTHING;
