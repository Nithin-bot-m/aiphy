// Integration & security tests for V2 Assessments, Parent Module 8 dual-parent isolation,
// consent-gating of sensitive reflections, Counsellor Map RBAC, and Fairness Audit.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer, api } = require('../helpers');

let ctx;
let admin;
let student;
let parent1;
let parent2;
let assessmentId;

let likertSeq = 0;

function answerPayloadForV2Item(item, { gradeAnswerKey = '2', stressText = null } = {}) {
  if (item.field_name === 'grade') return { answer_key: gradeAnswerKey };
  if (item.field_name === 'learning_support') {
    const extOpt = (item.options || []).find((o) => /dyslexia|adhd|extra time|slow writer|yes/i.test(o.text) && !/^none|no/i.test(o.text));
    return { answer_key: extOpt ? String(extOpt.k) : String(item.options[0].k) };
  }
  switch (item.item_type) {
    case 'likert5': {
      const varied = ((likertSeq++) % 4) + 2; // rotates 2,3,4,5 so valid runs never straight-line
      const val = item.sub === 'INFREQ' ? 2 : (item.sub === 'ANXIETY' || item.sub === 'TEST_ANX') ? 5 : varied;
      return { numeric_value: val, answer_key: String(val), response_time_ms: 4200 };
    }
    case 'single_select':
    case 'mcq':
    case 'forced_choice':
    case 'scenario':
    case 'sjt':
      return { answer_key: String(item.options[0].k), response_time_ms: 6000 };
    case 'best_worst':
      return {
        response_json: { most: String(item.options[0].k), least: String(item.options[item.options.length - 1].k) },
        response_time_ms: 5000
      };
    case 'ranking':
      return {
        response_json: item.options.map((o) => String(o.k)),
        response_time_ms: 5000
      };
    case 'multi_select':
      return {
        response_json: [String(item.options[0].k)],
        response_time_ms: 4000
      };
    case 'open_text':
      return {
        response_text: stressText && (item.module === 1 || item.module === 2)
          ? stressText
          : 'I enjoy solving programming challenges, experimenting with sensors, and helping classmates.',
        response_time_ms: 15000
      };
    default:
      return { answer_key: String(item.options?.[0]?.k || '1') };
  }
}

before(async () => {
  ctx = await startTestServer();
  admin = (await api(ctx.baseUrl, 'POST', '/auth/login', {
    body: { identifier: process.env.ADMIN_EMAIL || 'admin@demo.psychometric-ai.local', password: process.env.ADMIN_PASSWORD || 'Demo@12345' }
  })).json;

  student = (await api(ctx.baseUrl, 'POST', '/auth/register', {
    body: { email: 'v2-student@test.io', password: 'Password@123', role: 'candidate', full_name: 'Riya V2', grade: 10, board: 'CBSE' }
  })).json;

  parent1 = (await api(ctx.baseUrl, 'POST', '/auth/register', {
    body: { email: 'v2-parent1@test.io', password: 'Password@123', role: 'parent', full_name: 'Mother V2' }
  })).json;

  parent2 = (await api(ctx.baseUrl, 'POST', '/auth/register', {
    body: { email: 'v2-parent2@test.io', password: 'Password@123', role: 'parent', full_name: 'Father V2' }
  })).json;

  // Link both parents with student consent
  const codeRes = await api(ctx.baseUrl, 'GET', '/candidate/code', { token: student.token });
  const scode = codeRes.json.student_code;
  await api(ctx.baseUrl, 'POST', '/parent/link-request', { token: parent1.token, body: { student_code: scode } });
  await api(ctx.baseUrl, 'POST', '/parent/link-request', { token: parent2.token, body: { student_code: scode } });

  const reqs = await api(ctx.baseUrl, 'GET', '/candidate/parent-requests', { token: student.token });
  for (const r of reqs.json.pending) {
    await api(ctx.baseUrl, 'POST', `/candidate/parent-requests/${r.mapping_id}/approve`, { token: student.token });
  }
});

after(async () => { await ctx.close(); });

