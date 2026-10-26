ALTER TABLE appointments ADD COLUMN IF NOT EXISTS handoffs JSONB NOT NULL DEFAULT '[]';
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS care_status TEXT NOT NULL DEFAULT 'Routine care',
 ADD COLUMN IF NOT EXISTS follow_up_date DATE,
 ADD COLUMN IF NOT EXISTS follow_up_reason TEXT NOT NULL DEFAULT '';

-- Each consultation with a care plan is a durable request. Never infer its booking from a pet/date match.
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS follow_up_id VARCHAR(100) REFERENCES consultations(id);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_follow_up_visit ON appointments(follow_up_id)
 WHERE follow_up_id IS NOT NULL AND status NOT IN ('Cancelled','Rejected','No-show');
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS performed_services JSONB NOT NULL DEFAULT '[]';
