-- Prices and items managed by the administrator. Built-in items get a row only
-- when changed; new items live here alone. Invoice names never change, so saved
-- visits keep matching their charges.
CREATE TABLE IF NOT EXISTS pawcare_schema_migrations (version TEXT PRIMARY KEY,applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS clinic_catalog_items (
  id VARCHAR(80) PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  category VARCHAR(60) NOT NULL,
  price NUMERIC(12,2) NOT NULL CHECK (price > 0 AND price <= 1000000),
  unit VARCHAR(40) NOT NULL DEFAULT 'item / package',
  description VARCHAR(200) NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  built_in BOOLEAN NOT NULL DEFAULT FALSE,
  previous_prices NUMERIC(12,2)[] NOT NULL DEFAULT '{}',
  revision INTEGER NOT NULL DEFAULT 0,
  updated_by VARCHAR(120) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS clinic_catalog_items_name_idx ON clinic_catalog_items (LOWER(name));
INSERT INTO pawcare_schema_migrations(version) VALUES ('clinic-catalog-v1') ON CONFLICT DO NOTHING;
