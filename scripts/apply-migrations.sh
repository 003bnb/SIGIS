#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

MIGRATIONS=(
  "database/migrations/001_academic_validation.sql"
  "database/migrations/002_admission_workflow.sql"
  "database/migrations/003_audit_logs.sql"
)

for migration in "${MIGRATIONS[@]}"; do
  if [[ ! -f "$migration" ]]; then
    echo "Migration introuvable : $migration" >&2
    exit 1
  fi
  echo "Application de $migration ..."
  docker compose exec -T db sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < "$migration"
done

echo "Migrations appliquées. Vérifiez les éventuelles données existantes non conformes en cas d'erreur."
