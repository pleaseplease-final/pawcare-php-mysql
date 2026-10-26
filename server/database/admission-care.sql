-- Unknown historical consent and observation times remain NULL.
ALTER TABLE admissions
 ADD COLUMN IF NOT EXISTS next_observation_at TIMESTAMPTZ,
 ADD COLUMN IF NOT EXISTS observation_instructions TEXT NOT NULL DEFAULT '',
 ADD COLUMN IF NOT EXISTS observation_completed_at TIMESTAMPTZ,
 ADD COLUMN IF NOT EXISTS consent JSONB;
ALTER TABLE admission_updates ADD COLUMN IF NOT EXISTS care_details JSONB NOT NULL DEFAULT '{}';
INSERT INTO pawcare_schema_migrations(version) VALUES ('admission-care-v1') ON CONFLICT DO NOTHING;
