#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/backups}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
OUTPUT="${1:-$BACKUP_DIR/sigis_${TIMESTAMP}.dump}"
DOCUMENTS_OUTPUT="${OUTPUT}.documents.tar.gz"
mkdir -p "$(dirname -- "$OUTPUT")"

docker compose exec -T db sh -c 'pg_dump -Fc -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > "$OUTPUT"
test -s "$OUTPUT"
docker compose exec -T backend tar -czf - -C /var/lib/sigis/documents/private . > "$DOCUMENTS_OUTPUT"
test -s "$DOCUMENTS_OUTPUT"
echo "Sauvegarde de la base créée : $OUTPUT"
echo "Sauvegarde des diplômes créée : $DOCUMENTS_OUTPUT"
