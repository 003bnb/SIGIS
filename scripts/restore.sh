#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ $# -ne 1 || ! -f "$1" ]]; then
  echo "Usage : $0 chemin/vers/sauvegarde.dump" >&2
  exit 1
fi
BACKUP_FILE="$1"
read -r -p "La restauration remplace les objets de la base SIGIS. Continuer ? [y/N] " confirmation
if [[ ! "$confirmation" =~ ^[Yy]$ ]]; then
  echo "Restauration annulée."
  exit 0
fi

docker compose exec -T db sh -c 'pg_restore --clean --if-exists --no-owner --no-privileges -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < "$BACKUP_FILE"
echo "Restauration terminée depuis : $BACKUP_FILE"
