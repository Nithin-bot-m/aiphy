#!/usr/bin/env node
// run-pg-verify.js — boots a REAL PostgreSQL server (embedded binaries, no root
// needed) and runs the full live verification suites against the backend in
// DB_DRIVER=postgres mode. Every suite gets a fresh database (migrations +
// demo seed run from zero), proving the PostgreSQL path end-to-end.
//
//   node scripts/run-pg-verify.js                # runs all suites
//   node scripts/run-pg-verify.js live-a         # a single suite
//
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const PG_PORT = 5433;
const PG_USER = 'postgres';
const PG_PASS = 'pgverify';
const DATA_DIR = path.join(REPO, 'data', `pg-harness-${process.pid}`);

const SUITES = ['final-verify-live-a.js', 'final-verify-live-b.js'];

async function main() {
  const only = process.argv[2];
  const suites = only ? SUITES.filter(s => s.includes(only)) : SUITES;
  if (suites.length === 0) {
    console.error(`Unknown suite "${only}". Available: ${SUITES.join(', ')}`);
    process.exit(2);
  }

  const EmbeddedPostgres = require('embedded-postgres').default;
  const pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: PG_USER,
    password: PG_PASS,
    port: PG_PORT,
    persistent: false,
  });

  console.log('── Booting embedded PostgreSQL …');
  await pg.initialise();
  await pg.start();

  let failed = false;
  try {
    for (const suite of suites) {
      const dbName = `verify_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
      await pg.createDatabase(dbName);
      const url = `postgres://${PG_USER}:${PG_PASS}@127.0.0.1:${PG_PORT}/${dbName}`;
      console.log(`\n═══ ${suite} → postgres/${dbName} ═══`);

      const code = await new Promise((resolve) => {
        const child = spawn(process.execPath, [path.join(REPO, 'scripts', suite)], {
          cwd: REPO,
          stdio: 'inherit',
          env: {
            ...process.env,
            DB_DRIVER: 'postgres',
            DATABASE_URL: url,
            NODE_ENV: 'test',
            SEED_DEMO_DATA: 'true',
          },
        });
        child.on('exit', resolve);
      });
      if (code !== 0) failed = true;
    }
  } finally {
    console.log('\n── Stopping embedded PostgreSQL …');
    try { await pg.stop(); } catch { /* already down */ }
    fs.rmSync(DATA_DIR, { recursive: true, force: true });
  }

  console.log(failed ? '\nPG VERIFY: FAIL' : '\nPG VERIFY: ALL SUITES PASSED');
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error('PG harness failed:', err);
  try { fs.rmSync(DATA_DIR, { recursive: true, force: true }); } catch { /* ignore */ }
  process.exit(1);
});
