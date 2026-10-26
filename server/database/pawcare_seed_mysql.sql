-- ========================================================
-- PawCare Seed Data for MySQL
-- Default accounts and demo clinic records
-- Passwords hashed with PHP password_hash(..., PASSWORD_BCRYPT)
-- ========================================================

-- 1. Users
INSERT INTO users (id, first_name, last_name, birthday, password_hash, email, role, mobile_number, email_verified_at, mobile_verified)
VALUES 
  ('u_admin_1', 'Admin', 'Officer', '1985-05-15', '$2y$10$0Us4vg8bMwDQYhf9/VeIQuin8cX/GzGO3oK.DNZ3sVlPCg2N0dsS6', 'admin@pawcare.com', 'admin', '+63 917 123 4567', NOW(), 1),
  ('u_vet_1', 'Ana', 'Cruz', '1990-03-20', '$2y$10$CEQZL7ozcTZ3fJDt15tVkeSuc8nF8hKldEhMA6xwKhTT9xrbkUOe2', 'vet@pawcare.com', 'vet', '+63 918 234 5678', NOW(), 1),
  ('u_asst_1', 'Liza', 'Ramos', '1995-08-25', '$2y$10$C9UH6yIpAT7TmR0SVpNuzu2SHr0AEDyXEoixGgamoX2wvUbZB8JHC', 'assistant@pawcare.com', 'assistant', '+63 920 456 7890', NOW(), 1),
  ('u_owner_1', 'Maria', 'Santos', '1992-04-10', '$2y$10$DVspFUOHerP5hd7FAFcTMe3S.3GM7fLqzVmDwTtOozccNhfRI.aoG', 'maria@example.com', 'owner', '+63 917 888 1111', NOW(), 1)
ON DUPLICATE KEY UPDATE updated_at=NOW();

UPDATE users SET vet_id='u_vet_1' WHERE id='u_vet_1';
UPDATE users SET owner_id='o_1' WHERE id='u_owner_1';

-- 2. Addresses
INSERT INTO addresses (id, user_id, house_street, country, city, state, zip_code)
VALUES
  ('addr_1', 'u_owner_1', '12 Mabini St., Brgy. San Antonio', 'Philippines', 'Pasig City', 'Metro Manila', '1600')
ON DUPLICATE KEY UPDATE house_street=VALUES(house_street);

-- 3. Owners
INSERT INTO owners (id, user_id, name, email, phone, address)
VALUES
  ('o_1', 'u_owner_1', 'Maria Santos', 'maria@example.com', '+63 917 888 1111', '12 Mabini St., Brgy. San Antonio, Pasig City'),
  ('o_2', NULL, 'Jose Dalisay', 'jose@example.com', '+63 917 888 2222', '45 Katipunan Ave., Loyola Heights, Quezon City'),
  ('o_3', NULL, 'Carla Gomez', 'carla.g@example.com', '+63 922 333 4444', '88 Rizal Ave., San Carlos, Makati City')
ON DUPLICATE KEY UPDATE name=VALUES(name);

-- 4. Pets
INSERT INTO pets (id, owner_id, name, species, breed, sex, birth, weight, color, neutered, allergies, vaccination_card_id, notes)
VALUES
  ('p_1', 'o_1', 'Bantay', 'Dog', 'Golden Retriever', 'Male', '2021-03-15', 24.50, 'Golden Blonde', 'Yes', '["Chicken"]', 'VACC-2026-1001', 'Friendly, calm during physical exams.'),
  ('p_2', 'o_1', 'Mingming', 'Cat', 'Domestic Shorthair', 'Female', '2022-07-20', 4.20, 'Calico', 'Yes', '[]', 'VACC-2026-1002', 'Prefers gentle handling; dislikes loud noises.'),
  ('p_3', 'o_2', 'Choco', 'Dog', 'Shih Tzu', 'Male', '2023-01-08', 6.10, 'Brown & White', 'No', '[]', 'VACC-2026-1003', 'Active and playful.')
ON DUPLICATE KEY UPDATE name=VALUES(name);

-- 5. Pet Weights
INSERT INTO pet_weights (id, pet_id, date, kg, recorded_by)
VALUES
  ('wt_1', 'p_1', '2023-03-15', 22.00, 'Front Desk'),
  ('wt_2', 'p_1', '2023-09-10', 23.80, 'Front Desk'),
  ('wt_3', 'p_1', '2024-03-15', 24.50, 'Front Desk'),
  ('wt_4', 'p_2', '2023-07-20', 3.80, 'Front Desk'),
  ('wt_5', 'p_2', '2024-01-15', 4.20, 'Front Desk'),
  ('wt_6', 'p_3', '2023-07-01', 5.50, 'Front Desk'),
  ('wt_7', 'p_3', '2024-01-10', 6.10, 'Front Desk')
ON DUPLICATE KEY UPDATE kg=VALUES(kg);

