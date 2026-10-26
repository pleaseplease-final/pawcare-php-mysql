-- Idempotent migration: scheduling metadata and durable reminder deliveries.
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS service VARCHAR(30);
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS duration_minutes INTEGER NOT NULL DEFAULT 30 CHECK (duration_minutes > 0 AND duration_minutes <= 480);
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS booking_kind VARCHAR(20) NOT NULL DEFAULT 'reservation' CHECK (booking_kind IN ('reservation', 'walk-in'));
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS appointment_availability ON appointments(date, vet_id);
CREATE TABLE IF NOT EXISTS vaccination_reminders (
 id BIGSERIAL PRIMARY KEY,
 vaccination_id VARCHAR(50) NOT NULL REFERENCES vaccinations(id) ON DELETE CASCADE,
 due_date DATE NOT NULL,
 milestone INTEGER NOT NULL CHECK (milestone IN (30,14,3)),
 channel VARCHAR(10) NOT NULL CHECK (channel IN ('email','sms')),
 scheduled_at TIMESTAMPTZ NOT NULL,
 status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','accepted','failed','cancelled','uncertain')),
 attempts INTEGER NOT NULL DEFAULT 0,
 next_attempt_at TIMESTAMPTZ NOT NULL,
 claimed_at TIMESTAMPTZ,
 provider VARCHAR(30),
 provider_id TEXT,
 accepted_at TIMESTAMPTZ,
 last_error TEXT,
 UNIQUE(vaccination_id,due_date,milestone,channel)
);
CREATE INDEX IF NOT EXISTS vaccination_reminders_ready ON vaccination_reminders(status,next_attempt_at);
-- Only a veterinarian-certified administered dose creates a recall obligation.
-- Rank before filtering next_due: a newer dose without a booster date retires an old schedule.
CREATE OR REPLACE VIEW current_vaccination_due AS
 SELECT * FROM (
   SELECT v.*, ROW_NUMBER() OVER (PARTITION BY pet_id,
     CASE WHEN LOWER(vaccine) LIKE '%rabies%' THEN 'rabies'
          WHEN LOWER(vaccine) ~ '(dhpp|5-in-1|6-in-1|8-in-1)' THEN 'canine-core'
          WHEN LOWER(vaccine) ~ '(fvrcp|feline.*4.in.1)' THEN 'feline-core'
          ELSE LOWER(TRIM(vaccine)) END
     ORDER BY date DESC NULLS LAST, created_at DESC, id DESC) AS due_rank
   FROM vaccinations v WHERE done = true AND NULLIF(vet_id,'') IS NOT NULL
 ) latest WHERE due_rank = 1 AND next_due IS NOT NULL;

CREATE TABLE IF NOT EXISTS reminder_worker_health (
 id INTEGER PRIMARY KEY CHECK (id=1),
 last_started_at TIMESTAMPTZ NOT NULL,
 last_completed_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS pawcare_schema_migrations (
 version TEXT PRIMARY KEY,
 applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO pawcare_schema_migrations(version) VALUES ('booking-reminders-v1') ON CONFLICT DO NOTHING;
