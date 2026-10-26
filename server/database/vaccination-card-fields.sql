-- Optional identifiers printed on the standard vaccination card.
ALTER TABLE pets ADD COLUMN IF NOT EXISTS microchip_number VARCHAR(50) NOT NULL DEFAULT '';
ALTER TABLE pets ADD COLUMN IF NOT EXISTS microchip_date DATE;
ALTER TABLE vaccinations ADD COLUMN IF NOT EXISTS manufacturer VARCHAR(100) NOT NULL DEFAULT '';
ALTER TABLE vaccinations ADD COLUMN IF NOT EXISTS serial_number VARCHAR(100) NOT NULL DEFAULT '';
INSERT INTO pawcare_schema_migrations(version) VALUES ('vaccination-card-fields-v1') ON CONFLICT DO NOTHING;
