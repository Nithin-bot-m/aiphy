// Regression & security tests covering Pre-Launch Audit fixes (F-01 through F-21).
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { startTestServer, api } = require('../helpers');

let ctx;
let otpDelivery;
let adminToken;

before(async () => {
  ctx = await startTestServer();
  otpDelivery = require('../../src/services/notifications/otpDelivery');
  const adminLogin = await api(ctx.baseUrl, 'POST', '/auth/login', {
    body: { identifier: 'admin@demo.psychometric-ai.local', password: 'Demo@12345' }
  });
  assert.strictEqual(adminLogin.status, 200, 'demo admin login should succeed');
  adminToken = adminLogin.json.token;
});

after(async () => {
  await ctx.close();
});

test('F-12: /api/health returns minimal status only; /api/admin/health requires admin role', async () => {
  const pub = await api(ctx.baseUrl, 'GET', '/health');
  assert.strictEqual(pub.status, 200);
  assert.strictEqual(pub.json.status, 'healthy');
  assert.strictEqual(pub.json.database, undefined);
  assert.strictEqual(pub.json.llm, undefined);
  assert.strictEqual(pub.json.otp, undefined);

  const anonAdmin = await api(ctx.baseUrl, 'GET', '/admin/health');
  assert.strictEqual(anonAdmin.status, 401);

  const adm = await api(ctx.baseUrl, 'GET', '/admin/health', { token: adminToken });
  assert.strictEqual(adm.status, 200);
  assert.ok(adm.json.database && typeof adm.json.database.driver === 'string');
  assert.ok(adm.json.llm && typeof adm.json.llm.model === 'string');
});

test('F-07: /auth/capabilities accurately reports SMS OTP disabled in console mode', async () => {
  const cap = await api(ctx.baseUrl, 'GET', '/auth/capabilities');
  assert.strictEqual(cap.status, 200);
  assert.strictEqual(cap.json.otpAvailable, false);
});

test('F-08 & F-21: blocks weak/common passwords and < / > HTML in identity fields', async () => {
  for (const weak of ['qwerty12', 'password123', '12345678']) {
    const r = await api(ctx.baseUrl, 'POST', '/auth/register', {
      body: { role: 'candidate', full_name: 'Valid Name', email: 'weakcheck@test.io', password: weak }
    });
    assert.strictEqual(r.status, 400, `weak password ${weak} must be rejected`);
  }

  const xssName = await api(ctx.baseUrl, 'POST', '/auth/register', {
    body: {
      role: 'candidate',
      full_name: '<script>alert(1)</script>',
      email: 'xssname@test.io',
      password: 'StrongPass@99'
    }
  });
  assert.strictEqual(xssName.status, 400);

  const xssSchool = await api(ctx.baseUrl, 'POST', '/auth/register', {
    body: {
      role: 'candidate',
      full_name: 'Clean Student',
      school_name: 'Delhi <img src=x> School',
      email: 'xssschool@test.io',
      password: 'StrongPass@99'
    }
  });
  assert.strictEqual(xssSchool.status, 400);
});

