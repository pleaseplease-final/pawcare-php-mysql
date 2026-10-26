-- Administrator governance controls; patient and financial history is retained.
ALTER TABLE users
 ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
 ADD COLUMN IF NOT EXISTS access_revision INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS access_reason TEXT NOT NULL DEFAULT '';
CREATE TABLE IF NOT EXISTS pawcare_schema_migrations (
 version TEXT PRIMARY KEY,
 applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO pawcare_schema_migrations(version) VALUES ('staff-access-v1') ON CONFLICT DO NOTHING;
