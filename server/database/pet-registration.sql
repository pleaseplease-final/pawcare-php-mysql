-- Preserve owner-submitted details and detect edits during clinic review.
ALTER TABLE pet_requests
 ADD COLUMN IF NOT EXISTS photo TEXT NOT NULL DEFAULT '',
 ADD COLUMN IF NOT EXISTS dental_occlusion TEXT NOT NULL DEFAULT '',
 ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE pets ADD COLUMN IF NOT EXISTS dental_occlusion TEXT NOT NULL DEFAULT '';
CREATE TABLE IF NOT EXISTS pawcare_schema_migrations (
 version TEXT PRIMARY KEY,
 applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO pawcare_schema_migrations(version) VALUES ('pet-registration-v1') ON CONFLICT DO NOTHING;
