-- A second clinic administrator can be invited, so a lost phone or password never leaves the clinic without one.
DO $$
DECLARE c record;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid = 'staff_invitations'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%role%' LOOP
    EXECUTE format('ALTER TABLE staff_invitations DROP CONSTRAINT %I', c.conname);
  END LOOP;
  ALTER TABLE staff_invitations ADD CONSTRAINT staff_invitations_role_check CHECK (role IN ('vet', 'assistant', 'admin'));
END $$;
CREATE TABLE IF NOT EXISTS pawcare_schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
INSERT INTO pawcare_schema_migrations(version) VALUES ('staff-admin-role-v1') ON CONFLICT DO NOTHING;
