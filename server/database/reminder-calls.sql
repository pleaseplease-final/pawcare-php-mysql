-- Durable receptionist call outcomes; saving a call does not dispatch a message.
CREATE TABLE IF NOT EXISTS reminder_call_logs (
 id UUID PRIMARY KEY,
 vaccination_id VARCHAR(50) NOT NULL,
 pet_id VARCHAR(50) NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
 owner_id VARCHAR(50) NOT NULL,
 vaccine TEXT NOT NULL,
 due_date DATE NOT NULL,
 phone VARCHAR(50) NOT NULL DEFAULT '',
 outcome VARCHAR(30) NOT NULL CHECK (outcome IN ('Reached owner','No answer','Callback requested','Contact unavailable')),
 notes TEXT NOT NULL DEFAULT '' CHECK (length(notes) <= 2000),
 staff_id VARCHAR(50) NOT NULL,
 staff_name TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS reminder_call_logs_patient ON reminder_call_logs(pet_id,created_at DESC);
