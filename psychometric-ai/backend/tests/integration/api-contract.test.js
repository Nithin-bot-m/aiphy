// API contract tests (spec §23): every response uses the single envelope,
// error bodies never expose internals, 404s are shaped, content-type is JSON.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { startTestServer, api } = require('../helpers');

let ctx;
let student;

before(async () => {
  ctx = await startTestServer();
  student = (await api(ctx.baseUrl, 'POST', '/auth/register', {
    body: { email: `contract-${Date.now()}@test.io`, password: 'Test@12345', role: 'candidate', full_name: 'Contract Student' }
  })).json;
});

after(async () => { await ctx.close(); });

test('2xx responses use { success:true, data } envelope', async () => {
  const res = await fetch(`${ctx.baseUrl}/candidate/profile`, {
    headers: { Authorization: `Bearer ${student.token}` }
  });
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.success, true);
  assert.ok('data' in body, 'envelope carries data field');
  assert.ok(body.data.student, 'domain payload preserved under data');
});

test('4xx responses use { success:false, error:{code,message} } envelope', async () => {
  const res = await fetch(`${ctx.baseUrl}/candidate/profile`); // no token
  assert.strictEqual(res.status, 401);
  const body = await res.json();
  assert.strictEqual(body.success, false);
  assert.ok(body.error);
  assert.strictEqual(typeof body.error.code, 'string');
  assert.strictEqual(typeof body.error.message, 'string');
  assert.strictEqual(body.error.code, 'UNAUTHORIZED');
});

test('unknown API path → 404 with shaped envelope', async () => {
  const res = await fetch(`${ctx.baseUrl}/definitely-not-an-endpoint`);
  assert.strictEqual(res.status, 404);
  const body = await res.json();
  assert.strictEqual(body.success, false);
  assert.strictEqual(body.error.code, 'NOT_FOUND');
  assert.strictEqual(body.error.message, 'Endpoint not found.');
});

test('malformed JSON body → 400, no stack trace or internals leaked', async () => {
  const res = await fetch(`${ctx.baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{"identifier": "x@y.z", broken'
  });
  assert.strictEqual(res.status, 400);
  const text = await res.text();
  assert.ok(!text.includes('at '), 'no stack frames in body');
  assert.ok(!text.includes('node_modules'), 'no internals in body');
  const body = JSON.parse(text);
  assert.strictEqual(body.success, false);
});

test('error responses never leak stack traces, SQL, or env values', async () => {
  const probes = [
    ['GET', '/results/999999'],
    ['POST', '/auth/login'],
    ['GET', '/admin/dashboard']
  ];
  for (const [method, path] of probes) {
    const res = await fetch(`${ctx.baseUrl}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer invalid.token.here' },
      body: method === 'POST' ? '{}' : undefined
    });
    const text = await res.text();
    for (const forbidden of ['stack', 'Error:', 'sqlite', 'SELECT ', 'JWT_SECRET', 'node:internal']) {
      assert.ok(!text.includes(forbidden), `${method} ${path} leaks "${forbidden}": ${text.slice(0, 200)}`);
    }
  }
});

test('health endpoint also uses the envelope', async () => {
  const res = await fetch(`${ctx.baseUrl}/health`);
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.success, true);
  assert.strictEqual(body.data.status, 'healthy');
});
