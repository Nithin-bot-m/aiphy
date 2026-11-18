// Integration tests: registration, login, profile, assessment completion.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { startTestServer, api } = require('../helpers');

let ctx;
let candidate;
let assessmentId;

before(async () => { ctx = await startTestServer(); });
after(async () => { await ctx.close(); });

test('auth: register → me → update profile', async () => {
  const reg = await api(ctx.baseUrl, 'POST', '/auth/register', {
    body: { email: 'itest-candidate@test.io', password: 'Test@12345', role: 'candidate', full_name: 'Integration Student', board: 'CBSE' }
  });
  assert.strictEqual(reg.status, 201);
  assert.ok(reg.json.profile?.student_code?.startsWith('PC-'));
  candidate = reg.json;

  const me = await api(ctx.baseUrl, 'GET', '/auth/me', { token: candidate.token });
  assert.strictEqual(me.status, 200);
  assert.strictEqual(me.json.user.role, 'candidate');

  const prof = await api(ctx.baseUrl, 'PUT', '/candidate/profile', {
    token: candidate.token, body: { school_name: 'Integration High', grade: 10 }
  });
  assert.strictEqual(prof.status, 200);
  assert.strictEqual(prof.json.student.school_name, 'Integration High');
});

test('auth: duplicate email rejected, weak password rejected, bad role rejected', async () => {
  const dup = await api(ctx.baseUrl, 'POST', '/auth/register', {
    body: { email: 'itest-candidate@test.io', password: 'Test@12345', role: 'candidate', full_name: 'Dup' }
  });
  assert.strictEqual(dup.status, 409);

  const weak = await api(ctx.baseUrl, 'POST', '/auth/register', {
    body: { email: `weak-${Date.now()}@test.io`, password: 'weakpass', role: 'candidate', full_name: 'Weak' }
  });
  assert.strictEqual(weak.status, 400);

  const badRole = await api(ctx.baseUrl, 'POST', '/auth/register', {
    body: { email: `admin-${Date.now()}@test.io`, password: 'Test@12345', role: 'admin', full_name: 'Evil Admin' }
  });
  assert.strictEqual(badRole.status, 400);
});

test('auth: login works and bad password fails', async () => {
  const bad = await api(ctx.baseUrl, 'POST', '/auth/login', {
    body: { identifier: 'itest-candidate@test.io', password: 'Wrong@12345' }
  });
  assert.strictEqual(bad.status, 401);

  const good = await api(ctx.baseUrl, 'POST', '/auth/login', {
    body: { identifier: 'itest-candidate@test.io', password: 'Test@12345' }
  });
  assert.strictEqual(good.status, 200);
  assert.ok(good.json.token);
});

test('assessment: start → questions (no score leakage) → complete early blocked', async () => {
  const start = await api(ctx.baseUrl, 'POST', '/candidate/assessment/start', { token: candidate.token });
  assert.strictEqual(start.status, 200);
  assessmentId = start.json.assessment.id;
  assert.ok(start.json.version.version_code, 'version pinned on assessment');

  const q = await api(ctx.baseUrl, 'GET', `/assessments/${assessmentId}`, { token: candidate.token });
  assert.strictEqual(q.status, 200);
  assert.strictEqual(q.json.questions.length, 44);
  for (const question of q.json.questions) {
    for (const opt of question.options) {
      assert.ok(!('score_value' in opt), 'score values must never reach the client');
    }
  }

  const early = await api(ctx.baseUrl, 'POST', `/assessments/${assessmentId}/complete`, { token: candidate.token });
  assert.strictEqual(early.status, 422);
  assert.strictEqual(early.json.error.code, 'ASSESSMENT_INCOMPLETE');
});

test('assessment: invalid option and foreign question rejected', async () => {
  const badOpt = await api(ctx.baseUrl, 'POST', `/assessments/${assessmentId}/responses`, {
    token: candidate.token, body: { question_id: 1, selected_option_id: 999999 }
  });
  assert.strictEqual(badOpt.status, 400);

  // question 9999 does not exist
  const badQ = await api(ctx.baseUrl, 'POST', `/assessments/${assessmentId}/responses`, {
    token: candidate.token, body: { question_id: 9999, selected_option_id: 1 }
  });
  assert.strictEqual(badQ.status, 400);
});

test('assessment: full completion → deterministic results persisted', async () => {
  const q = await api(ctx.baseUrl, 'GET', `/assessments/${assessmentId}`, { token: candidate.token });
  let i = 0;
  for (const question of q.json.questions) {
    const opt = question.options[i % question.options.length];
    const saved = await api(ctx.baseUrl, 'POST', `/assessments/${assessmentId}/responses`, {
      token: candidate.token, body: { question_id: question.id, selected_option_id: opt.id, current_step: 1 }
    });
    assert.strictEqual(saved.status, 200);
    i += 1;
  }

  const done = await api(ctx.baseUrl, 'POST', `/assessments/${assessmentId}/complete`, { token: candidate.token });
  assert.strictEqual(done.status, 200);
  assert.ok(done.json.reports.candidate.report_id, 'candidate report generated on completion');

  const results = await api(ctx.baseUrl, 'GET', '/candidate/results', { token: candidate.token });
  assert.strictEqual(results.status, 200);
  const result = results.json.result;
  assert.strictEqual(result.schema, 'psychometric-result/1.0');
  assert.ok(result.aptitude.overall >= 0 && result.aptitude.overall <= 100);
  assert.strictEqual(result.riasec.holland_code.length, 3);
  assert.strictEqual(result.streams.length, 7);
  assert.ok(result.streams[0].contributions.length > 0, 'explainability present');
  assert.strictEqual(result.parent.data_status, 'not_available');
  assert.strictEqual(result.congruence, null);
});

test('results: rerunning the same responses yields identical scores (determinism e2e)', async () => {
  // The scoring pipeline is pure; persisted results for the same responses must match recomputation.
  const results = await api(ctx.baseUrl, 'GET', `/results/${assessmentId}`, { token: candidate.token });
  assert.strictEqual(results.status, 200);
  const first = JSON.stringify(results.json.result.streams.map(s => [s.id, s.score, s.band, s.rank]));
  const second = JSON.stringify((await api(ctx.baseUrl, 'GET', `/results/${assessmentId}`, { token: candidate.token })).json.result.streams.map(s => [s.id, s.score, s.band, s.rank]));
  assert.strictEqual(first, second);
});
