-- PawCare Veterinary Clinic Database Schema (PostgreSQL for Neon DB)
-- Compatible with PostgreSQL 13+ and Neon Serverless

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. USERS & RBAC ROLES (admin, vet, assistant, owner)
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(50) PRIMARY KEY DEFAULT ('u_' || substr(md5(random()::text), 1, 10)),
  first_name VARCHAR(50) NOT NULL,
  last_name VARCHAR(50) NOT NULL,
  middle_initial VARCHAR(2),
  birthday DATE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  role VARCHAR(20) NOT NULL DEFAULT 'owner' CHECK (role IN ('admin', 'vet', 'assistant', 'owner')),
  vet_id VARCHAR(50),
  owner_id VARCHAR(50),
  mobile_number VARCHAR(30) NOT NULL,
  email_verified_at TIMESTAMPTZ,
  mobile_verified BOOLEAN NOT NULL DEFAULT false,
  mobile_verified_at TIMESTAMP WITH TIME ZONE,
  failed_login_attempts INT NOT NULL DEFAULT 0,
  is_locked BOOLEAN NOT NULL DEFAULT false,
  lockout_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS users_email_idx ON users(email);

-- 2. USER ADDRESSES
CREATE TABLE IF NOT EXISTS addresses (
  id VARCHAR(50) PRIMARY KEY DEFAULT ('addr_' || substr(md5(random()::text), 1, 10)),
  user_id VARCHAR(50) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  house_street VARCHAR(255) NOT NULL,
  country VARCHAR(100) NOT NULL,
  city VARCHAR(100) NOT NULL,
  state VARCHAR(100) NOT NULL,
  zip_code VARCHAR(20) NOT NULL
);

