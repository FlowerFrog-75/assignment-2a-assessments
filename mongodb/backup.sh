#!/usr/bin/env bash
# Dump the app database from the Docker MongoDB server to a gzipped archive.
#
#   ./mongodb/backup.sh               # writes mongodb/backups/dsw-<timestamp>.archive.gz
#   ./mongodb/backup.sh /srv/backups  # custom output folder
#
# Schedule it with cron on the server, e.g. daily at 02:30:
#   30 2 * * * /path/to/repo/mongodb/backup.sh /srv/backups >> /var/log/dsw-backup.log 2>&1
set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
out_dir="${1:-$script_dir/backups}"
mkdir -p "$out_dir"
out_dir="$(cd "$out_dir" && pwd)" # resolve relative paths against where you ran the script
file="$out_dir/dsw-$(date +%Y%m%d-%H%M%S).archive.gz"

cd "$script_dir" # docker compose finds docker-compose.yml and .env here

# The credentials are read from the container's environment, so they never
# appear in this script or the host's process list.
docker compose exec -T mongodb sh -c '
  mongodump --quiet --archive --gzip \
    --username "$MONGO_INITDB_ROOT_USERNAME" \
    --password "$MONGO_INITDB_ROOT_PASSWORD" \
    --authenticationDatabase admin \
    --db "$MONGO_APP_DB"
' > "$file"

echo "Backup written to $file ($(du -h "$file" | cut -f1))"
