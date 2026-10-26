-- Add document publication without replacing any patient, visit or medical record IDs.
CREATE TABLE IF NOT EXISTS clinic_document_profile (
 id BOOLEAN PRIMARY KEY DEFAULT true CHECK(id),
 details JSONB NOT NULL DEFAULT '{}',
 revision INTEGER NOT NULL DEFAULT 0,
 verified_at TIMESTAMPTZ,
 verified_by VARCHAR(50),
 verified_by_name TEXT,
 verification_source TEXT NOT NULL DEFAULT ''
);
INSERT INTO clinic_document_profile(id) VALUES(true) ON CONFLICT DO NOTHING;
ALTER TABLE vaccinations
 ADD COLUMN IF NOT EXISTS appt_id VARCHAR(50) REFERENCES appointments(id),
 ADD COLUMN IF NOT EXISTS consultation_id VARCHAR(50) REFERENCES consultations(id);
CREATE INDEX IF NOT EXISTS vaccinations_visit_idx ON vaccinations(appt_id);
-- References support treatment; their existence does not publish a document.
UPDATE pets SET vaccination_card_id='PAT-'||md5(id) WHERE NULLIF(trim(vaccination_card_id),'') IS NULL;
CREATE TABLE IF NOT EXISTS digital_vet_cards (
 pet_id VARCHAR(50) PRIMARY KEY REFERENCES pets(id),
 document_reference TEXT NOT NULL UNIQUE,
 revision INTEGER NOT NULL CHECK(revision>0),
 issued_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 refreshed_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 content_hash TEXT NOT NULL,
 snapshot JSONB NOT NULL
);
INSERT INTO pawcare_schema_migrations(version) VALUES('digital-vet-card-v1') ON CONFLICT DO NOTHING;
