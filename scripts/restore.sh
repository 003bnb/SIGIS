#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ $# -ne 1 || ! -f "$1" || ! -f "$1.documents.tar.gz" ]]; then
  echo "Usage : $0 chemin/vers/sauvegarde.dump (et son fichier .documents.tar.gz associé)" >&2
  exit 1
fi
BACKUP_FILE="$1"
DOCUMENTS_ARCHIVE="${BACKUP_FILE}.documents.tar.gz"
read -r -p "La restauration remplace les objets de la base SIGIS. Continuer ? [y/N] " confirmation
if [[ ! "$confirmation" =~ ^[Yy]$ ]]; then
  echo "Restauration annulée."
  exit 0
fi

docker compose exec -T backend sh -c 'tar -tzf - >/dev/null' < "$DOCUMENTS_ARCHIVE"
docker compose exec -T db sh -c 'pg_restore --clean --if-exists --no-owner --no-privileges -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < "$BACKUP_FILE"
docker compose exec -T backend sh -c 'tar -xzf - -C /var/lib/sigis/documents/private' < "$DOCUMENTS_ARCHIVE"
echo "Base et diplômes restaurés depuis : $BACKUP_FILE"
