#!/usr/bin/env bash
# restore-db.sh — restore a backup created by backup-db.sh.
#   SQLite:     ./scripts/restore-db.sh backups/psychometric-sqlite-*.db
#   PostgreSQL: ./scripts/restore-db.sh backups/psychometric-pg-*.dump  (uses $DATABASE_URL)
set -euo pipefail

FILE="${1:?usage: restore-db.sh <backup-file>}"
[ -f "$FILE" ] || { echo "backup not found: $FILE"; exit 1; }

DRIVER="${DB_DRIVER:-sqlite}"

if [[ "$FILE" == *.dump ]]; then
  echo "[restore] postgres ← $FILE (this REPLACES the database at DATABASE_URL)"
  read -r -p "Type REPLACE to continue: " confirm
  [ "$confirm" = "REPLACE" ] || { echo "aborted"; exit 1; }
  pg_restore --clean --if-exists --dbname "${DATABASE_URL:?DATABASE_URL required}" "$FILE"
else
  echo "[restore] sqlite ← $FILE (this REPLACES the database at DB_PATH)"
  read -r -p "Type REPLACE to continue: " confirm
  [ "$confirm" = "REPLACE" ] || { echo "aborted"; exit 1; }
  DB_PATH="${DB_PATH:-data/psychometric.db}"
  node - "$FILE" "$DB_PATH" <<'EOF'
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const [src, dst] = process.argv.slice(2);
for (const suffix of ['', '-wal', '-shm']) { try { fs.rmSync(dst + suffix, { force: true }); } catch {} }
const db = new DatabaseSync(src);
db.exec(`VACUUM INTO '${dst}'`);
db.close();
console.log(`[restore] written ${dst}`);
EOF
fi
echo "[restore] done"
