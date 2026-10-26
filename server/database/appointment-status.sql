-- Rename legacy states exactly once, preserving the approval meaning of each row.
BEGIN;
SELECT pg_advisory_xact_lock(726341901);
CREATE TABLE IF NOT EXISTS pawcare_schema_migrations(version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
DO $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pawcare_schema_migrations WHERE version='appointment-status-v2') THEN
  ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_status_check;
  UPDATE appointments SET status=CASE status WHEN 'Scheduled' THEN 'Pending Approval' WHEN 'Confirmed' THEN 'Scheduled' ELSE status END;
  ALTER TABLE appointments ALTER COLUMN status SET DEFAULT 'Pending Approval';
  ALTER TABLE appointments ADD CONSTRAINT appointments_status_check CHECK(status IN ('Pending Approval','Scheduled','Checked-in','In consultation','Completed','Cancelled','Rejected','No-show'));
  UPDATE appointments SET billing_status='Unbilled' WHERE billing_status='Pending';
  UPDATE appointments SET billing_status='Unpaid' WHERE status='Completed' AND billing_status='Unbilled' AND jsonb_array_length(COALESCE(invoice_items,'[]'::jsonb))>0;
  ALTER TABLE appointments ALTER COLUMN billing_status SET DEFAULT 'Unbilled';
  ALTER TABLE appointments ADD CONSTRAINT appointments_payment_status_check CHECK(billing_status IN ('Unbilled','Unpaid','Paid'));
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='appointments' AND column_name='follow_up_id') THEN
   DROP INDEX IF EXISTS one_active_follow_up_visit;
   CREATE UNIQUE INDEX one_active_follow_up_visit ON appointments(follow_up_id)
    WHERE follow_up_id IS NOT NULL AND status NOT IN ('Cancelled','Rejected','No-show');
  END IF;
  INSERT INTO pawcare_schema_migrations(version) VALUES('appointment-status-v2');
 END IF;
END $$;
COMMIT;
