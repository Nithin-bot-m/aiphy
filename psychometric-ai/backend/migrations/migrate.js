// Minimal forward-only SQL migration runner.
// Applies pending *.sql files from backend/migrations in lexicographic order,
// recording each in schema_migrations. Safe to run repeatedly.
const fs = require('fs');
const path = require('path');
const { db, transaction, DRIVER } = require('../src/config/db');

const MIGRATIONS_DIR = __dirname;

// Dialect-aware selection: PostgreSQL uses *.pg.sql, SQLite uses *.sql
// (excluding *.pg.sql). Each dialect records its own migration names, so both
// can coexist in the same repository without colliding in schema_migrations.
function selectDialectFiles(files) {
  if (DRIVER === 'postgres') return files.filter(f => f.endsWith('.pg.sql'));
  return files.filter(f => f.endsWith('.sql') && !f.endsWith('.pg.sql'));
}

async function ensureMigrationsTable() {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

async function appliedMigrations() {
  const rows = await db.prepare('SELECT name FROM schema_migrations').all();
  return new Set(rows.map(r => r.name));
}

async function runMigrations({ logger = console } = {}) {
  await ensureMigrationsTable();
  const done = await appliedMigrations();
  const files = selectDialectFiles(
    fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql'))
  ).sort();

  let applied = 0;
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    await transaction(async () => {
      await db.exec(sql);
      await db.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(file);
    });
    applied += 1;
    logger.log(`[migrate] applied ${file}`);
  }

  if (applied === 0) logger.log('[migrate] schema up to date');
  return applied;
}

module.exports = { runMigrations };

if (require.main === module) {
  runMigrations().then(() => process.exit(0)).catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
}
