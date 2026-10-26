-- Summary scopes and stable history keysets use IDs without OFFSET scans.
CREATE INDEX IF NOT EXISTS appointments_vet_history_idx ON appointments(vet_id,date DESC,id DESC);
CREATE INDEX IF NOT EXISTS appointments_pet_history_idx ON appointments(pet_id,date DESC,id DESC);
CREATE INDEX IF NOT EXISTS consultations_pet_history_idx ON consultations(pet_id,date DESC,id DESC);
CREATE INDEX IF NOT EXISTS vaccinations_pet_history_idx ON vaccinations(pet_id,date DESC,id DESC);
CREATE INDEX IF NOT EXISTS pet_weights_pet_latest_idx ON pet_weights(pet_id,date DESC,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS appointments_follow_up_state_idx ON appointments(follow_up_id,status);
CREATE INDEX IF NOT EXISTS appointments_date_history_idx ON appointments(date DESC,id DESC);
CREATE INDEX IF NOT EXISTS consultations_date_history_idx ON consultations(date DESC,id DESC);
CREATE INDEX IF NOT EXISTS vaccinations_date_history_idx ON vaccinations(date DESC,id DESC);
CREATE INDEX IF NOT EXISTS pet_weights_date_history_idx ON pet_weights(date DESC,id DESC);
