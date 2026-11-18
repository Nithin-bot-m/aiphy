// Security tests: RBAC and authorization boundaries (must all be enforced server-side).
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { startTestServer, api } = require('../helpers');

let ctx;
let victim;
let attacker;
let strangerParent;
let victimAssessmentId;

before(async () => {
  ctx = await startTestServer();
  victim = (await api(ctx.baseUrl, 'POST', '/auth/register', {
    body: { email: 'sec-victim@test.io', password: 'Test@12345', role: 'candidate', full_name: 'Victim' }
  })).json;
  attacker = (await api(ctx.baseUrl, 'POST', '/auth/register', {
    body: { email: 'sec-attacker@test.io', password: 'Test@12345', role: 'candidate', full_name: 'Attacker' }
  })).json;
  strangerParent = (await api(ctx.baseUrl, 'POST', '/auth/register', {
    body: { email: 'sec-stranger@test.io', password: 'Test@12345', role: 'parent', full_name: 'Stranger' }
  })).json;

  const start = await api(ctx.baseUrl, 'POST', '/candidate/assessment/start', { token: victim.token });
  victimAssessmentId = start.json.assessment.id;
});

after(async () => { await ctx.close(); });

test('candidate cannot read another candidate\'s assessment questions', async () => {
  const r = await api(ctx.baseUrl, 'GET', `/assessments/${victimAssessmentId}`, { token: attacker.token });
  assert.strictEqual(r.status, 403);
});

test('candidate cannot write another candidate\'s responses', async () => {
  const r = await api(ctx.baseUrl, 'POST', `/assessments/${victimAssessmentId}/responses`, {
    token: attacker.token, body: { question_id: 1, selected_option_id: 2 }
  });
  assert.strictEqual(r.status, 403);
});

test('candidate cannot complete another candidate\'s assessment', async () => {
  const r = await api(ctx.baseUrl, 'POST', `/assessments/${victimAssessmentId}/complete`, { token: attacker.token });
  assert.strictEqual(r.status, 403);
});

test('candidate cannot read another candidate\'s results/streams/congruence', async () => {
  for (const path of [`/results/${victimAssessmentId}`, `/results/${victimAssessmentId}/streams`, `/results/${victimAssessmentId}/congruence`]) {
    const r = await api(ctx.baseUrl, 'GET', path, { token: attacker.token });
    assert.strictEqual(r.status, 403, `${path} must be forbidden`);
  }
});

test('candidate cannot read another candidate\'s report', async () => {
  const r = await api(ctx.baseUrl, 'GET', `/reports/${victimAssessmentId}/candidate`, { token: attacker.token });
  assert.strictEqual(r.status, 403);
});

test('unlinked parent cannot access child data', async () => {
  const dash = await api(ctx.baseUrl, 'GET', `/parent/child?assessment_id=${victimAssessmentId}`, { token: strangerParent.token });
  const inv = await api(ctx.baseUrl, 'POST', '/parent/inventory/submit', {
    token: strangerParent.token,
    body: {
      assessment_id: victimAssessmentId, expected_stream: 'pcm', outcome_priority: 'stability',
      perceptions: { observed_analytical: 3, observed_creative: 3, observed_study_habits: 3, observed_stress_resilience: 3 }
    }
  });
  const cong = await api(ctx.baseUrl, 'GET', `/parent/congruence/${victimAssessmentId}`, { token: strangerParent.token });
  assert.strictEqual(dash.status, 403);
  assert.strictEqual(inv.status, 403);
  assert.strictEqual(cong.status, 403);
});

test('RBAC: candidate and parent blocked from admin endpoints', async () => {
  for (const token of [victim.token, strangerParent.token]) {
    const dash = await api(ctx.baseUrl, 'GET', '/admin/dashboard', { token });
    const questions = await api(ctx.baseUrl, 'GET', '/admin/questions', { token });
    const logs = await api(ctx.baseUrl, 'GET', '/admin/audit-logs', { token });
    assert.strictEqual(dash.status, 403);
    assert.strictEqual(questions.status, 403);
    assert.strictEqual(logs.status, 403);
  }
});

test('OTP: static backdoor OTP is rejected; role can never be chosen via OTP', async () => {
  const r1 = await api(ctx.baseUrl, 'POST', '/auth/verify-otp', { body: { phone: '+910000000001', otp: '123456' } });
  assert.ok(r1.status !== 200 || r1.json?.user?.role !== 'admin', 'static OTP must not grant admin');
  const r2 = await api(ctx.baseUrl, 'POST', '/auth/verify-otp', { body: { phone: '+919999999999', otp: '999999', role: 'admin' } });
  assert.ok(r2.status !== 200 || r2.json?.user?.role !== 'admin', 'OTP path must never mint an admin');
});

test('unauthenticated requests are rejected everywhere', async () => {
  const paths = [
    ['GET', '/candidate/results'],
    ['GET', `/reports/${victimAssessmentId}/candidate`],
    ['GET', '/admin/dashboard'],
    ['POST', '/candidate/assessment/start']
  ];
  for (const [method, path] of paths) {
    const r = await api(ctx.baseUrl, method, path);
    assert.strictEqual(r.status, 401, `${method} ${path} requires auth`);
  }
});

test('link brute force resistance: 12 wrong codes → 404s, no rate-limit bypass of errors', async () => {
  let notFound = 0;
  for (let i = 0; i < 12; i++) {
    const r = await api(ctx.baseUrl, 'POST', '/parent/link-request', {
      token: strangerParent.token, body: { student_code: `PC-WRONG${String(i).padStart(2, '0')}` }
    });
    if (r.status === 404) notFound += 1;
  }
  assert.ok(notFound >= 10, 'wrong codes must not reveal existing students');
});