test('V2 lifecycle: inactive by default, admin toggle RBAC, and Grade 12 completion', async () => {
  const statusBefore = await api(ctx.baseUrl, 'GET', '/v2/status', { token: student.token });
  assert.equal(statusBefore.status, 200);
  assert.equal(statusBefore.json.v2_active, false);

  // Starting V2 while inactive must fail cleanly with 409
  const blockedStart = await api(ctx.baseUrl, 'POST', '/v2/assessments/start', { token: student.token });
  assert.equal(blockedStart.status, 409);

  // Admin dashboard lists V2 with 3450 question count and inactive status
  const dash = (await api(ctx.baseUrl, 'GET', '/admin/dashboard', { token: admin.token })).json;
  const v2Ver = dash.assessment_versions.find((v) => v.version_code === 'V2');
  assert.ok(v2Ver);
  assert.equal(Boolean(v2Ver.is_active), false);
  assert.equal(Number(v2Ver.question_count), 3450);

  // Student and parent cannot toggle version activation
  assert.equal((await api(ctx.baseUrl, 'POST', `/admin/versions/${v2Ver.id}/toggle`, { token: student.token })).status, 403);
  assert.equal((await api(ctx.baseUrl, 'POST', `/admin/versions/${v2Ver.id}/toggle`, { token: parent1.token })).status, 403);

  // Admin activates V2
  const act = await api(ctx.baseUrl, 'POST', `/admin/versions/${v2Ver.id}/toggle`, {
    token: admin.token,
    body: { is_active: true }
  });
  assert.equal(act.status, 200);
  assert.equal(Boolean(act.json.version.is_active), true);
  assert.equal((await api(ctx.baseUrl, 'GET', '/v2/status', { token: student.token })).json.v2_active, true);

  const start = await api(ctx.baseUrl, 'POST', '/v2/assessments/start', { token: student.token });
  assert.equal(start.status, 200);
  assessmentId = start.json.assessment_id;
  assert.equal(start.json.version_code, 'V2');

  let bp = (await api(ctx.baseUrl, 'GET', `/v2/assessments/${assessmentId}`, { token: student.token })).json;
  assert.equal(bp.grade, 10);
  assert.ok(bp.questions.length >= 90);
  assert.equal(bp.questions[0].answer_key, undefined);

  // Switch grade to 12 via M1-001
  const gradeItem = bp.questions.find((q) => q.field_name === 'grade');
  assert.ok(gradeItem);
  const gSave = await api(ctx.baseUrl, 'POST', `/v2/assessments/${assessmentId}/responses`, {
    token: student.token,
    body: { item_id: gradeItem.id, answer_key: '2', response_time_ms: 4000, current_step: 1 }
  });
  assert.equal(gSave.status, 200);
  assert.equal(gSave.json.blueprint_updated, true);
  assert.equal(gSave.json.grade, 12);

  // Reload Grade 12 adapted blueprint
  bp = (await api(ctx.baseUrl, 'GET', `/v2/assessments/${assessmentId}`, { token: student.token })).json;
  assert.equal(bp.grade, 12);

  // Answer learning support to verify +25% accommodation flag
  const lsItem = bp.questions.find((q) => q.field_name === 'learning_support');
  if (lsItem) {
    const lsSave = await api(ctx.baseUrl, 'POST', `/v2/assessments/${assessmentId}/responses`, {
      token: student.token,
      body: { item_id: lsItem.id, ...answerPayloadForV2Item(lsItem), current_step: 2 }
    });
    assert.equal(lsSave.status, 200);
    assert.equal(lsSave.json.accommodations.extended_time_pct, 25);
  }

  // Answer all remaining items
  for (let i = 0; i < bp.questions.length; i++) {
    const q = bp.questions[i];
    if (q.field_name === 'grade' || q.field_name === 'learning_support') continue;
    const body = {
      item_id: q.id,
      ...answerPayloadForV2Item(q, { stressText: 'Exams make me feel hopeless lately' }),
      current_step: i + 1
    };
    const r = await api(ctx.baseUrl, 'POST', `/v2/assessments/${assessmentId}/responses`, { token: student.token, body });
    assert.equal(r.status, 200, `Failed saving ${q.external_id}: ${JSON.stringify(r.json)}`);
  }

  const done = await api(ctx.baseUrl, 'POST', `/v2/assessments/${assessmentId}/complete`, { token: student.token });
  assert.equal(done.status, 200);
  assert.equal(done.json.result.grade, '12');
  assert.equal(done.json.result.norm_status, 'provisional');
  assert.equal(done.json.result.clusters.length, 16);
  assert.ok(done.json.result.courses_12.length >= 1);
  assert.ok(done.json.result.courses_12.every((c) => /pending/i.test(c.earning_ladder)));
});

