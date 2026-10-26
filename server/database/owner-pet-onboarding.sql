-- A pending patient can request a visit before clinic registration review.
ALTER TABLE pets ADD COLUMN IF NOT EXISTS registration_status TEXT NOT NULL DEFAULT 'Verified'
 CHECK (registration_status IN ('Verified','Pending','Declined'));
ALTER TABLE owners ADD COLUMN IF NOT EXISTS first_pet_registered_at TIMESTAMPTZ;
ALTER TABLE pet_requests ADD COLUMN IF NOT EXISTS submission_payload JSONB;
-- Preserve existing approved identities. Give unreviewed legacy requests a stable patient identity.
UPDATE pet_requests SET pet_id='p_pending_' || md5(id) WHERE status<>'Approved' AND pet_id IS NULL;
INSERT INTO pets(id,owner_id,name,species,species_other,breed,sex,birth,weight,color,neutered,notes,photo,dental_occlusion,registration_status)
 SELECT r.pet_id,r.owner_id,r.name,r.species,r.species_other,COALESCE(r.breed,''),r.sex,r.birth,r.weight,r.color,r.neutered,r.notes,r.photo,r.dental_occlusion,r.status
 FROM pet_requests r WHERE r.status<>'Approved' AND r.pet_id IS NOT NULL
 ON CONFLICT (id) DO NOTHING;
UPDATE owners o SET first_pet_registered_at=COALESCE(
 (SELECT min(created_at) FROM pet_requests r WHERE r.owner_id=o.id),
 (SELECT min(created_at) FROM pets p WHERE p.owner_id=o.id))
 WHERE first_pet_registered_at IS NULL;
INSERT INTO pawcare_schema_migrations(version) VALUES ('owner-pet-onboarding-v1') ON CONFLICT DO NOTHING;
