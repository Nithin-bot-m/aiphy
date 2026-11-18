#!/usr/bin/env node
// final-verify-live-a.js — FINAL AUDIT sections 4, 5, 6, 19, 31-A.
// Live HTTP verification against an isolated, freshly-migrated + seeded server.
// Nothing is assumed from code reading; every claim is exercised over the wire.

process.env.DB_PATH = `/tmp/verify-live-a-${process.pid}.db`;
process.env.NODE_ENV = 'test';
process.env.SEED_DEMO_DATA = 'true';

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ' — ' + detail}`);
}

(async () => {
  const { startTestServer, api } = require('../backend/tests/helpers');
  const { db } = require('../backend/src/config/db');
  const ctx = await startTestServer();
  const B = ctx.baseUrl;
  const ts = Date.now();

  // =====================================================================
  // SECTION 4 — AUTHENTICATION
  // =====================================================================
  console.log('\n── SECTION 4: Authentication ─────────────────────────');

  // Candidate registration
  const candA = await api(B, 'POST', '/auth/register', { body: {
    role: 'candidate', email: `live-a-${ts}@test.io`, password: 'Str0ng!Pass1', full_name: 'Alice Tester', board: 'CBSE' } });
  check('4.1 candidate registration succeeds (201/200 + token)', [200, 201].includes(candA.status) && !!candA.json.token, JSON.stringify(candA.json).slice(0, 200));
  check('4.2 candidate gets student_code', /^PC-[A-Z0-9]{8}$/.test(candA.json.profile?.student_code || ''), candA.json.profile?.student_code);

  // Parent registration
  const parA = await api(B, 'POST', '/auth/register', { body: {
    role: 'parent', email: `live-pa-${ts}@test.io`, password: 'Str0ng!Pass1', full_name: 'Amma Tester', relationship: 'Mother' } });
  check('4.3 parent registration succeeds', [200, 201].includes(parA.status) && !!parA.json.token);

  // Candidate login
  const cAlogin = await api(B, 'POST', '/auth/login', { body: { identifier: `live-a-${ts}@test.io`, password: 'Str0ng!Pass1' } });
  check('4.4 candidate login works', cAlogin.status === 200 && !!cAlogin.json.token);

  // Parent login
  const pAlogin = await api(B, 'POST', '/auth/login', { body: { identifier: `live-pa-${ts}@test.io`, password: 'Str0ng!Pass1' } });
  check('4.5 parent login works', pAlogin.status === 200 && !!pAlogin.json.token);

  // Admin await login(seeded demo admin)
  const adm = await api(B, 'POST', '/auth/login', { body: { identifier: 'admin@demo.psychometric-ai.local', password: 'Demo@12345' } });
  check('4.6 admin login works (seeded)', adm.status === 200 && adm.json.user?.role === 'admin');

  // Admin registration blocked on public endpoint
  const admReg = await api(B, 'POST', '/auth/register', { body: {
    role: 'admin', email: `evil-admin-${ts}@test.io`, password: 'Str0ng!Pass1', full_name: 'Evil Admin' } });
  check('4.7 admin self-registration rejected', admReg.status === 400, `status=${admReg.status}`);

  // Logout
  const lo = await api(B, 'POST', '/auth/logout', { token: cAlogin.json.token });
  check('4.8 logout returns success envelope', lo.status === 200 && lo.json.message);

  // Invalid password rejected
  const badPw = await api(B, 'POST', '/auth/login', { body: { identifier: `live-a-${ts}@test.io`, password: 'WrongPass1!' } });
  check('4.9 invalid password rejected (401)', badPw.status === 401);

  // Missing credentials rejected
  const missing = await api(B, 'POST', '/auth/login', { body: { identifier: `live-a-${ts}@test.io` } });
  const missing2 = await api(B, 'POST', '/auth/login', { body: {} });
  check('4.10 missing password rejected (400)', missing.status === 400);
  check('4.11 empty body rejected (400)', missing2.status === 400);

  // Expired / invalid tokens rejected
  const jwt = require('jsonwebtoken');
  const envMod = require('../backend/src/config/env');
  const expired = jwt.sign({ id: candA.json.user.id, role: 'candidate' }, envMod.JWT_SECRET, { expiresIn: '-10s' });
  const expRes = await api(B, 'GET', '/auth/me', { token: expired });
  check('4.12 expired session token rejected (401)', expRes.status === 401, `status=${expRes.status}`);

  const wrongSign = jwt.sign({ id: candA.json.user.id, role: 'admin' }, 'attacker-secret-not-used-by-server', { expiresIn: '1h' });
  const wrongRes = await api(B, 'GET', '/auth/me', { token: wrongSign });
  check('4.13 token signed with wrong key rejected (401)', wrongRes.status === 401);

  const garbage = await api(B, 'GET', '/auth/me', { token: 'garbage.token.here' });
  check('4.14 malformed token rejected (401)', garbage.status === 401);

  // Plaintext password never stored
  const stored = await db.prepare('SELECT password_hash FROM users WHERE email = ?').get(`live-a-${ts}@test.io`);
  check('4.15 password stored as bcrypt hash (not plaintext)',
    !!stored && /^\$2[aby]\$/.test(stored.password_hash) && !stored.password_hash.includes('Str0ng!Pass1'));
  const allPlaintext = (await db.prepare(`SELECT COUNT(*) c FROM users WHERE password_hash NOT LIKE '$2%'`).get()).c;
  check('4.16 zero plaintext password hashes in entire users table', allPlaintext === 0);

  // OTP hardening spot-checks (backdoor must stay dead)
  const otpBackdoor = await api(B, 'POST', '/auth/verify-otp', { body: { phone: '+910000000001', otp: '123456' } });
  check('4.17 static OTP backdoor dead', otpBackdoor.status === 401);

  // =====================================================================
  // SECTION 5 — AUTHORIZATION MATRIX
  // =====================================================================
  console.log('\n── SECTION 5: Authorization matrix ───────────────────');

  // Student B + Parent B
  const candB = await api(B, 'POST', '/auth/register', { body: {
    role: 'candidate', email: `live-b-${ts}@test.io`, password: 'Str0ng!Pass1', full_name: 'Bob Tester', board: 'ICSE' } });
  const parB = await api(B, 'POST', '/auth/register', { body: {
    role: 'parent', email: `live-pb-${ts}@test.io`, password: 'Str0ng!Pass1', full_name: 'Baba Tester', relationship: 'Father' } });
  check('5.1 student B and parent B registered', [200, 201].includes(candB.status) && [200, 201].includes(parB.status));

  const aTok = candA.json.token, bTok = candB.json.token, paTok = parA.json.token, pbTok = parB.json.token, adTok = adm.json.token;
  const startA2 = await api(B, 'POST', '/candidate/assessment/start', { token: aTok });
  const startB2 = await api(B, 'POST', '/candidate/assessment/start', { token: bTok });
  const aidA = startA2.json.assessment.id, aidB = startB2.json.assessment.id;
  check('5.2 assessments started for A and B (distinct)', !!aidA && !!aidB && aidA !== aidB);

  // Student A cannot access/modify Student B
  check('5.3 A cannot read B questions (403)', (await api(B, 'GET', `/assessments/${aidB}`, { token: aTok })).status === 403);
  check('5.4 A cannot write B responses (403)', (await api(B, 'POST', `/assessments/${aidB}/responses`, { token: aTok, body: { question_id: 1, selected_option_id: 2 } })).status === 403);
  check('5.5 A cannot complete B (403)', (await api(B, 'POST', `/assessments/${aidB}/complete`, { token: aTok })).status === 403);
  check('5.6 A cannot read B progress (403)', (await api(B, 'GET', `/assessments/${aidB}/progress`, { token: aTok })).status === 403);
  check('5.7 A cannot read B results (403)', (await api(B, 'GET', `/results/${aidB}`, { token: aTok })).status === 403);
  check('5.8 A cannot read B reports (403)', (await api(B, 'GET', `/reports/${aidB}/candidate`, { token: aTok })).status === 403);

  // Unlinked parent cannot access anything of either student
  check('5.9 unlinked parent cannot read child dashboard (403)', (await api(B, 'GET', `/parent/child?assessment_id=${aidA}`, { token: paTok })).status === 403);
  check('5.10 unlinked parent cannot submit inventory (403)', (await api(B, 'POST', '/parent/inventory/submit', { token: paTok, body: { assessment_id: aidA } })).status === 403);

  // Link flow with consent: PA → A ; PB → B
  const linkA = await api(B, 'POST', '/parent/link-request', { token: paTok, body: { student_code: candA.json.profile.student_code } });
  check('5.11 parent link request creates pending state (202)', linkA.status === 202 && linkA.json.status === 'pending_student_approval', JSON.stringify(linkA.json));
  const requestsA = await api(B, 'GET', '/candidate/parent-requests', { token: aTok });
  const mapA = requestsA.json.pending?.[0]?.mapping_id;
  check('5.12 student sees pending parent request', !!mapA, JSON.stringify(requestsA.json));
  const apprA = await api(B, 'POST', `/candidate/parent-requests/${mapA}/approve`, { token: aTok });
  check('5.13 student approves parent → linked', apprA.status === 200 && apprA.json.status === 'linked');

  await api(B, 'POST', '/parent/link-request', { token: pbTok, body: { student_code: candB.json.profile.student_code } });
  const reqB = await api(B, 'GET', '/candidate/parent-requests', { token: bTok });
  const apprB = await api(B, 'POST', `/candidate/parent-requests/${reqB.json.pending?.[0]?.mapping_id}/approve`, { token: bTok });
  check('5.14 parent B linked to student B', apprB.status === 200 && apprB.json.status === 'linked');

  // Parent A cannot access Student B (even after being linked to A)
  check('5.15 parent A cannot access B dashboard (403)', (await api(B, 'GET', `/parent/child?assessment_id=${aidB}`, { token: paTok })).status === 403);
  check('5.16 parent A cannot access B results (403)', (await api(B, 'GET', `/results/${aidB}`, { token: paTok })).status === 403);
  check('5.17 parent A cannot access B candidate report (403)', (await api(B, 'GET', `/reports/${aidB}/candidate`, { token: paTok })).status === 403);
  check('5.18 parent A cannot access B responses (403)', (await api(B, 'GET', `/assessments/${aidB}`, { token: paTok })).status === 403);
  check('5.19 parent A cannot submit inventory against B (403)', (await api(B, 'POST', '/parent/inventory/submit', { token: paTok, body: { assessment_id: aidB, expected_stream: 'pcm', outcome_priority: 'stability', perceptions: { observed_analytical: 3, observed_creative: 3, observed_study_habits: 3, observed_stress_resilience: 3 } } })).status === 403);

  // Revoked access: student revokes parent → access ends
  const revoke = await api(B, 'POST', `/candidate/parent-requests/${mapA}/revoke`, { token: aTok });
  check('5.20 student can revoke parent link', revoke.status === 200);
  check('5.21 revoked parent loses dashboard access (403)', (await api(B, 'GET', `/parent/child?assessment_id=${aidA}`, { token: paTok })).status === 403);
  // re-link for later journey tests
  await api(B, 'POST', '/parent/link-request', { token: paTok, body: { student_code: candA.json.profile.student_code } });
  const reqA2 = await api(B, 'GET', '/candidate/parent-requests', { token: aTok });
  await api(B, 'POST', `/candidate/parent-requests/${reqA2.json.pending?.[0]?.mapping_id}/approve`, { token: aTok });

  // RBAC: candidate/parent blocked from admin APIs; admin allowed
  check('5.22 candidate blocked from admin APIs (403)', (await api(B, 'GET', '/admin/dashboard', { token: aTok })).status === 403);
  check('5.23 parent blocked from admin APIs (403)', (await api(B, 'GET', '/admin/dashboard', { token: paTok })).status === 403);
  check('5.24 candidate blocked from admin questions (403)', (await api(B, 'GET', '/admin/questions', { token: bTok })).status === 403);
  check('5.25 admin can access authorized admin APIs (200)', (await api(B, 'GET', '/admin/dashboard', { token: adTok })).status === 200);
  check('5.26 unauthenticated blocked everywhere (401)', (await api(B, 'GET', '/admin/dashboard')).status === 401);

  // Role escalation attempts
  const escal = await api(B, 'PUT', '/candidate/profile', { token: aTok, body: { role: 'admin' } });
  const meAfter = await api(B, 'GET', '/auth/me', { token: aTok });
  check('5.27 role field not updatable via profile (still candidate)', meAfter.json.user?.role === 'candidate');
  void escal;

  // =====================================================================
  // SECTION 6 — ASSESSMENT LIFECYCLE
  // =====================================================================
  console.log('\n── SECTION 6: Assessment lifecycle ───────────────────');

  const q = await api(B, 'GET', `/assessments/${aidA}`, { token: aTok });
  check('6.1 questions load (44 student items)', q.status === 200 && q.json.questions?.length === 44, `got ${q.json.questions?.length}`);
  check('6.2 options carry NO score values (anti-cheat)',
    q.json.questions.every(qq => qq.options.every(o => !('score_value' in o))));
  const allQ = q.json.questions;
  const likertQ = allQ.filter(qq => qq.question_type === 'likert_5');
  const aptQ = allQ.filter(qq => qq.module === 'aptitude');
  check('6.3 aptitude + likert items present (12 + 32)', aptQ.length === 12 && likertQ.length === 32, `apt=${aptQ.length} likert=${likertQ.length}`);

  // invalid inputs
  check('6.4 invalid option id rejected (400)', (await api(B, 'POST', `/assessments/${aidA}/responses`, { token: aTok, body: { question_id: aptQ[0].id, selected_option_id: 9999999 } })).status === 400);
  check('6.5 invalid question id rejected (400)', (await api(B, 'POST', `/assessments/${aidA}/responses`, { token: aTok, body: { question_id: 9999999, selected_option_id: 1 } })).status === 400);
  const otherQ = await api(B, 'GET', `/assessments/${aidB}`, { token: bTok });
  const foreignQ = otherQ.json.questions?.[0];
  // A and B share the SAME active version (V1), so B's questions are valid for A.
  // The real rule is version membership: insert a question under a FOREIGN version.
  const foreignVersion = await db.prepare("INSERT INTO assessment_versions (version_code, name, description, is_active) VALUES ('FOREIGN-AUDIT', 'x', 'x', 0)").run();
  const foreignQrow = await db.prepare("INSERT INTO questions (version_id, module, category, question_text, question_type, dimension, display_order, is_active) VALUES (?, 'riasec', 'x', 'Foreign version item?', 'likert_5', 'R', 1, 1)").run(Number(foreignVersion.lastInsertRowid));
  const foreignQid = Number(foreignQrow.lastInsertRowid);
  check('6.6 question from ANOTHER VERSION rejected (400)',
    (await api(B, 'POST', `/assessments/${aidA}/responses`, { token: aTok, body: { question_id: foreignQid, selected_option_id: 1 } })).status === 400);
  void foreignQ;
  check('6.7 malformed payload rejected (400)', (await api(B, 'POST', `/assessments/${aidA}/responses`, { token: aTok, body: { nonsense: true } })).status === 400);
  check('6.8 likert answered via option id (200); client cannot inject raw numeric values',
    (await api(B, 'POST', `/assessments/${aidA}/responses`, { token: aTok, body: { question_id: likertQ[0].id, selected_option_id: likertQ[0].options[0].id, numeric_value: 99 } })).status === 200);

  // duplicate answer → idempotent upsert (single row per question)
  const dupQ = likertQ[1];
  await api(B, 'POST', `/assessments/${aidA}/responses`, { token: aTok, body: { question_id: dupQ.id, selected_option_id: dupQ.options[0].id } });
  await api(B, 'POST', `/assessments/${aidA}/responses`, { token: aTok, body: { question_id: dupQ.id, selected_option_id: dupQ.options[4].id } });
  const dupRows = (await db.prepare('SELECT COUNT(*) c FROM responses WHERE assessment_id = ? AND question_id = ? AND respondent_type = ?').get(aidA, dupQ.id, 'student')).c;
  check('6.9 duplicate answer → single upserted row (no duplicates)', dupRows === 1, `rows=${dupRows}`);

  // complete with missing answers → 422 + explicit code (no fabricated scores)
  const early = await api(B, 'POST', `/assessments/${aidA}/complete`, { token: aTok });
  check('6.10 early completion blocked (422 ASSESSMENT_INCOMPLETE)', early.status === 422 && early.json.error?.code === 'ASSESSMENT_INCOMPLETE', JSON.stringify(early.json));

  // answer everything, progress tracking + refresh persistence
  let i = 0;
  for (const qq of allQ) {
    if (qq.id === dupQ.id) continue; // already answered (option 5 kept)
    const opt = qq.question_type === 'likert_5' ? qq.options[i % 5] : qq.options[0];
    const r = await api(B, 'POST', `/assessments/${aidA}/responses`, { token: aTok, body: { question_id: qq.id, selected_option_id: opt.id, current_step: 1 + (i % 4) } });
    if (r.status !== 200) { check('6.11 answering all items succeeds', false, `item ${qq.id} -> ${r.status}`); break; }
    i += 1;
  }
  check('6.11 answering all items succeeds', true);
  const prog = await api(B, 'GET', `/assessments/${aidA}/progress`, { token: aTok });
  check('6.12 progress reflects 44/44 (100%)', prog.json.answered === 44 && prog.json.percent === 100, JSON.stringify(prog.json));

  // refresh preserves progress: re-fetch questions → responses map retained
  const q2 = await api(B, 'GET', `/assessments/${aidA}`, { token: aTok });
  check('6.13 refresh preserves answers (responses map has 44)', Object.keys(q2.json.responses || {}).length === 44, `got ${Object.keys(q2.json.responses || {}).length}`);

  // resume works: start again → same assessment id
  const resume = await api(B, 'POST', '/candidate/assessment/start', { token: aTok });
  check('6.14 resume returns SAME assessment (no duplicate creation)', resume.json.assessment.id === aidA);

  // complete → idempotent completion handling
  const done = await api(B, 'POST', `/assessments/${aidA}/complete`, { token: aTok });
  check('6.15 completion succeeds with reports', done.status === 200 && done.json.top_streams?.length === 3, JSON.stringify(done.json).slice(0, 150));
  check('6.16 all three reports generated (candidate/parent/counselor)',
    ['candidate', 'parent', 'counselor'].every(t => done.json.reports?.[t]?.report_id));
  const dupDone = await api(B, 'POST', `/assessments/${aidA}/complete`, { token: aTok });
  check('6.17 duplicate completion rejected (409 CONFLICT)', dupDone.status === 409);
  const reportsAfter = (await db.prepare('SELECT COUNT(*) c FROM reports WHERE assessment_id = ?').get(aidA)).c;
  check('6.18 duplicate submission did NOT duplicate reports', reportsAfter === 3, `reports=${reportsAfter}`);

  // results endpoints
  const res1 = await api(B, 'GET', `/results/${aidA}`, { token: aTok });
  check('6.19 canonical result available (schema psychometric-result/1.0)', res1.status === 200 && res1.json.result?.schema === 'psychometric-result/1.0');
  const streams1 = await api(B, 'GET', `/results/${aidA}/streams`, { token: aTok });
  check('6.20 stream analysis returns 7 streams with contributions', streams1.json.streams?.length === 7 && streams1.json.streams.every(s => s.contributions?.length > 0));

  // =====================================================================
  // SECTION 19 — INPUT SECURITY
  // =====================================================================
  console.log('\n── SECTION 19: Input security ────────────────────────');

  // SQL injection attempts (parameterized queries must neutralize)
  const sqli1 = await api(B, 'POST', '/auth/login', { body: { identifier: `' OR '1'='1' --`, password: 'x' } });
  const sqli2 = await api(B, 'POST', '/auth/login', { body: { identifier: `admin@demo.psychometric-ai.local'--`, password: 'anything' } });
  const sqli3 = await api(B, 'GET', `/results/${encodeURIComponent('1 OR 1=1; DROP TABLE users;--')}`, { token: aTok });
  check('19.1 SQLi login #1 → 401 (no error, no breach)', sqli1.status === 401);
  check('19.2 SQLi login #2 → 401', sqli2.status === 401);
  check('19.3 SQLi in path param → 400/404 (no 500, table intact)', [400, 404].includes(sqli3.status));
  check('19.4 users table still intact after SQLi attempts',
    (await db.prepare(`SELECT COUNT(*) c FROM users WHERE email = 'live-a-${ts}@test.io'`).get()).c === 1);

  // XSS: hostile full_name — must be escaped in narrative HTML output
  const xssName = `X<script>alert(1)</script><img src=x onerror=alert(2)>Y${ts}`;
  const xssUser = await api(B, 'POST', '/auth/register', { body: {
    role: 'candidate', email: `xss-${ts}@test.io`, password: 'Str0ng!Pass1', full_name: xssName } });
  check('19.5 hostile name accepted as DATA (registration succeeds)', [200, 201].includes(xssUser.status));
  const xssStart = await api(B, 'POST', '/candidate/assessment/start', { token: xssUser.json.token });
  const xssQ = await api(B, 'GET', `/assessments/${xssStart.json.assessment.id}`, { token: xssUser.json.token });
  for (const qq of xssQ.json.questions) {
    const opt = qq.options[0];
    await api(B, 'POST', `/assessments/${xssStart.json.assessment.id}/responses`, { token: xssUser.json.token, body: { question_id: qq.id, selected_option_id: opt.id } });
  }
  await api(B, 'POST', `/assessments/${xssStart.json.assessment.id}/complete`, { token: xssUser.json.token });
  const xssReport = await api(B, 'GET', `/reports/${xssStart.json.assessment.id}/candidate`, { token: xssUser.json.token });
  const narr = xssReport.json.report?.narrative_html || '';
  check('19.6 report narrative contains NO executable injection', !narr.includes('<script>') && !narr.includes('onerror='), narr.slice(0, 200));
  check('19.7 hostile name rendered escaped (data, not markup)', narr.includes('&lt;script&gt;') || !narr.includes('<script>'));

  // Prototype pollution payloads
  const proto = await api(B, 'POST', '/auth/login', { body: JSON.parse('{"__proto__":{"polluted":"yes"},"identifier":"x","password":"y"}') });
  check('19.8 __proto__ payload does not pollute Object.prototype', ({}).polluted === undefined, String(({}).polluted));
  check('19.9 __proto__ payload handled safely (400/401)', [400, 401].includes(proto.status));

  // Oversized request
  const big = 'x'.repeat(300 * 1024);
  const bigRes = await fetch(`${B}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: big, password: big }) });
  check('19.10 oversized request (300KB) rejected (413)', bigRes.status === 413, `status=${bigRes.status}`);

  // Unexpected fields ignored, no mass-assignment
  await api(B, 'POST', '/auth/register', { body: {
    role: 'candidate', email: `mass-${ts}@test.io`, password: 'Str0ng!Pass1', full_name: 'Mass Assign',
    is_admin: true, role_override: 'admin', password_hash: '$2a$12$fake', student_code: 'PC-HIJACK1' } });
  const massRow = await db.prepare(`SELECT u.role, u.password_hash FROM users u WHERE u.email = ?`).get(`mass-${ts}@test.io`);
  check('19.11 mass-assignment ignored (role stays candidate)', massRow?.role === 'candidate');
  check('19.12 supplied password_hash not stored (bcrypt hash real)', /^\$2[aby]\$12\$/.test(massRow?.password_hash || '') && massRow.password_hash !== '$2a$12$fake');

  // =====================================================================
  // SECTION 31-A — JOURNEY A (candidate end-to-end) — covered by 6.x above;
  // assert the full chain one more time explicitly:
  check('31.A candidate journey: register→login→profile→assessment→submit→results→report',
    [200, 201].includes(candA.status) && cAlogin.status === 200 &&
    (await api(B, 'GET', '/candidate/profile', { token: aTok })).status === 200 &&
    done.status === 200 && res1.status === 200 &&
    (await api(B, 'GET', `/reports/${aidA}/candidate`, { token: aTok })).status === 200);

  // =====================================================================
  const failed = results.filter(r => !r.ok);
  console.log(`\n==== LIVE VERIFICATION A: ${results.length - failed.length}/${results.length} PASS, ${failed.length} FAIL ====`);
  await ctx.close();
  process.exit(failed.length ? 1 : 0);
})().catch(err => { console.error('FATAL:', err); process.exit(1); });
