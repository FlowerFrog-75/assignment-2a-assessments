#!/usr/bin/env bash
# Restore a backup made by backup.sh into the Docker MongoDB server.
# WARNING: this REPLACES the current contents of the app database.
#
#   ./mongodb/restore.sh mongodb/backups/dsw-20261031-023000.archive.gz
set -euo pipefail

file="${1:?Usage: $0 <backup.archive.gz>}"
[ -f "$file" ] || { echo "No such file: $file" >&2; exit 1; }
file="$(cd "$(dirname "$file")" && pwd)/$(basename "$file")"

read -r -p "Replace the current database with $(basename "$file")? [y/N] " answer
[[ "$answer" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 1; }

cd "$(dirname "$0")"
docker compose exec -T mongodb sh -c '
  mongorestore --quiet --archive --gzip --drop \
    --username "$MONGO_INITDB_ROOT_USERNAME" \
    --password "$MONGO_INITDB_ROOT_PASSWORD" \
    --authenticationDatabase admin \
    --nsInclude "$MONGO_APP_DB.*"
' < "$file"

echo "Restored $(basename "$file")"