-- 3. VERIFICATION TOKENS
CREATE TABLE IF NOT EXISTS verification_tokens (
  id VARCHAR(50) PRIMARY KEY DEFAULT ('tok_' || substr(md5(random()::text), 1, 10)),
  user_id VARCHAR(50) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL,
  type VARCHAR(30) NOT NULL CHECK (type IN ('email_verify', 'mobile_otp', 'password_reset', 'account_unlock')),
  expired_at TIMESTAMPTZ NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS vt_lookup ON verification_tokens(type, token_hash);

-- 4. SESSIONS
CREATE TABLE IF NOT EXISTS sessions (
  token_hash VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(50) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. OWNERS (Client Masterlist)
CREATE TABLE IF NOT EXISTS owners (
  id VARCHAR(50) PRIMARY KEY,
  user_id VARCHAR(50),
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(30) NOT NULL,
  address TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS owners_email_idx ON owners(email);

-- 6. PETS (Patient Masterlist)
CREATE TABLE IF NOT EXISTS pets (
  id VARCHAR(50) PRIMARY KEY,
  owner_id VARCHAR(50) NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  name VARCHAR(60) NOT NULL,
  species VARCHAR(30) NOT NULL DEFAULT 'Dog',
  species_other VARCHAR(50),
  breed VARCHAR(60) NOT NULL DEFAULT 'Mixed Breed',
  sex VARCHAR(10) NOT NULL DEFAULT 'Male',
  birth DATE NOT NULL,
  weight NUMERIC(5,2) NOT NULL DEFAULT 5.0,
  color VARCHAR(60),
  neutered VARCHAR(20) DEFAULT 'Not sure',
  allergies TEXT[] DEFAULT '{}',
  vaccination_card_id VARCHAR(50),
  notes TEXT DEFAULT '',
  photo TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS pets_owner_idx ON pets(owner_id);

-- 7. PET WEIGHTS HISTORY
CREATE TABLE IF NOT EXISTS pet_weights (
  id VARCHAR(50) PRIMARY KEY DEFAULT ('wt_' || substr(md5(random()::text), 1, 10)),
  pet_id VARCHAR(50) NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  kg NUMERIC(5,2) NOT NULL,
  recorded_by VARCHAR(50) DEFAULT 'clinic',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. PET REQUESTS (Online Pet Registrations submitted by Pet Owners)
CREATE TABLE IF NOT EXISTS pet_requests (
  id VARCHAR(50) PRIMARY KEY,
  owner_id VARCHAR(50) NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  name VARCHAR(60) NOT NULL,
  species VARCHAR(30) NOT NULL,
  species_other VARCHAR(50),
  breed VARCHAR(60),
  sex VARCHAR(10) NOT NULL,
  birth DATE NOT NULL,
  weight NUMERIC(5,2) NOT NULL,
  color VARCHAR(60),
  neutered VARCHAR(20),
  notes TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Declined')),
  decline_reason TEXT,
  pet_id VARCHAR(50),
  card_id VARCHAR(50),
  requested_at DATE NOT NULL DEFAULT CURRENT_DATE,
  approved_at DATE,
  approved_by VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS pet_requests_status_idx ON pet_requests(status);

-- 9. APPOINTMENTS & INTAKE QUEUE
CREATE TABLE IF NOT EXISTS appointments (
  id VARCHAR(50) PRIMARY KEY,
  pet_id VARCHAR(50) NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  vet_id VARCHAR(50) NOT NULL,
  date DATE NOT NULL,
  time VARCHAR(10) NOT NULL,
  reason TEXT NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'Scheduled' CHECK (status IN ('Scheduled', 'Confirmed', 'Checked-in', 'In consultation', 'Completed', 'Cancelled', 'No-show')),
  billing_status VARCHAR(20) NOT NULL DEFAULT 'Unbilled',
  amount NUMERIC(10,2) NOT NULL DEFAULT 600.00,
  intake_vitals JSONB DEFAULT NULL,
  cancel_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS appts_date_vet_idx ON appointments(date, vet_id);

-- 10. VACCINATIONS & DIGITAL CARDS
CREATE TABLE IF NOT EXISTS vaccinations (
  id VARCHAR(50) PRIMARY KEY,
  pet_id VARCHAR(50) NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  card_id VARCHAR(50) NOT NULL,
  vaccine VARCHAR(100) NOT NULL,
  brand VARCHAR(60),
  batch VARCHAR(60),
  date DATE NOT NULL,
  next_due DATE,
  dose_no INT,
  dose_of INT,
  done BOOLEAN NOT NULL DEFAULT false,
  automated BOOLEAN NOT NULL DEFAULT false,
  protocol_type VARCHAR(60),
  notes TEXT,
  vet_id VARCHAR(50),
  recorded_by VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS vacc_pet_idx ON vaccinations(pet_id);
CREATE INDEX IF NOT EXISTS vacc_due_idx ON vaccinations(next_due, done);

-- 11. CONSULTATIONS (SOAP Medical Notes)
CREATE TABLE IF NOT EXISTS consultations (
  id VARCHAR(50) PRIMARY KEY,
  pet_id VARCHAR(50) NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  vet_id VARCHAR(50) NOT NULL,
  appt_id VARCHAR(50),
  date DATE NOT NULL,
  symptoms TEXT NOT NULL,
  objective TEXT NOT NULL,
  diagnosis TEXT NOT NULL,
  treatment TEXT NOT NULL,
  prescription TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS consult_pet_idx ON consultations(pet_id);

-- 12. AUDIT LOGS
CREATE TABLE IF NOT EXISTS audit_logs (
  id VARCHAR(50) PRIMARY KEY DEFAULT ('log_' || substr(md5(random()::text), 1, 10)),
  user_name VARCHAR(100) NOT NULL,
  user_role VARCHAR(30),
  action TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 13. STAFF INVITATIONS (Admin invites Vets and Vet Assistants)
CREATE TABLE IF NOT EXISTS staff_invitations (
  id VARCHAR(50) PRIMARY KEY DEFAULT ('inv_' || substr(md5(random()::text), 1, 10)),
  email VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('vet', 'assistant')),
  token_hash VARCHAR(255) NOT NULL,
  invited_by VARCHAR(50),
  accepted_at TIMESTAMPTZ,
  expired_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS staff_inv_email_uniq ON staff_invitations(email);
CREATE INDEX IF NOT EXISTS staff_inv_lookup ON staff_invitations(token_hash);



-- Persistent account pictures shared by all four roles.
CREATE TABLE IF NOT EXISTS account_photos (
  user_id VARCHAR(50) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  photo TEXT NOT NULL DEFAULT ''
);

-- Checkout fields, including existing installations initialized before billing.
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS payment_method VARCHAR(30),
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS invoice_items JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS payment_details JSONB NOT NULL DEFAULT '{}';
