-- Pending account contacts never replace verified login/reminder destinations until proven.
CREATE TABLE IF NOT EXISTS account_contact_changes (
 user_id VARCHAR(50) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 id UUID NOT NULL UNIQUE,
 base_email TEXT NOT NULL,
 base_phone TEXT NOT NULL,
 proposed JSONB NOT NULL,
 email_hash TEXT,
 phone_hash TEXT,
 email_sent BOOLEAN NOT NULL DEFAULT false,
 phone_sent BOOLEAN NOT NULL DEFAULT false,
 attempts INTEGER NOT NULL DEFAULT 0,
 expires_at TIMESTAMPTZ NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Keep the send cooldown even when an address save invalidates a proposal.
ALTER TABLE users ADD COLUMN IF NOT EXISTS contact_code_requested_at TIMESTAMPTZ;
