-- Preserve source records; this journal is append-only, including corrections.
ALTER TABLE pets ADD COLUMN IF NOT EXISTS weight_origin TEXT NOT NULL DEFAULT 'legacy_unknown';
ALTER TABLE pet_weights ALTER COLUMN recorded_by TYPE TEXT;
ALTER TABLE pet_weights
 ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'legacy_unknown',
 ADD COLUMN IF NOT EXISTS appt_id VARCHAR(50) REFERENCES appointments(id),
 ADD COLUMN IF NOT EXISTS measured_at TIMESTAMPTZ,
 ADD COLUMN IF NOT EXISTS staff_id VARCHAR(50),
 ADD COLUMN IF NOT EXISTS staff_role TEXT,
 ADD COLUMN IF NOT EXISTS vital_id TEXT;
CREATE TABLE IF NOT EXISTS vital_measurements (
 id TEXT PRIMARY KEY,
 pet_id VARCHAR(50) NOT NULL REFERENCES pets(id),
 appt_id VARCHAR(50) REFERENCES appointments(id),
 kind TEXT NOT NULL CHECK(kind IN ('weight','temp','observation')),
 value NUMERIC,
 unit TEXT,
 measured_at TIMESTAMPTZ,
 measurement_date DATE NOT NULL,
 recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 staff_id TEXT,
 staff_name TEXT NOT NULL,
 staff_role TEXT,
 source TEXT NOT NULL,
 origin TEXT NOT NULL CHECK(origin IN ('clinic','registration','legacy_unknown')),
 notes TEXT NOT NULL DEFAULT '',
 admission_update_id UUID REFERENCES admission_updates(id),
 corrects_id TEXT UNIQUE REFERENCES vital_measurements(id),
 correction_reason TEXT NOT NULL DEFAULT '',
 CHECK((kind='weight' AND value IS NOT NULL AND unit='kg') OR (kind='temp' AND value IS NOT NULL AND unit='°C') OR (kind='observation' AND value IS NULL AND unit IS NULL)),
 CHECK(corrects_id IS NULL OR length(trim(correction_reason)) BETWEEN 3 AND 500)
);
CREATE INDEX IF NOT EXISTS vitals_pet_history ON vital_measurements(pet_id,recorded_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS vitals_visit_history ON vital_measurements(appt_id);

-- Imported dates retain their original day. Do not invent measurement time or staff ID.
INSERT INTO vital_measurements(id,pet_id,appt_id,kind,value,unit,measured_at,measurement_date,recorded_at,staff_id,staff_name,staff_role,source,origin)
 SELECT 'legacy-weight-'||id,pet_id,appt_id,'weight',kg,'kg',measured_at,date,created_at,staff_id,COALESCE(recorded_by,'Unknown historical staff'),staff_role,'legacy weight',
 CASE WHEN recorded_by ~* '^(owner|registration|initial registration)$' THEN 'registration' ELSE origin END
 FROM pet_weights w WHERE NOT EXISTS(SELECT 1 FROM vital_measurements m WHERE m.id='weight-'||w.id OR m.id=w.vital_id) ON CONFLICT(id) DO NOTHING;
UPDATE pet_weights SET origin='registration' WHERE recorded_by ~* '^(owner|registration|initial registration)$';
INSERT INTO vital_measurements(id,pet_id,appt_id,kind,value,unit,measurement_date,recorded_at,staff_name,source,origin,notes)
 SELECT 'legacy-intake-'||a.id||'-'||m.kind,a.pet_id,a.id,m.kind,(a.intake_vitals->>m.kind)::numeric,m.unit,a.date,a.created_at,
 COALESCE(a.intake_vitals->>'checkedInBy','Unknown historical staff'),'legacy intake snapshot','clinic',COALESCE(a.intake_vitals->>'notes','')
 FROM appointments a CROSS JOIN (VALUES ('weight','kg'),('temp','°C')) m(kind,unit)
 WHERE jsonb_typeof(a.intake_vitals->m.kind)='number' AND a.intake_vitals->>'captureId' IS NULL
 ON CONFLICT(id) DO NOTHING;
INSERT INTO vital_measurements(id,pet_id,appt_id,kind,value,unit,measured_at,measurement_date,recorded_at,staff_id,staff_name,staff_role,source,origin,notes,admission_update_id)
 SELECT 'admission-'||u.id||'-'||m.kind,d.pet_id,d.appt_id,m.kind,(u.measurements->>m.kind)::numeric,m.unit,u.created_at,(u.created_at AT TIME ZONE 'Asia/Manila')::date,u.created_at,u.actor_id,u.actor_name,u.actor_role,'admission','clinic',u.clinical_note,u.id
 FROM admission_updates u JOIN admissions d ON d.id=u.admission_id CROSS JOIN (VALUES('weight','kg'),('temp','°C')) m(kind,unit)
 WHERE jsonb_typeof(u.measurements->m.kind)='number' ON CONFLICT(id) DO NOTHING;
INSERT INTO vital_measurements(id,pet_id,appt_id,kind,measured_at,measurement_date,recorded_at,staff_id,staff_name,staff_role,source,origin,notes,admission_update_id)
 SELECT 'admission-'||u.id||'-observation',d.pet_id,d.appt_id,'observation',u.created_at,(u.created_at AT TIME ZONE 'Asia/Manila')::date,u.created_at,u.actor_id,u.actor_name,u.actor_role,'admission','clinic',u.clinical_note,u.id
 FROM admission_updates u JOIN admissions d ON d.id=u.admission_id
 WHERE u.kind IN ('Admission','Observation','Veterinarian update','Discharge') AND u.measurements='{}'::jsonb
 ON CONFLICT(id) DO NOTHING;

CREATE OR REPLACE FUNCTION preserve_vital_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Vital history is append-only; record a linked correction instead'; END $$;
DROP TRIGGER IF EXISTS preserve_vital_history ON vital_measurements;
CREATE TRIGGER preserve_vital_history BEFORE UPDATE OR DELETE ON vital_measurements FOR EACH ROW EXECUTE FUNCTION preserve_vital_history();

-- Each intake save has a new server-generated capture ID, even when values repeat.
CREATE OR REPLACE FUNCTION capture_intake_vitals() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE m RECORD; v JSONB; capture TEXT; at_time TIMESTAMPTZ;
BEGIN
 v:=NEW.intake_vitals; capture:=v->>'captureId';
 IF capture IS NULL OR capture IS NOT DISTINCT FROM OLD.intake_vitals->>'captureId' THEN RETURN NEW; END IF;
 at_time:=(v->>'measuredAt')::timestamptz;
 FOR m IN SELECT * FROM (VALUES('weight','kg'),('temp','°C')) AS kinds(kind,unit) LOOP
  INSERT INTO vital_measurements(id,pet_id,appt_id,kind,value,unit,measured_at,measurement_date,staff_id,staff_name,staff_role,source,origin,notes)
   VALUES(capture||'-'||m.kind,NEW.pet_id,NEW.id,m.kind,(v->>m.kind)::numeric,m.unit,at_time,(at_time AT TIME ZONE 'Asia/Manila')::date,v->>'staffId',v->>'checkedInBy',v->>'staffRole','intake','clinic',COALESCE(v->>'notes',''));
 END LOOP;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS capture_intake_vitals ON appointments;
CREATE TRIGGER capture_intake_vitals AFTER UPDATE OF intake_vitals ON appointments FOR EACH ROW EXECUTE FUNCTION capture_intake_vitals();

CREATE OR REPLACE FUNCTION capture_weight_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.vital_id IS NULL THEN
  INSERT INTO vital_measurements(id,pet_id,appt_id,kind,value,unit,measured_at,measurement_date,staff_id,staff_name,staff_role,source,origin)
   VALUES('weight-'||NEW.id,NEW.pet_id,NEW.appt_id,'weight',NEW.kg,'kg',NEW.measured_at,COALESCE((NEW.measured_at AT TIME ZONE 'Asia/Manila')::date,NEW.date),NEW.staff_id,COALESCE(NEW.recorded_by,'Unknown historical staff'),NEW.staff_role,
    CASE WHEN NEW.origin='registration' THEN 'registration' WHEN NEW.origin='clinic' THEN 'consultation' ELSE 'legacy weight' END,NEW.origin);
 END IF;
 UPDATE pets SET weight_origin=NEW.origin WHERE id=NEW.pet_id AND weight=NEW.kg;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS capture_weight_history ON pet_weights;
CREATE TRIGGER capture_weight_history AFTER INSERT ON pet_weights FOR EACH ROW EXECUTE FUNCTION capture_weight_history();

CREATE OR REPLACE FUNCTION capture_admission_vitals() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE m RECORD; d RECORD; measurement_id TEXT;
BEGIN
 SELECT pet_id,appt_id INTO d FROM admissions WHERE id=NEW.admission_id;
 FOR m IN SELECT * FROM (VALUES('weight','kg'),('temp','°C')) AS kinds(kind,unit) LOOP
  IF jsonb_typeof(NEW.measurements->m.kind)='number' THEN
   measurement_id:='admission-'||NEW.id||'-'||m.kind;
   INSERT INTO vital_measurements(id,pet_id,appt_id,kind,value,unit,measured_at,measurement_date,recorded_at,staff_id,staff_name,staff_role,source,origin,notes,admission_update_id)
    VALUES(measurement_id,d.pet_id,d.appt_id,m.kind,(NEW.measurements->>m.kind)::numeric,m.unit,NEW.created_at,(NEW.created_at AT TIME ZONE 'Asia/Manila')::date,NEW.created_at,NEW.actor_id,NEW.actor_name,NEW.actor_role,'admission','clinic',NEW.clinical_note,NEW.id);

  END IF;
 END LOOP;
 IF NEW.kind IN ('Admission','Observation','Veterinarian update','Discharge') AND NEW.measurements='{}'::jsonb THEN
  INSERT INTO vital_measurements(id,pet_id,appt_id,kind,measured_at,measurement_date,recorded_at,staff_id,staff_name,staff_role,source,origin,notes,admission_update_id)
   VALUES('admission-'||NEW.id||'-observation',d.pet_id,d.appt_id,'observation',NEW.created_at,(NEW.created_at AT TIME ZONE 'Asia/Manila')::date,NEW.created_at,NEW.actor_id,NEW.actor_name,NEW.actor_role,'admission','clinic',NEW.clinical_note,NEW.id);
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS capture_admission_vitals ON admission_updates;
CREATE TRIGGER capture_admission_vitals AFTER INSERT ON admission_updates FOR EACH ROW EXECUTE FUNCTION capture_admission_vitals();
INSERT INTO pawcare_schema_migrations(version) VALUES('vitals-history-v1') ON CONFLICT DO NOTHING;
