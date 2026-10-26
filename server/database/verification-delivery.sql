-- Keep resend limits after a token is consumed or exhausted.
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_requested_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mobile_otp_requested_at TIMESTAMPTZ;
-- Pending legacy tokens have unknown delivery status and require a fresh message.
ALTER TABLE verification_tokens ADD COLUMN IF NOT EXISTS delivery_confirmed BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE verification_tokens ADD COLUMN IF NOT EXISTS destination TEXT;
