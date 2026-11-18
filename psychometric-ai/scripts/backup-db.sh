#!/usr/bin/env bash
# backup-db.sh — atomic database backup for both drivers.
#   SQLite: VACUUM INTO (atomic, online-safe snapshot)
#   PostgreSQL: pg_dump -Fc (custom format, restorable with pg_restore)
#
# Usage:
#   ./scripts/backup-db.sh                    # uses env (DB_DRIVER / DB_PATH / DATABASE_URL)
#   ./scripts/backup-db.sh /path/to/backup-dir
#
# Cron example (02:00 daily, keep 14):
#   0 2 * * * /opt/psychometric-ai/scripts/backup-db.sh /var/backups/psychometric >> /var/log/psychometric-backup.log 2>&1
set -euo pipefail

BACKUP_DIR="${1:-./backups}"
STAMP="$(date +%Y-%m-%d_%H%M%S)"
KEEP="${BACKUP_KEEP:-14}"
mkdir -p "$BACKUP_DIR"

DRIVER="${DB_DRIVER:-sqlite}"

if [ "$DRIVER" = "postgres" ]; then
  OUT="$BACKUP_DIR/psychometric-pg-$STAMP.dump"
  echo "[backup] postgres → $OUT"
  pg_dump "${DATABASE_URL:?DATABASE_URL required}" -Fc -f "$OUT"
else
  OUT="$BACKUP_DIR/psychometric-sqlite-$STAMP.db"
  echo "[backup] sqlite → $OUT"
  DB_PATH="${DB_PATH:-data/psychometric.db}"
  node - "$DB_PATH" "$OUT" <<'EOF'
const { DatabaseSync } = require('node:sqlite');
const [src, dst] = process.argv.slice(2);
const db = new DatabaseSync(src);
db.exec(`VACUUM INTO '${dst}'`);
db.close();
console.log(`[backup] written ${dst}`);
EOF
fi

# Rotate: keep the newest $KEEP files for this driver.
ls -1t "$BACKUP_DIR"/psychometric-* 2>/dev/null | tail -n "+$((KEEP + 1))" | while read -r old; do
  echo "[backup] pruning $old"
  rm -f "$old"
done

echo "[backup] done: $OUT"
