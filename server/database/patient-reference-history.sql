-- Additive provenance: never rewrite existing patients, appointments or doses.
ALTER TABLE pets ADD COLUMN IF NOT EXISTS prior_vaccines JSONB NOT NULL DEFAULT '[]',
 ADD COLUMN IF NOT EXISTS external_clinic_notes TEXT NOT NULL DEFAULT '',
 ADD COLUMN IF NOT EXISTS reference_revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE pet_requests ADD COLUMN IF NOT EXISTS prior_vaccines JSONB NOT NULL DEFAULT '[]',
 ADD COLUMN IF NOT EXISTS external_clinic_notes TEXT NOT NULL DEFAULT '';
-- Preserve retry compatibility with registration submissions saved before these optional fields existed.
UPDATE pet_requests SET submission_payload=jsonb_build_object('priorVaccines','[]'::jsonb,'externalClinicNotes','') || submission_payload WHERE submission_payload IS NOT NULL AND NOT submission_payload ? 'priorVaccines';
CREATE TABLE IF NOT EXISTS pet_reference_updates (
 id BIGSERIAL PRIMARY KEY, pet_id VARCHAR(50) NOT NULL REFERENCES pets(id),
 prior_vaccines JSONB NOT NULL, notes TEXT NOT NULL, actor_id VARCHAR(50) NOT NULL,
 actor_name TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS backdate_reason TEXT NOT NULL DEFAULT '';
INSERT INTO pawcare_schema_migrations(version) VALUES ('patient-reference-history-v1') ON CONFLICT DO NOTHING;
