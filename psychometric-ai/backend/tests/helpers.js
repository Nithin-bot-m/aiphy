// Shared test helper: isolated DB + ephemeral-port server per test file.
const fs = require('node:fs');
const path = require('node:path');

function freshTestDb() {
  // Deterministic, isolated DB per test PROCESS. node --test runs each test
  // file in its own process (potentially in parallel), so the DB path must be
  // pid-unique to avoid cross-file I/O conflicts, and must be assigned BEFORE
  // config/env is first required.
  const dbPath = path.resolve(process.cwd(), `data/test-${process.pid}.db`);
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.rmSync(dbPath + suffix, { force: true }); } catch { /* ignore */ }
  }
  process.env.DB_PATH = dbPath;
  return dbPath;
}

async function startTestServer() {
  const dbPath = freshTestDb();
  process.env.NODE_ENV = process.env.NODE_ENV || 'test';
  const { runMigrations } = require('../migrations/migrate');
  const { seedDatabase } = require('../seeds/runSeed');
  const { app } = require('../src/server');

  await runMigrations();
  await seedDatabase();

  const server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  const { port } = server.address();

  return {
    baseUrl: `http://localhost:${port}/api`,
    close: () => new Promise(resolve => {
      server.close(() => {
        // Remove the isolated DB so test runs leave no droppings in data/.
        for (const suffix of ['', '-wal', '-shm']) {
          try { fs.rmSync(dbPath + suffix, { force: true }); } catch { /* ignore */ }
        }
        resolve();
      });
    })
  };
}

async function api(baseUrl, method, apiPath, { token, body } = {}) {
  const res = await fetch(`${baseUrl}${apiPath}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  let json = null;
  try { json = await res.json(); } catch { /* empty body */ }
  // Unwrap the spec §23 envelope so tests keep asserting on the domain payload.
  // Error responses keep the full body ({success:false, error:{code,message}}).
  if (json && typeof json === 'object' && json.success === true && 'data' in json) {
    json = json.data;
  }
  return { status: res.status, json };
}

module.exports = { startTestServer, api, freshTestDb };
