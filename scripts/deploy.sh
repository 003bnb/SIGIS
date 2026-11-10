#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f .env ]]; then
  echo "Fichier .env absent. Copiez .env.example en .env et définissez les secrets." >&2
  exit 1
fi

docker compose up --build -d
docker compose ps
printf '\nSIGIS est lancé : http://localhost:%s\n' "$(grep -E '^FRONTEND_PORT=' .env | cut -d= -f2- || echo 8080)"
