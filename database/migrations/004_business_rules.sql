BEGIN;

ALTER TABLE notes
  ADD COLUMN IF NOT EXISTS verrouillee BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS verrouillee_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verrouillee_par BIGINT REFERENCES utilisateurs(id) ON DELETE SET NULL;

UPDATE notes
SET verrouillee = TRUE,
    verrouillee_at = COALESCE(verrouillee_at, created_at, NOW())
WHERE verrouillee = FALSE;

ALTER TABLE notes DROP CONSTRAINT IF EXISTS notes_type_evaluation_check;
ALTER TABLE notes
  ADD CONSTRAINT notes_type_evaluation_check
  CHECK (type_evaluation IN ('CC', 'EXAM', 'RATTRAPAGE'));

CREATE TABLE IF NOT EXISTS schema_migrations (
  filename VARCHAR(255) PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO schema_migrations (filename) VALUES
  ('001_academic_validation.sql'),
  ('002_admission_workflow.sql'),
  ('003_audit_logs.sql'),
  ('004_business_rules.sql')
ON CONFLICT (filename) DO NOTHING;

COMMIT;
