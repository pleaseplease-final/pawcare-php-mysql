CREATE TABLE IF NOT EXISTS clinical_note_options (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  revision INTEGER NOT NULL DEFAULT 0,
  options JSONB NOT NULL
);
INSERT INTO clinical_note_options (id, options) VALUES (TRUE, '{"diagnosis": ["Dermatitis", "Otitis externa", "Gastroenteritis", "Parasitic infection", "Dental disease", "Injury / wound", "No abnormal findings on examination"], "treatment": ["Discussed findings and home care with the owner.", "Wound cleaned and dressed.", "Diagnostic tests recommended; discuss results with the owner.", "Monitor appetite, activity and symptoms at home.", "Return for a recheck if symptoms persist or worsen."]}'::jsonb) ON CONFLICT (id) DO NOTHING;