test('V2 Parent Module 8: dual-parent isolation, P11 consent gate, and RBAC on counsellor map', async () => {
  // Parent cannot fetch raw student V2 result directly
  const blockedRaw = await api(ctx.baseUrl, 'GET', `/v2/results/${assessmentId}`, { token: parent1.token });
  assert.equal(blockedRaw.status, 403);

  // Parent 1 completes M8 preferring Option 0
  const m8p1 = (await api(ctx.baseUrl, 'GET', `/v2/parent/m8/${assessmentId}`, { token: parent1.token })).json;
  assert.equal(m8p1.parent_slot, 'parent_1');
  for (const q of m8p1.questions) {
    const payload = answerPayloadForV2Item(q);
    await api(ctx.baseUrl, 'POST', `/v2/parent/m8/${assessmentId}/responses`, {
      token: parent1.token,
      body: { item_id: q.id, ...payload }
    });
  }
  const c1 = await api(ctx.baseUrl, 'POST', `/v2/parent/m8/${assessmentId}/complete`, { token: parent1.token });
  assert.equal(c1.status, 200);
  assert.equal(c1.json.parent_slot, 'parent_1');

  // Parent 2 completes M8 preferring last option (maximally contrasting preference)
  const m8p2 = (await api(ctx.baseUrl, 'GET', `/v2/parent/m8/${assessmentId}`, { token: parent2.token })).json;
  assert.equal(m8p2.parent_slot, 'parent_2');
  for (const q of m8p2.questions) {
    const payload = q.item_type === 'single_select' && q.options.length > 1
      ? { answer_key: String(q.options[q.options.length - 1].k) }
      : answerPayloadForV2Item(q);
    await api(ctx.baseUrl, 'POST', `/v2/parent/m8/${assessmentId}/responses`, {
      token: parent2.token,
      body: { item_id: q.id, ...payload }
    });
  }
  const c2 = await api(ctx.baseUrl, 'POST', `/v2/parent/m8/${assessmentId}/complete`, { token: parent2.token });
  assert.equal(c2.status, 200);
  assert.equal(c2.json.parent_slot, 'parent_2');

  // Parent summary never leaks P10 inter-parent disagreement or P11 sensitive insight before consent
  const sumBefore = (await api(ctx.baseUrl, 'GET', `/v2/parent/summary/${assessmentId}`, { token: parent1.token })).json;
  assert.equal(sumBefore.available, true);
  assert.ok(!sumBefore.shared_talking_points.some((i) => /disagree|Parent 2/i.test(i.title + i.meaning)));
  assert.ok(!sumBefore.shared_talking_points.some((i) => /wellbeing|safety|stress check/i.test(i.title)));

  // RBAC: Student and Parent cannot view Admin Counsellor Map or Fairness Audit
  assert.equal((await api(ctx.baseUrl, 'GET', `/v2/admin/counsellor-map/${assessmentId}`, { token: student.token })).status, 403);
  assert.equal((await api(ctx.baseUrl, 'GET', `/v2/admin/counsellor-map/${assessmentId}`, { token: parent1.token })).status, 403);
  assert.equal((await api(ctx.baseUrl, 'GET', '/v2/admin/fairness-audit', { token: student.token })).status, 403);

  // Admin CAN inspect full Counsellor Map & Fairness Audit
  const mapRes = await api(ctx.baseUrl, 'GET', `/v2/admin/counsellor-map/${assessmentId}`, { token: admin.token });
  assert.equal(mapRes.status, 200);
  assert.equal(mapRes.json.map.schema, 'counsellor_map_v1');
  assert.deepEqual(mapRes.json.map.meta.parents_responded, ['parent_1', 'parent_2']);
  assert.ok(mapRes.json.map.red_flags.length >= 1, 'admin counsellor map includes P11 red flag');

  const auditRes = await api(ctx.baseUrl, 'GET', '/v2/admin/fairness-audit', { token: admin.token });
  assert.equal(auditRes.status, 200);
  assert.ok(auditRes.json.total_v2_completed >= 1);
  assert.equal(auditRes.json.grade_norms.grade_12.completed_n >= 1, true);
  assert.equal(auditRes.json.grade_norms.grade_12.norm_status, 'provisional');

  // Admin can deactivate V2 again without allowing all versions to become inactive
  const dashAfter = (await api(ctx.baseUrl, 'GET', '/admin/dashboard', { token: admin.token })).json;
  const v1Ver = dashAfter.assessment_versions.find((v) => v.version_code === 'V1');
  const v2Ver = dashAfter.assessment_versions.find((v) => v.version_code === 'V2');
  const deactV2 = await api(ctx.baseUrl, 'POST', `/admin/versions/${v2Ver.id}/toggle`, {
    token: admin.token,
    body: { is_active: false }
  });
  assert.equal(deactV2.status, 200);
  assert.equal((await api(ctx.baseUrl, 'GET', '/v2/status', { token: student.token })).json.v2_active, false);

  const blockAllOff = await api(ctx.baseUrl, 'POST', `/admin/versions/${v1Ver.id}/toggle`, {
    token: admin.token,
    body: { is_active: false }
  });
  assert.equal(blockAllOff.status, 400);

  // Orphaned in_progress V2 row while V2 is inactive must never poison V1 startOrResume (regression test for 0/0 bug)
  await api(ctx.baseUrl, 'POST', `/admin/versions/${v2Ver.id}/toggle`, { token: admin.token, body: { is_active: true } });
  const orphan = (await api(ctx.baseUrl, 'POST', '/auth/register', {
    body: { email: 'v2-orphan@test.io', password: 'Password@123', role: 'candidate', full_name: 'Orphan V2', grade: 10, board: 'CBSE' }
  })).json;
  const startedV2Orphan = await api(ctx.baseUrl, 'POST', '/v2/assessments/start', { token: orphan.token });
  assert.equal(startedV2Orphan.status, 200);
  await api(ctx.baseUrl, 'POST', `/admin/versions/${v2Ver.id}/toggle`, { token: admin.token, body: { is_active: false } });

  const v1Start = await api(ctx.baseUrl, 'POST', '/candidate/assessment/start', { token: orphan.token });
  assert.equal(v1Start.status, 200);
  assert.equal(v1Start.json.version.version_code, 'V1');
  const v1Q = await api(ctx.baseUrl, 'GET', `/assessments/${v1Start.json.assessment.id}`, { token: orphan.token });
  assert.equal(v1Q.status, 200);
  assert.equal(v1Q.json.questions.length, 44);
});