test('F-04 & F-05 & F-10 & F-14: verification, forgot/reset password, DPDP full export & deletion lifecycle', async () => {
  const email = 'lifecycle-student@test.io';
  const reg = await api(ctx.baseUrl, 'POST', '/auth/register', {
    body: {
      role: 'candidate',
      full_name: "St. Xavier's Student",
      school_name: "St. Xavier's High School",
      email,
      password: 'StrongPass@99'
    }
  });
  assert.strictEqual(reg.status, 201);
  assert.strictEqual(reg.json.user.emailVerified, false);
  let token = reg.json.token;

  // Verify email using outbox notice token captured in test mode
  const verifyNotice = otpDelivery.getLastTestNotice(email);
  assert.ok(verifyNotice && verifyNotice.message, 'verification notice should be emitted on registration');
  const vMatch = verifyNotice.message.match(/verify=([a-f0-9]{48})/);
  assert.ok(vMatch, 'verification token missing from notice');

  const verified = await api(ctx.baseUrl, 'POST', '/auth/verify-email', { body: { token: vMatch[1] } });
  assert.strictEqual(verified.status, 200);
  assert.strictEqual(verified.json.verified, true);
  assert.strictEqual(verified.json.user.emailVerified, true);

  // Profile update validates safe plain text and sets profile_completed = 1
  const profBad = await api(ctx.baseUrl, 'PUT', '/candidate/profile', {
    token,
    body: { school_name: 'Bad<script>School' }
  });
  assert.strictEqual(profBad.status, 400);

  const profOk = await api(ctx.baseUrl, 'PUT', '/candidate/profile', {
    token,
    body: { school_name: 'National Public School', grade: 10, board: 'CBSE' }
  });
  assert.strictEqual(profOk.status, 200);
  assert.strictEqual(Number(profOk.json.student.profile_completed), 1);

  // Full DPDP export strips secret hashes
  const exp = await api(ctx.baseUrl, 'GET', '/candidate/export', { token });
  assert.strictEqual(exp.status, 200);
  assert.ok(exp.json.user && Array.isArray(exp.json.students));
  assert.strictEqual(exp.json.user.password_hash, undefined);
  assert.strictEqual(exp.json.user.verification_token_hash, undefined);
  assert.strictEqual(exp.json.user.reset_token_hash, undefined);

  // Self-service forgot/reset password
  const forgot = await api(ctx.baseUrl, 'POST', '/auth/forgot-password', { body: { email } });
  assert.strictEqual(forgot.status, 200);
  assert.strictEqual(forgot.json.sent, true);

  const resetNotice = otpDelivery.getLastTestNotice(email);
  const rMatch = resetNotice && resetNotice.message.match(/reset=([a-f0-9]{48})/);
  assert.ok(rMatch, 'reset token missing from notice');

  const badReset = await api(ctx.baseUrl, 'POST', '/auth/reset-password', {
    body: { token: rMatch[1], new_password: 'qwerty12' }
  });
  assert.strictEqual(badReset.status, 400);

  const goodReset = await api(ctx.baseUrl, 'POST', '/auth/reset-password', {
    body: { token: rMatch[1], new_password: 'NewStrongPass@101' }
  });
  assert.strictEqual(goodReset.status, 200);
  assert.strictEqual(goodReset.json.reset, true);

  const oldLogin = await api(ctx.baseUrl, 'POST', '/auth/login', {
    body: { identifier: email, password: 'StrongPass@99' }
  });
  assert.strictEqual(oldLogin.status, 401);

  const newLogin = await api(ctx.baseUrl, 'POST', '/auth/login', {
    body: { identifier: email, password: 'NewStrongPass@101' }
  });
  assert.strictEqual(newLogin.status, 200);
  token = newLogin.json.token;

  // Deletion request & Admin DPDP erasure
  const delReq = await api(ctx.baseUrl, 'POST', '/auth/request-deletion', {
    token,
    body: { confirm: true, reason: 'Testing DPDP erasure' }
  });
  assert.strictEqual(delReq.status, 200);
  assert.strictEqual(delReq.json.requested, true);
  assert.ok(delReq.json.deletionRequestedAt);

  const erased = await api(ctx.baseUrl, 'POST', `/admin/users/${reg.json.user.id}/erase`, {
    token: adminToken,
    body: {}
  });
  assert.strictEqual(erased.status, 200);

  const blockedLogin = await api(ctx.baseUrl, 'POST', '/auth/login', {
    body: { identifier: email, password: 'NewStrongPass@101' }
  });
  assert.strictEqual(blockedLogin.status, 401);
});

test('F-09: candidate parent-requests includes valid requested_at alias', async () => {
  const stu = await api(ctx.baseUrl, 'POST', '/auth/register', {
    body: { role: 'candidate', full_name: 'Req Time Student', email: 'reqtime-stu@test.io', password: 'StrongPass@99' }
  });
  const par = await api(ctx.baseUrl, 'POST', '/auth/register', {
    body: { role: 'parent', full_name: 'Req Time Parent', email: 'reqtime-par@test.io', password: 'StrongPass@99' }
  });
  const link = await api(ctx.baseUrl, 'POST', '/parent/link-request', {
    token: par.json.token,
    body: { student_code: stu.json.profile.student_code }
  });
  assert.strictEqual(link.status, 202);

  const pending = await api(ctx.baseUrl, 'GET', '/candidate/parent-requests', { token: stu.json.token });
  assert.strictEqual(pending.status, 200);
  const reqRow = pending.json.pending?.[0];
  assert.ok(reqRow && reqRow.requested_at, 'requested_at must be present on pending parent link requests');
  assert.ok(!Number.isNaN(Date.parse(reqRow.requested_at)), 'requested_at must be a valid timestamp');
});

test('F-03 & F-16 & F-17: admin candidates includes V1 Holland/Overall and audit filter is case-insensitive substring', async () => {
  const cands = await api(ctx.baseUrl, 'GET', '/admin/candidates', { token: adminToken });
  assert.strictEqual(cands.status, 200);
  const aarav = (cands.json.candidates || []).find((c) => c.email === 'aarav@demo.psychometric-ai.local');
  assert.ok(aarav, 'demo student aarav should appear in candidates list');
  assert.ok(aarav.latest_assessment_id != null && aarav.latest_completed_assessment_id != null);
  assert.ok(aarav.holland_code && aarav.holland_code.length >= 2, 'V1 candidate holland_code should be populated');
  assert.ok(typeof aarav.overall_index === 'number', 'V1 candidate overall_index should be populated');

  const logs = await api(ctx.baseUrl, 'GET', '/admin/audit-logs?action=login', { token: adminToken });
  assert.strictEqual(logs.status, 200);
  assert.ok((logs.json.logs || []).length >= 1, 'case-insensitive substring filter action=login must match LOGIN events');
});

