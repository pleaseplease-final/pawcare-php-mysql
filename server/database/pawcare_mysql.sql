-- ========================================================
-- PawCare Veterinary Clinic Database Schema (MySQL / MariaDB)
-- Fully converted from PostgreSQL for PHP & MySQL Project Rubrics
-- Compatible with MySQL 5.7+, MySQL 8.0+, MariaDB 10.4+, TiDB Cloud, Aiven
-- ========================================================

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS admission_updates;
DROP TABLE IF EXISTS admissions;
DROP TABLE IF EXISTS digital_vet_cards;
DROP TABLE IF EXISTS clinic_document_profile;
DROP TABLE IF EXISTS clinic_catalog_items;
DROP TABLE IF EXISTS consultations;
DROP TABLE IF EXISTS vaccinations;
DROP TABLE IF EXISTS appointments;
DROP TABLE IF EXISTS pet_requests;
DROP TABLE IF EXISTS pet_weights;
DROP TABLE IF EXISTS pets;
DROP TABLE IF EXISTS owners;
DROP TABLE IF EXISTS account_photos;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS verification_tokens;
DROP TABLE IF EXISTS staff_invitations;
DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS addresses;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS pawcare_schema_migrations;
SET FOREIGN_KEY_CHECKS = 1;

-- Migration Tracker
CREATE TABLE IF NOT EXISTS pawcare_schema_migrations (
  version VARCHAR(100) PRIMARY KEY,
  applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 1. USERS & RBAC ROLES (admin, vet, assistant, owner)
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(50) PRIMARY KEY,
  first_name VARCHAR(50) NOT NULL,
  last_name VARCHAR(50) NOT NULL,
  middle_initial VARCHAR(2) DEFAULT NULL,
  birthday DATE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  role ENUM('admin', 'vet', 'assistant', 'owner') NOT NULL DEFAULT 'owner',
  vet_id VARCHAR(50) DEFAULT NULL,
  owner_id VARCHAR(50) DEFAULT NULL,
  mobile_number VARCHAR(30) NOT NULL,
  email_verified_at DATETIME DEFAULT NULL,
  mobile_verified TINYINT(1) NOT NULL DEFAULT 0,
  mobile_verified_at DATETIME DEFAULT NULL,
  failed_login_attempts INT NOT NULL DEFAULT 0,
  is_locked TINYINT(1) NOT NULL DEFAULT 0,
  lockout_until DATETIME DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_users_email (email),
  INDEX idx_users_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. USER ADDRESSES
CREATE TABLE IF NOT EXISTS addresses (
  id VARCHAR(50) PRIMARY KEY,
  user_id VARCHAR(50) NOT NULL,
  house_street VARCHAR(255) NOT NULL,
  country VARCHAR(100) NOT NULL,
  city VARCHAR(100) NOT NULL,
  state VARCHAR(100) NOT NULL,
  zip_code VARCHAR(20) NOT NULL,
  INDEX idx_addresses_user (user_id),
  CONSTRAINT fk_addresses_users FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. VERIFICATION TOKENS (Email OTP, SMS OTP, Password Reset, Unlock)
CREATE TABLE IF NOT EXISTS verification_tokens (
  id VARCHAR(50) PRIMARY KEY,
  user_id VARCHAR(50) NOT NULL,
  token_hash VARCHAR(255) NOT NULL,
  type ENUM('email_verify', 'mobile_otp', 'password_reset', 'account_unlock') NOT NULL,
  expired_at DATETIME NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_vt_lookup (type, token_hash),
  CONSTRAINT fk_vt_users FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. SESSIONS (Server-side Session & Token Management)
CREATE TABLE IF NOT EXISTS sessions (
  token_hash VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(50) NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_sessions_user (user_id),
  CONSTRAINT fk_sessions_users FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. OWNERS (Client Masterlist)
CREATE TABLE IF NOT EXISTS owners (
  id VARCHAR(50) PRIMARY KEY,
  user_id VARCHAR(50) DEFAULT NULL,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(30) NOT NULL,
  address TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_owners_email (email),
  INDEX idx_owners_user (user_id),
  CONSTRAINT fk_owners_users FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. PETS (Patient Masterlist)
CREATE TABLE IF NOT EXISTS pets (
  id VARCHAR(50) PRIMARY KEY,
  owner_id VARCHAR(50) NOT NULL,
  name VARCHAR(60) NOT NULL,
  species VARCHAR(30) NOT NULL DEFAULT 'Dog',
  species_other VARCHAR(50) DEFAULT NULL,
  breed VARCHAR(60) NOT NULL DEFAULT 'Mixed Breed',
  sex VARCHAR(10) NOT NULL DEFAULT 'Male',
  birth DATE NOT NULL,
  weight DECIMAL(5,2) NOT NULL DEFAULT 5.00,
  color VARCHAR(60) DEFAULT NULL,
  neutered VARCHAR(20) DEFAULT 'Not sure',
  allergies JSON DEFAULT NULL,
  vaccination_card_id VARCHAR(50) DEFAULT NULL,
  notes TEXT DEFAULT NULL,
  photo LONGTEXT DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_pets_owner (owner_id),
  INDEX idx_pets_name (name),
  CONSTRAINT fk_pets_owners FOREIGN KEY (owner_id) REFERENCES owners(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. PET WEIGHTS HISTORY
CREATE TABLE IF NOT EXISTS pet_weights (
  id VARCHAR(50) PRIMARY KEY,
  pet_id VARCHAR(50) NOT NULL,
  date DATE NOT NULL,
  kg DECIMAL(5,2) NOT NULL,
  recorded_by VARCHAR(50) DEFAULT 'clinic',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_pet_weights_pet (pet_id),
  CONSTRAINT fk_pet_weights_pets FOREIGN KEY (pet_id) REFERENCES pets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. PET REQUESTS (Online Pet Registrations submitted by Pet Owners)
CREATE TABLE IF NOT EXISTS pet_requests (
  id VARCHAR(50) PRIMARY KEY,
  owner_id VARCHAR(50) NOT NULL,
  name VARCHAR(60) NOT NULL,
  species VARCHAR(30) NOT NULL,
  species_other VARCHAR(50) DEFAULT NULL,
  breed VARCHAR(60) DEFAULT NULL,
  sex VARCHAR(10) NOT NULL,
  birth DATE NOT NULL,
  weight DECIMAL(5,2) NOT NULL,
  color VARCHAR(60) DEFAULT NULL,
  neutered VARCHAR(20) DEFAULT NULL,
  notes TEXT DEFAULT NULL,
  status ENUM('Pending', 'Approved', 'Declined') NOT NULL DEFAULT 'Pending',
  decline_reason TEXT DEFAULT NULL,
  pet_id VARCHAR(50) DEFAULT NULL,
  card_id VARCHAR(50) DEFAULT NULL,
  requested_at DATE NOT NULL,
  approved_at DATE DEFAULT NULL,
  approved_by VARCHAR(100) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_pet_requests_status (status),
  INDEX idx_pet_requests_owner (owner_id),
  CONSTRAINT fk_pet_requests_owners FOREIGN KEY (owner_id) REFERENCES owners(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9. APPOINTMENTS & INTAKE QUEUE (CRUD & Scheduling)
CREATE TABLE IF NOT EXISTS appointments (
  id VARCHAR(50) PRIMARY KEY,
  pet_id VARCHAR(50) NOT NULL,
  vet_id VARCHAR(50) NOT NULL,
  date DATE NOT NULL,
  time VARCHAR(10) NOT NULL,
  reason TEXT NOT NULL,
  status ENUM('Scheduled', 'Pending Approval', 'Confirmed', 'Checked-in', 'In consultation', 'Completed', 'Cancelled', 'No-show') NOT NULL DEFAULT 'Scheduled',
  billing_status VARCHAR(20) NOT NULL DEFAULT 'Unbilled',
  amount DECIMAL(10,2) NOT NULL DEFAULT 600.00,
  intake_vitals JSON DEFAULT NULL,
  cancel_reason TEXT DEFAULT NULL,
  payment_method VARCHAR(30) DEFAULT NULL,
  paid_at DATETIME DEFAULT NULL,
  invoice_items JSON DEFAULT NULL,
  payment_details JSON DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_appointments_date_vet (date, vet_id),
  INDEX idx_appointments_pet (pet_id),
  INDEX idx_appointments_status (status),
  CONSTRAINT fk_appointments_pets FOREIGN KEY (pet_id) REFERENCES pets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 10. VACCINATIONS & DIGITAL CARDS
CREATE TABLE IF NOT EXISTS vaccinations (
  id VARCHAR(50) PRIMARY KEY,
  pet_id VARCHAR(50) NOT NULL,
  card_id VARCHAR(50) NOT NULL,
  vaccine VARCHAR(100) NOT NULL,
  brand VARCHAR(60) DEFAULT NULL,
  batch VARCHAR(60) DEFAULT NULL,
  date DATE NOT NULL,
  next_due DATE DEFAULT NULL,
  dose_no INT DEFAULT NULL,
  dose_of INT DEFAULT NULL,
  done TINYINT(1) NOT NULL DEFAULT 0,
  automated TINYINT(1) NOT NULL DEFAULT 0,
  protocol_type VARCHAR(60) DEFAULT NULL,
  notes TEXT DEFAULT NULL,
  vet_id VARCHAR(50) DEFAULT NULL,
  recorded_by VARCHAR(100) DEFAULT NULL,
  appt_id VARCHAR(50) DEFAULT NULL,
  consultation_id VARCHAR(50) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_vaccinations_pet (pet_id),
  INDEX idx_vaccinations_due (next_due, done),
  CONSTRAINT fk_vaccinations_pets FOREIGN KEY (pet_id) REFERENCES pets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 11. CONSULTATIONS (SOAP Medical Notes)
CREATE TABLE IF NOT EXISTS consultations (
  id VARCHAR(50) PRIMARY KEY,
  pet_id VARCHAR(50) NOT NULL,
  vet_id VARCHAR(50) NOT NULL,
  appt_id VARCHAR(50) DEFAULT NULL,
  date DATE NOT NULL,
  symptoms TEXT NOT NULL,
  objective TEXT NOT NULL,
  diagnosis TEXT NOT NULL,
  treatment TEXT NOT NULL,
  prescription TEXT DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_consultations_pet (pet_id),
  CONSTRAINT fk_consultations_pets FOREIGN KEY (pet_id) REFERENCES pets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 12. AUDIT LOGS (Account Security & System Logs)
CREATE TABLE IF NOT EXISTS audit_logs (
  id VARCHAR(50) PRIMARY KEY,
  user_name VARCHAR(100) NOT NULL,
  user_role VARCHAR(30) DEFAULT NULL,
  action TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 13. STAFF INVITATIONS
CREATE TABLE IF NOT EXISTS staff_invitations (
  id VARCHAR(50) PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  role ENUM('vet', 'assistant') NOT NULL,
  token_hash VARCHAR(255) NOT NULL,
  invited_by VARCHAR(50) DEFAULT NULL,
  accepted_at DATETIME DEFAULT NULL,
  expired_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_staff_inv_token (token_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 14. ACCOUNT PHOTOS
CREATE TABLE IF NOT EXISTS account_photos (
  user_id VARCHAR(50) PRIMARY KEY,
  photo LONGTEXT NOT NULL,
  CONSTRAINT fk_account_photos_users FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 15. ADMISSIONS (Hospitalization & Ward Management)
CREATE TABLE IF NOT EXISTS admissions (
  id VARCHAR(50) PRIMARY KEY,
  pet_id VARCHAR(50) NOT NULL,
  appt_id VARCHAR(50) NOT NULL UNIQUE,
  reason TEXT NOT NULL,
  care_plan TEXT NOT NULL,
  status ENUM('Admitted','Discharged') NOT NULL DEFAULT 'Admitted',
  revision INT NOT NULL DEFAULT 0,
  admitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  discharged_at DATETIME DEFAULT NULL,
  discharge_instructions TEXT NOT NULL,
  INDEX idx_admissions_pet (pet_id),
  CONSTRAINT fk_admissions_pets FOREIGN KEY (pet_id) REFERENCES pets(id) ON DELETE CASCADE,
  CONSTRAINT fk_admissions_appts FOREIGN KEY (appt_id) REFERENCES appointments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 16. ADMISSION UPDATES (Clinical Timeline)
CREATE TABLE IF NOT EXISTS admission_updates (
  id VARCHAR(50) PRIMARY KEY,
  admission_id VARCHAR(50) NOT NULL,
  kind ENUM('Admission','Observation','Veterinarian update','Discharge') NOT NULL,
  clinical_note TEXT NOT NULL,
  care_plan TEXT NOT NULL,
  measurements JSON DEFAULT NULL,
  owner_update TEXT NOT NULL,
  actor_id VARCHAR(50) NOT NULL,
  actor_name TEXT NOT NULL,
  actor_role ENUM('vet','assistant') NOT NULL,
  request_payload JSON DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_admission_updates_timeline (admission_id, created_at),
  CONSTRAINT fk_admission_updates_adm FOREIGN KEY (admission_id) REFERENCES admissions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 17. CLINIC CATALOG ITEMS (Price Catalog for Billing / Invoices)
CREATE TABLE IF NOT EXISTS clinic_catalog_items (
  id VARCHAR(80) PRIMARY KEY,
  name VARCHAR(80) NOT NULL UNIQUE,
  category VARCHAR(60) NOT NULL,
  price DECIMAL(12,2) NOT NULL,
  unit VARCHAR(40) NOT NULL DEFAULT 'item / package',
  description VARCHAR(200) NOT NULL DEFAULT '',
  active TINYINT(1) NOT NULL DEFAULT 1,
  built_in TINYINT(1) NOT NULL DEFAULT 0,
  previous_prices JSON DEFAULT NULL,
  revision INT NOT NULL DEFAULT 0,
  updated_by VARCHAR(120) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 18. DIGITAL VET CARDS
CREATE TABLE IF NOT EXISTS digital_vet_cards (
  pet_id VARCHAR(50) PRIMARY KEY,
  document_reference VARCHAR(100) NOT NULL UNIQUE,
  revision INT NOT NULL,
  issued_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  refreshed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  content_hash VARCHAR(255) NOT NULL,
  snapshot JSON NOT NULL,
  CONSTRAINT fk_vet_cards_pets FOREIGN KEY (pet_id) REFERENCES pets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 19. CLINIC DOCUMENT PROFILE
CREATE TABLE IF NOT EXISTS clinic_document_profile (
  id TINYINT(1) PRIMARY KEY DEFAULT 1,
  details JSON DEFAULT NULL,
  revision INT NOT NULL DEFAULT 0,
  verified_at DATETIME DEFAULT NULL,
  verified_by VARCHAR(50) DEFAULT NULL,
  verified_by_name TEXT DEFAULT NULL,
  verification_source TEXT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO clinic_document_profile (id, details, verification_source) VALUES (1, '{}', '')
ON DUPLICATE KEY UPDATE id=id;

