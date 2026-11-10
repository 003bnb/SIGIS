#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/backups}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
OUTPUT="${1:-$BACKUP_DIR/sigis_${TIMESTAMP}.dump}"
mkdir -p "$(dirname -- "$OUTPUT")"

docker compose exec -T db sh -c 'pg_dump -Fc -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > "$OUTPUT"
test -s "$OUTPUT"
echo "Sauvegarde créée : $OUTPUT"
