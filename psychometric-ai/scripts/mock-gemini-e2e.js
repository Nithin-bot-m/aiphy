#!/usr/bin/env node
// mock-gemini-e2e.js — proves the LIVE LLM provider path end-to-end WITHOUT
// touching the real Gemini API (no quota spend, works in any region).
//
// What it does:
//   1. Boots a local mock of the Gemini generateContent endpoint (records every
//      request payload it receives, returns a structurally valid narrative).
//   2. Boots the REAL backend (SQLite, ephemeral port) with LLM_PROVIDER=gemini
//      and GEMINI_BASE_URL pointed at the mock.
//   3. Drives the full user journey: register → start → answer → complete →
//      fetch the candidate report.
//   4. Asserts: narrative came from the mock (unique marker), the llm audit row
//      says provider=gemini / status=success, token usage was recorded, and the
//      outbound payload contained no secrets or SQL.
//
//   node scripts/mock-gemini-e2e.js
//
// Exit code 0 = the live-provider pipeline is wired correctly.

const assert = require('node:assert');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..');
const MARKER = `MOCKLLM-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const NARRATIVE = `
<h3>Live Provider Verification</h3>
<p>This narrative was produced by the mock Gemini endpoint (marker ${MARKER}). It is long enough to pass the deterministic narrative validator and it contains no scores of its own.</p>
<h3>Second Section</h3>
<p>Additional paragraph content satisfies multi-section structural validation and proves the full request → provider → validation → storage pipeline works end to end.</p>`.trim();

let receivedPayloads = [];

function startMock(port) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        receivedPayloads.push({ url: req.url, apiKey: req.headers['x-goog-api-key'] || null, body });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          candidates: [{
            content: { parts: [{ text: NARRATIVE }], role: 'model' },
            finishReason: 'STOP'
          }],
          usageMetadata: { promptTokensCount: 1111, candidatesTokenCount: 222, totalTokenCount: 1333 }
        }));
      });
    });
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

async function main() {
  // ---- 1. mock provider ----
  const mock = await startMock(0);
  const { port: mockPort } = mock.address();
  console.log(`── mock Gemini endpoint: http://127.0.0.1:${mockPort}`);

  // ---- 2. real backend on isolated SQLite ----
  const dbPath = path.join(REPO, 'data', `e2e-llm-${process.pid}.db`);
  for (const s of ['', '-wal', '-shm']) { try { fs.rmSync(dbPath + s, { force: true }); } catch { /* best effort */ } }
  process.env.NODE_ENV = 'test';
  process.env.DB_PATH = dbPath;
  process.env.DB_DRIVER = 'sqlite';
  process.env.JWT_SECRET = 'e2e-harness-secret';
  process.env.LLM_PROVIDER = 'gemini';
  process.env.GEMINI_API_KEY = 'test-mock-key';
  process.env.GEMINI_BASE_URL = `http://127.0.0.1:${mockPort}`;
  process.env.LLM_MODEL = 'gemini-2.5-flash';
  process.env.SEED_DEMO_DATA = 'true';

  const { runMigrations } = require(path.join(REPO, 'backend/migrations/migrate'));
  const { seedDatabase } = require(path.join(REPO, 'backend/seeds/runSeed'));
  const { app } = require(path.join(REPO, 'backend/src/server'));
  await runMigrations();
  await seedDatabase();
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://localhost:${server.address().port}/api`;

  const api = async (p, { method = 'GET', token, body } = {}) => {
    const res = await fetch(`${base}${p}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined
    });
    let json = null;
    try { json = await res.json(); } catch { /* empty body */ }
    if (json && json.success === true && 'data' in json) json = json.data;
    return { status: res.status, json };
  };

  try {
    // ---- 3. user journey ----
    const email = `e2e-llm-${Date.now()}@test.io`;
    const reg = await api('/auth/register', { method: 'POST', body: { email, password: 'Test@12345', role: 'candidate', full_name: 'E2E LLM Student' } });
    assert.strictEqual(reg.status, 201, `register failed: ${JSON.stringify(reg.json).slice(0, 200)}`);
    const token = reg.json.token;

    const start = await api('/candidate/assessment/start', { method: 'POST', token });
    assert.strictEqual(start.status, 200, 'assessment start failed');
    const assessmentId = start.json.assessment.id;

    const q = await api(`/assessments/${assessmentId}`, { token });
    assert.strictEqual(q.status, 200, 'questions fetch failed');
    for (const question of q.json.questions) {
      const save = await api(`/assessments/${assessmentId}/responses`, {
        method: 'POST', token,
        body: { question_id: question.id, selected_option_id: question.options[0].id }
      });
      assert.ok(save.status === 200 || save.status === 201, `save response failed: ${save.status}`);
    }
    const done = await api(`/assessments/${assessmentId}/complete`, { method: 'POST', token });
    assert.strictEqual(done.status, 200, 'complete failed');

    const report = await api(`/reports/${assessmentId}/candidate`, { token });
    assert.strictEqual(report.status, 200, 'report fetch failed');
    console.log('── report payload top-level keys:', Object.keys(report.json).join(', '));
    console.log('── provider calls received by mock:', receivedPayloads.length);
    if (receivedPayloads.length > 0) console.log('── mock call URL:', receivedPayloads[0].url);

    // ---- 4. assertions ----
    const rep = report.json.report || report.json;
    const narrative = rep.narrative_html || rep.narrative || '';
    assert.ok(narrative.includes(MARKER), 'report narrative did NOT come from the provider — marker missing');

    assert.ok(receivedPayloads.length >= 1, 'provider received no calls (seed demo reports also call it)');
    const myCall = receivedPayloads[receivedPayloads.length - 1]; // this report is the last generation (after seed)
    assert.ok(myCall, 'no provider call found for this assessment report');
    assert.strictEqual(myCall.apiKey, 'test-mock-key', 'provider call did not carry the API key header');
    assert.ok(/\/v1beta\/models\/gemini-2\.5-flash:generateContent$/.test(myCall.url), 'unexpected provider URL: ' + myCall.url);
    for (const p of receivedPayloads) {
      assert.ok(!/test-mock-key|JWT_SECRET|password_hash|INSERT INTO|SELECT \*/.test(p.body), 'SECRETS/SQL leaked into provider payload');
    }

    const { db } = require(path.join(REPO, 'backend/src/config/db'));
    const rows = await db.prepare("SELECT r.id, r.provider, r.model_name, r.status, resp.status AS resp_status, resp.token_usage_json FROM llm_requests r JOIN llm_responses resp ON resp.request_id = r.id WHERE r.status = 'success'").all();
    const okRow = rows.find((r) => r.provider === 'gemini' && r.model_name === 'gemini-2.5-flash' && r.resp_status === 'success' && (r.token_usage_json || '').includes('1333'));
    assert.ok(okRow, 'no llm audit row with provider=gemini / status=success / token usage recorded');

    console.log('\n════════════════════════════════════════════');
    console.log('LLM LIVE-PATH E2E: ALL CHECKS PASSED');
    console.log('════════════════════════════════════════════');
    console.log('  provider call        : gemini (mock endpoint), model gemini-2.5-flash');
    console.log('  narrative marker     : found in stored report');
    console.log('  audit row            : provider=gemini status=success, tokens recorded');
    console.log('  payload boundaries   : no API key / DB secrets / SQL in outbound payload');
    process.exitCode = 0;
  } catch (err) {
    console.error('\nLLM LIVE-PATH E2E: FAILED');
    console.error(err.message);
    process.exitCode = 1;
  } finally {
    server.close();
    mock.close();
    for (const s of ['', '-wal', '-shm']) { try { fs.rmSync(dbPath + s, { force: true }); } catch { /* best effort */ } }
  }
}

main();
