// Integration tests: reports (types, access, versions, reproducibility) + parent consent flow.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { startTestServer, api } = require('../helpers');

let ctx;
let student;
let parent;
let admin;
let assessmentId;

before(async () => {
  ctx = await startTestServer();
  student = (await api(ctx.baseUrl, 'POST', '/auth/register', {
    body: { email: 'rpt-student@test.io', password: 'Test@12345', role: 'candidate', full_name: 'Report Student' }
  })).json;
  parent = (await api(ctx.baseUrl, 'POST', '/auth/register', {
    body: { email: 'rpt-parent@test.io', password: 'Test@12345', role: 'parent', full_name: 'Report Parent' }
  })).json;
  admin = await api(ctx.baseUrl, 'POST', '/auth/login', {
    body: { identifier: 'admin@demo.psychometric-ai.local', password: 'Demo@12345' }
  });

  const start = await api(ctx.baseUrl, 'POST', '/candidate/assessment/start', { token: student.token });
  assessmentId = start.json.assessment.id;
  const q = await api(ctx.baseUrl, 'GET', `/assessments/${assessmentId}`, { token: student.token });
  for (const question of q.json.questions) {
    await api(ctx.baseUrl, 'POST', `/assessments/${assessmentId}/responses`, {
      token: student.token, body: { question_id: question.id, selected_option_id: question.options[0].id }
    });
  }
  await api(ctx.baseUrl, 'POST', `/assessments/${assessmentId}/complete`, { token: student.token });
});

after(async () => { await ctx.close(); });

test('reports: candidate report retrievable with hash & prompt version', async () => {
  const r = await api(ctx.baseUrl, 'GET', `/reports/${assessmentId}/candidate`, { token: student.token });
  assert.strictEqual(r.status, 200);
  assert.ok(r.json.report.narrative_html.includes('<h3>'));
  assert.ok(/^[a-f0-9]{64}$/.test(r.json.report.structured_input_hash), 'sha256 input hash stored');
  assert.ok(r.json.report.model);
});

test('reports: candidate cannot access parent or counselor reports', async () => {
  const parentReport = await api(ctx.baseUrl, 'GET', `/reports/${assessmentId}/parent`, { token: student.token });
  const counselor = await api(ctx.baseUrl, 'GET', `/reports/${assessmentId}/counselor`, { token: student.token });
  assert.strictEqual(parentReport.status, 403);
  assert.strictEqual(counselor.status, 403);
});

test('reports: regeneration creates a report_versions row (versioned, not overwritten)', async () => {
  const beforeVersions = (await api(ctx.baseUrl, 'GET', `/report-versions/${assessmentId}`, { token: admin.json.token })).json.versions.length;
  const regen = await api(ctx.baseUrl, 'POST', `/reports/${assessmentId}/regenerate/candidate`, { token: admin.json.token });
  assert.strictEqual(regen.status, 200);
  const afterVersions = (await api(ctx.baseUrl, 'GET', `/report-versions/${assessmentId}`, { token: admin.json.token })).json.versions.length;
  assert.strictEqual(afterVersions, beforeVersions + 1);
});

test('parent: link request requires student approval; data access gated', async () => {
  const code = (await api(ctx.baseUrl, 'GET', '/candidate/code', { token: student.token })).json.student_code;
  const req = await api(ctx.baseUrl, 'POST', '/parent/link-request', { token: parent.token, body: { student_code: code } });
  assert.strictEqual(req.status, 202);

  // Blocked before approval
  const early = await api(ctx.baseUrl, 'GET', `/parent/child?assessment_id=${assessmentId}`, { token: parent.token });
  assert.strictEqual(early.status, 403);

  // Student sees and approves the pending request
  const pending = await api(ctx.baseUrl, 'GET', '/candidate/parent-requests', { token: student.token });
  assert.ok(pending.json.pending.length >= 1);
  const approve = await api(ctx.baseUrl, 'POST', `/candidate/parent-requests/${pending.json.pending[0].mapping_id}/approve`, { token: student.token });
  assert.strictEqual(approve.status, 200);

  // Now parent can view child dashboard
  const dash = await api(ctx.baseUrl, 'GET', `/parent/child?assessment_id=${assessmentId}`, { token: parent.token });
  assert.strictEqual(dash.status, 200);
  assert.strictEqual(dash.json.student.first_name, 'Report');
});

test('parent: inventory drives congruence; missing fields rejected (no defaults)', async () => {
  const missing = await api(ctx.baseUrl, 'POST', '/parent/inventory/submit', {
    token: parent.token,
    body: {
      assessment_id: assessmentId, expected_stream: 'pcm', outcome_priority: 'stability',
      perceptions: { observed_analytical: 4, observed_creative: 3, observed_study_habits: 4 }
    }
  });
  assert.strictEqual(missing.status, 400);

  const ok = await api(ctx.baseUrl, 'POST', '/parent/inventory/submit', {
    token: parent.token,
    body: {
      assessment_id: assessmentId, expected_stream: 'pcm', outcome_priority: 'stability',
      perceptions: { observed_analytical: 4, observed_creative: 3, observed_study_habits: 4, observed_stress_resilience: 4 }
    }
  });
  assert.strictEqual(ok.status, 200);
  assert.strictEqual(ok.json.congruence.has_parent_data, true);
  assert.ok(ok.json.congruence.congruence_pct >= 0 && ok.json.congruence.congruence_pct <= 100);

  // Congruence now visible to the student too
  const cong = await api(ctx.baseUrl, 'GET', `/results/${assessmentId}/congruence`, { token: student.token });
  assert.strictEqual(cong.status, 200);
  assert.strictEqual(cong.json.has_parent_data, true);
});

test('assessment versioning: questions belong to a pinned version', async () => {
  const adminQuestions = await api(ctx.baseUrl, 'GET', '/admin/questions?module=aptitude', { token: admin.json.token });
  assert.strictEqual(adminQuestions.status, 200);
  const versionIds = new Set(adminQuestions.json.questions.map(q => q.version_id));
  assert.strictEqual(versionIds.size, 1, 'single active version in a fresh DB');
});
