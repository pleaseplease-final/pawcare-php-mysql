-- Durable reception handoff. Payment and clinical data remain in their existing tables.
CREATE TABLE IF NOT EXISTS checkout_tasks (
 appointment_id VARCHAR(50) PRIMARY KEY REFERENCES appointments(id) ON DELETE CASCADE,
 status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','claimed','completed')),
 claimed_by VARCHAR(50) REFERENCES users(id) ON DELETE SET NULL,
 claim_hash VARCHAR(64),
 lease_until TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 completed_at TIMESTAMPTZ,
 completed_by VARCHAR(50) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS checkout_tasks_pending ON checkout_tasks(status,created_at);
CREATE TABLE IF NOT EXISTS pawcare_schema_migrations (
 version TEXT PRIMARY KEY,
 applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO pawcare_schema_migrations(version) VALUES ('checkout-inbox-v1') ON CONFLICT DO NOTHING;
