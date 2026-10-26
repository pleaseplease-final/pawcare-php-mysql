-- Durable recovery limits also apply to nonexistent identifiers without revealing accounts.
CREATE TABLE IF NOT EXISTS password_recovery (
 identifier_hash VARCHAR(64) PRIMARY KEY,
 id UUID NOT NULL,
 user_id VARCHAR(50) REFERENCES users(id) ON DELETE CASCADE,
 base_email TEXT,
 base_password_hash TEXT,
 code_hash VARCHAR(64),
 sent BOOLEAN NOT NULL DEFAULT false,
 attempts INTEGER NOT NULL DEFAULT 0,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 expires_at TIMESTAMPTZ NOT NULL,
 consumed_at TIMESTAMPTZ
);
