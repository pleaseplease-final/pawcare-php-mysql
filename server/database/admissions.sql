-- Admission is separate from appointment completion and payment.
CREATE TABLE IF NOT EXISTS admissions (
  id UUID PRIMARY KEY,
  pet_id VARCHAR(50) NOT NULL REFERENCES pets(id),
  appt_id VARCHAR(50) NOT NULL UNIQUE REFERENCES appointments(id),
  reason TEXT NOT NULL CHECK (length(reason) BETWEEN 1 AND 3000),
  care_plan TEXT NOT NULL CHECK (length(care_plan) BETWEEN 1 AND 3000),
  status TEXT NOT NULL DEFAULT 'Admitted' CHECK (status IN ('Admitted','Discharged')),
  revision INTEGER NOT NULL DEFAULT 0,
  admitted_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  discharged_at TIMESTAMPTZ,
  discharge_instructions TEXT NOT NULL DEFAULT '',
  CHECK ((status='Admitted' AND discharged_at IS NULL) OR (status='Discharged' AND discharged_at IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_admission_per_pet ON admissions(pet_id) WHERE status='Admitted';
CREATE TABLE IF NOT EXISTS admission_updates (
  id UUID PRIMARY KEY,
  admission_id UUID NOT NULL REFERENCES admissions(id),
  kind TEXT NOT NULL CHECK (kind IN ('Admission','Observation','Veterinarian update','Discharge')),
  clinical_note TEXT NOT NULL,
  care_plan TEXT NOT NULL DEFAULT '',
  measurements JSONB NOT NULL DEFAULT '{}',
  owner_update TEXT NOT NULL DEFAULT '',
  actor_id VARCHAR(50) NOT NULL REFERENCES users(id),
  actor_name TEXT NOT NULL,
  actor_role TEXT NOT NULL CHECK (actor_role IN ('vet','assistant')),
  request_payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS admission_updates_timeline ON admission_updates(admission_id,created_at DESC,id DESC);
