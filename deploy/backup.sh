#!/usr/bin/env bash
# Nightly backup of everything needed to rebuild the server:
#   - the MongoDB database (mongodump archive)
#   - the Fabric certificates and keys (fabric/organizations)
#   - the Fabric ledger data (peer and orderer volumes)
#   - deploy/.env (contains APP_SECRET)
# Keeps the last 14 days. Copy the backup folder off the server too (e.g. rsync to another site).
#
#   ./deploy/backup.sh /srv/dsw-backups
#   cron: 30 2 * * * /opt/dsw/deploy/backup.sh /srv/dsw-backups >> /var/log/dsw-backup.log 2>&1
set -euo pipefail

repo="$(cd "$(dirname "$0")/.." && pwd)"
out="${1:-$repo/.backups}"
stamp="$(date +%Y%m%d-%H%M%S)"
dir="$out/$stamp"
mkdir -p "$dir"
umask 077

"$repo/mongodb/backup.sh" "$dir" >/dev/null
tar -czf "$dir/fabric-organizations.tar.gz" -C "$repo/fabric" organizations
[ -f "$repo/deploy/.env" ] && cp "$repo/deploy/.env" "$dir/deploy.env"

# Ledger volumes (a few seconds' snapshot; the ledger can also be rebuilt with `pnpm ledger:sync --resync`).
for volume in $(docker volume ls --format '{{.Name}}' | grep '^dsw-fabric_'); do
  docker run --rm -v "$volume:/data:ro" -v "$dir:/backup" alpine tar -czf "/backup/$volume.tar.gz" -C /data .
done

chmod -R go-rwx "$dir"
find "$out" -mindepth 1 -maxdepth 1 -type d -mtime +14 -exec rm -rf {} +
echo "Backup written to $dir ($(du -sh "$dir" | cut -f1))"
