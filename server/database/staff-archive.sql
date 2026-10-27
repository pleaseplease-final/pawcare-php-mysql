-- Archived staff accounts stay in the database (their visits, notes and audit history keep pointing at them)
-- but leave the everyday staff list. Only a deactivated account can be archived, so archived means signed out for good.
ALTER TABLE users ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
CREATE TABLE IF NOT EXISTS pawcare_schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
INSERT INTO pawcare_schema_migrations(version) VALUES ('staff-archive-v1') ON CONFLICT DO NOTHING;