-- 6. Appointments
INSERT INTO appointments (id, pet_id, vet_id, date, time, reason, status, billing_status, amount, intake_vitals)
VALUES
  ('a_1', 'p_1', 'u_vet_1', CURDATE(), '09:00', 'Annual Booster & Routine Checkup', 'Checked-in', 'Unbilled', 850.00, '{"weight": 24.5, "weightStatus": "healthy", "temp": 38.4, "tempStatus": "normal", "heartRate": 95, "checkedInBy": "Liza Ramos"}'),
  ('a_2', 'p_2', 'u_vet_1', CURDATE(), '10:30', 'Skin Scratching / Allergy Consultation', 'Scheduled', 'Unbilled', 600.00, NULL),
  ('a_3', 'p_3', 'u_vet_1', CURDATE(), '14:00', 'Rabies Booster Shot', 'Pending Approval', 'Unbilled', 500.00, NULL)
ON DUPLICATE KEY UPDATE status=VALUES(status);

-- 7. Vaccinations
INSERT INTO vaccinations (id, pet_id, card_id, vaccine, brand, batch, date, next_due, dose_no, dose_of, done, automated, protocol_type, notes, vet_id, recorded_by)
VALUES
  ('v_1', 'p_1', 'VACC-2026-1001', 'Rabies (1-Year)', 'Defensor 3', 'DEF-9021', '2023-03-20', '2024-03-20', 1, 1, 1, 0, 'Core Rabies', 'No adverse reaction', 'u_vet_1', 'Dr. Ana Cruz'),
  ('v_2', 'p_1', 'VACC-2026-1001', 'DHPP (5-in-1)', 'Nobivac Puppy-DP', 'NOB-4412', '2023-04-10', '2024-04-10', 3, 3, 1, 0, 'Core Canine Protocol', 'Completed primary series', 'u_vet_1', 'Dr. Ana Cruz'),
  ('v_3', 'p_1', 'VACC-2026-1001', 'Bordetella (Kennel Cough)', 'Bronchicine CAe', 'BRN-1088', '2024-04-15', '2025-04-15', 1, 1, 0, 0, 'Elective Protocol', 'Scheduled for next month', '', 'Liza Ramos'),
  ('v_4', 'p_2', 'VACC-2026-1002', 'FVRCP (4-in-1)', 'Fel-O-Vax IV', 'FEL-5501', '2023-08-01', '2024-08-01', 2, 2, 1, 0, 'Core Feline Protocol', 'Tolerated well', 'u_vet_1', 'Dr. Ana Cruz')
ON DUPLICATE KEY UPDATE vaccine=VALUES(vaccine);

-- 8. Consultations
INSERT INTO consultations (id, pet_id, vet_id, appt_id, date, symptoms, objective, diagnosis, treatment, prescription)
VALUES
  ('c_1', 'p_1', 'u_vet_1', 'a_1', CURDATE(), 'Mild ear shaking and redness in left ear pinna.', 'Erythema and moderate ceruminous discharge in left ear canal. Tympanic membrane intact. T: 38.6C, HR: 100 bpm.', 'Otitis Externa (Unilateral)', 'Ear cleaning with Otic flush; applied Otomax suspension.', 'Otomax ear drops: 4 drops in left ear twice daily for 7 days.')
ON DUPLICATE KEY UPDATE diagnosis=VALUES(diagnosis);

-- 9. Clinic Catalog Items
INSERT INTO clinic_catalog_items (id, name, category, price, unit, description, active, built_in)
VALUES
  ('cat_consultation', 'Routine Veterinary Consultation', 'Consultation', 500.00, 'session', 'General physical examination and health check', 1, 1),
  ('cat_vacc_rabies', 'Rabies Vaccination (1-Year)', 'Vaccination', 350.00, 'dose', 'Inactivated rabies vaccine', 1, 1),
  ('cat_vacc_5in1', 'DHPP 5-in-1 Canine Vaccine', 'Vaccination', 600.00, 'dose', 'Core 5-in-1 vaccine for dogs', 1, 1),
  ('cat_deworming', 'Routine Deworming (Pyrantel/Praziquantel)', 'Preventive Care', 250.00, 'dose', 'Broad-spectrum internal parasite treatment', 1, 1),
  ('cat_grooming', 'Basic Pet Grooming & Bath', 'Grooming', 450.00, 'session', 'Bath, blow dry, nail trimming, ear cleaning', 1, 1)
ON DUPLICATE KEY UPDATE price=VALUES(price);

-- 10. Audit Logs
INSERT INTO audit_logs (id, user_name, user_role, action)
VALUES
  ('log_1', 'System Initializer', 'system', 'MySQL database initialized with full schema and seed records'),
  ('log_2', 'Admin Officer', 'admin', 'Configured default staff profiles and service price catalog'),
  ('log_3', 'Liza Ramos', 'assistant', 'Checked in patient Bantay for appointment a_1')
ON DUPLICATE KEY UPDATE action=VALUES(action);

