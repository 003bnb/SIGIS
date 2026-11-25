#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

MIGRATIONS=(
  "database/migrations/001_academic_validation.sql"
  "database/migrations/002_admission_workflow.sql"
  "database/migrations/003_audit_logs.sql"
  "database/migrations/004_business_rules.sql"
)

docker compose exec -T db sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
CREATE TABLE IF NOT EXISTS schema_migrations (
  filename VARCHAR(255) PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO schema_migrations (filename)
SELECT '001_academic_validation.sql'
WHERE EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_etudiants_niveau')
ON CONFLICT (filename) DO NOTHING;
INSERT INTO schema_migrations (filename)
SELECT '002_admission_workflow.sql'
WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='pieces_candidature')
ON CONFLICT (filename) DO NOTHING;
INSERT INTO schema_migrations (filename)
SELECT '003_audit_logs.sql'
WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='audit_logs')
ON CONFLICT (filename) DO NOTHING;
INSERT INTO schema_migrations (filename)
SELECT '004_business_rules.sql'
WHERE EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema='public' AND table_name='notes' AND column_name='verrouillee'
)
ON CONFLICT (filename) DO NOTHING;
SQL

for migration in "${MIGRATIONS[@]}"; do
  if [[ ! -f "$migration" ]]; then
    echo "Migration introuvable : $migration" >&2
    exit 1
  fi
  filename="$(basename "$migration")"
  already_applied=$(docker compose exec -T db sh -c "psql -v ON_ERROR_STOP=1 -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -Atc \"SELECT 1 FROM schema_migrations WHERE filename='$filename' LIMIT 1\"")
  if [[ "$already_applied" == "1" ]]; then
    echo "Déjà appliquée : $filename"
    continue
  fi
  echo "Application de $migration ..."
  docker compose exec -T db sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < "$migration"
  docker compose exec -T db sh -c "psql -v ON_ERROR_STOP=1 -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -c \"INSERT INTO schema_migrations(filename) VALUES ('$filename') ON CONFLICT (filename) DO NOTHING\""
done

echo "Migrations appliquées. Vérifiez les éventuelles données existantes non conformes en cas d'erreur."