test('F-02: LLM fallback reports offline-template-v1 model instead of unreachable upstream model', async () => {
  const env = require('../../src/config/env');
  const promptService = require('../../src/services/llm/promptService');
  const { generateNarrative } = require('../../src/services/llm/llmService');
  const origProvider = env.LLM_PROVIDER;
  const origModel = env.LLM_MODEL;
  const origKey = env.GEMINI_API_KEY;
  const origUrl = env.GEMINI_BASE_URL;
  const origTimeout = env.LLM_TIMEOUT_MS;
  try {
    env.LLM_PROVIDER = 'gemini';
    env.LLM_MODEL = 'gemini-2.5-flash';
    env.GEMINI_API_KEY = 'fake-test-key';
    env.GEMINI_BASE_URL = 'http://127.0.0.1:1';
    env.LLM_TIMEOUT_MS = 500;
    const promptRow = await promptService.getActivePrompt('candidate_report');
    const structuredResult = {
      student: { first_name: 'Aarav', grade: 10, board: 'CBSE' },
      recommendations: [{ stream_id: 'pcm', stream_name: 'Science (PCM)', fit_band: 'Strong Fit', fit_score: 80 }],
      aptitude: { overall: 75 },
      riasec: { holland_code: 'IRA', ranking: [] },
      grit: { normalized_index: 70 },
      streams: [{ id: 'pcm', name: 'Science (PCM)', score: 80, band: 'Strong Fit', career_clusters: ['Engineering & Data'] }],
      congruence: null,
      limitations: []
    };
    const userPrompt = await promptService.buildUserPrompt(promptRow, structuredResult);
    const out = await generateNarrative({
      assessmentId: null,
      userId: null,
      reportType: 'candidate',
      promptRow,
      userPrompt,
      structuredResult
    });
    assert.strictEqual(out.status, 'fallback');
    assert.strictEqual(out.model, 'offline-template-v1');

    // Recent fallback reason must be visible to admins instead of failing silently
    const usage = await api(ctx.baseUrl, 'GET', '/admin/llm/usage', { token: adminToken });
    assert.strictEqual(usage.status, 200);
    assert.ok(Array.isArray(usage.json.recent_failures) && usage.json.recent_failures.length >= 1);
    assert.ok(usage.json.recent_failures[0].error_message, 'fallback error_message should be recorded');
  } finally {
    env.LLM_PROVIDER = origProvider;
    env.LLM_MODEL = origModel;
    env.GEMINI_API_KEY = origKey;
    env.GEMINI_BASE_URL = origUrl;
    env.LLM_TIMEOUT_MS = origTimeout;
  }
});

test('F-01: 5 consecutive failed logins lock account and admin reset unlocks it', async () => {
  const email = 'lockout-target@test.io';
  const reg = await api(ctx.baseUrl, 'POST', '/auth/register', {
    body: { role: 'candidate', full_name: 'Lockout User', email, password: 'StrongPass@99' }
  });
  assert.strictEqual(reg.status, 201);

  for (let i = 1; i <= 4; i += 1) {
    const fail = await api(ctx.baseUrl, 'POST', '/auth/login', {
      body: { identifier: email, password: `WrongPass@${i}` }
    });
    assert.strictEqual(fail.status, 401, `attempt ${i} should be 401 before threshold 5`);
  }

  const fifth = await api(ctx.baseUrl, 'POST', '/auth/login', {
    body: { identifier: email, password: 'WrongPass@5' }
  });
  assert.strictEqual(fifth.status, 429, '5th failed login must lock the account');

  // Even the correct password must be rejected while account is locked
  const duringLock = await api(ctx.baseUrl, 'POST', '/auth/login', {
    body: { identifier: email, password: 'StrongPass@99' }
  });
  assert.strictEqual(duringLock.status, 429);

  // Admin password reset clears the lockout and allows sign-in with temporary password
  const admReset = await api(ctx.baseUrl, 'POST', `/admin/users/${reg.json.user.id}/reset-password`, {
    token: adminToken,
    body: {}
  });
  assert.strictEqual(admReset.status, 200);
  assert.ok(admReset.json.temporary_password);

  const afterReset = await api(ctx.baseUrl, 'POST', '/auth/login', {
    body: { identifier: email, password: admReset.json.temporary_password }
  });
  assert.strictEqual(afterReset.status, 200);
});
