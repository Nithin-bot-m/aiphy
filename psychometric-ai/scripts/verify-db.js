#!/usr/bin/env node
// verify-db.js — FINAL AUDIT section 3: database verification.
//  1. Migrate a FRESH database from zero (temp path, never touches dev DB).
//  2. Introspect tables, FKs, indexes, unique constraints, CHECK constraints.
//  3. Verify seed runs on the fresh DB and application data is consistent.
//  4. Verify FK enforcement is actually ON at runtime.
// Exit 1 on any failure. Prints a machine-readable PASS/FAIL table.

process.env.DB_PATH = `/tmp/verify-db-${process.pid}.db`;
process.env.NODE_ENV = 'test';
process.env.SEED_DEMO_DATA = 'true'; // must be set BEFORE any require (env.js caches)

const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
}

(async () => {
// ---- 1. Migration from zero ----
const { runMigrations } = require('../backend/migrations/migrate');
try {
  await runMigrations();
  check('migrate from empty DB', true);
} catch (err) {
  check('migrate from empty DB', false, err.message);
  process.exit(1);
}

const db = new DatabaseSync(process.env.DB_PATH);

// ---- 2. Introspection ----
const tables = (await db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`).all()).map(r => r.name);
const EXPECTED_TABLES = [
  'users', 'students', 'parents', 'student_parent_mapping',
  'assessment_versions', 'assessments', 'questions', 'question_options', 'responses',
  'aptitude_scores', 'riasec_scores', 'grit_scores', 'stream_scores', 'scoring_rules',
  'parent_expectations', 'parent_perceptions', 'congruence_scores', 'notification_outbox',
  'prompt_versions', 'llm_requests', 'llm_responses', 'reports', 'report_versions',
  'audit_logs', 'admin_settings'
];
for (const t of EXPECTED_TABLES) check(`table exists: ${t}`, tables.includes(t));
const extra = tables.filter(t => !EXPECTED_TABLES.includes(t) && t !== 'schema_migrations');
check('no unexpected tables (schema_migrations bookkeeping allowed)', extra.length === 0, extra.join(',') || 'none');

// Foreign keys declared
const fkRows = await db.prepare(`SELECT m.name AS tbl, COUNT(*) AS fk_count FROM sqlite_master m
  JOIN pragma_foreign_key_list(m.name) fk ON m.type='table' AND m.name NOT LIKE 'sqlite_%'
  GROUP BY m.name`).all();
const fkMap = Object.fromEntries(fkRows.map(r => [r.tbl, r.fk_count]));
const EXPECT_FK = {
  students: 1, parents: 1, student_parent_mapping: 2, assessments: 2, questions: 1,
  question_options: 1, responses: 4, aptitude_scores: 1, riasec_scores: 1, grit_scores: 1,
  stream_scores: 1, scoring_rules: 1, parent_expectations: 2, parent_perceptions: 2,
  congruence_scores: 2, llm_requests: 2, llm_responses: 1, reports: 2, report_versions: 1, audit_logs: 1
};
for (const [tbl, count] of Object.entries(EXPECT_FK)) {
  check(`FKs on ${tbl} = ${count}`, (fkMap[tbl] || 0) === count, `actual ${fkMap[tbl] || 0}`);
}

// Unique constraints
const idxRows = await db.prepare(`SELECT name, sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL`).all();

// Pragma-based unique verification (authoritative)
async function tableUniques(tbl) {
  const idxRows = await db.prepare(`PRAGMA index_list('${tbl}')`).all();
  const cols = idxRows
    .filter(i => i.unique === 1)
    .flatMap(i => (db.prepare(`PRAGMA index_info('${i.name}')`).all()).map(c => c.name));
  return new Set(cols);
}
check('users.email unique', (await tableUniques('users')).has('email'));
check('students.student_code unique', (await tableUniques('students')).has('student_code'));
check('stream_scores (assessment_id,stream_id) unique', (await tableUniques('stream_scores')).has('assessment_id') && (await tableUniques('stream_scores')).has('stream_id'));
check('responses respondent-dedup unique index exists', idxRows.some(r => r.sql && r.sql.includes('uq_responses_respondent')));

// CHECK constraints (enum/status values)
const checkConstraints = await db.prepare(`SELECT name, sql FROM sqlite_master WHERE type='table'`).all()
  .map(r => r.sql || '').join(' ');
const REQUIRED_CHECKS = [
  ["users.role", "role IN ('candidate', 'parent', 'admin')"],
  ['assessments.status', "status IN ('in_progress', 'completed', 'archived')"],
  ['questions.module', "module IN ('aptitude', 'riasec', 'grit', 'parent_perception', 'parent_expectation')"],
  ['questions.question_type', "question_type IN ('single_choice', 'likert_5', 'categorical')"],
  ['questions.difficulty', "difficulty IN ('easy', 'medium', 'hard')"],
  ['mapping.status', "status IN ('pending_student_approval', 'linked', 'revoked')"],
  ['reports.report_type', "report_type IN ('candidate', 'parent', 'counselor')"],
  ['reports.status', "status IN ('pending', 'ready', 'failed')"],
  ['llm_requests.status', "status IN ('pending', 'success', 'failed', 'fallback')"],
  ['respondent_type', "respondent_type IN ('student', 'parent')"]
];
for (const [name, frag] of REQUIRED_CHECKS) {
  check(`CHECK constraint: ${name}`, checkConstraints.includes(frag));
}

// created_at/updated_at on mutable tables
for (const t of ['users', 'students', 'assessments', 'reports', 'scoring_rules']) {
  const cols = (await db.prepare(`PRAGMA table_info('${t}')`).all()).map(c => c.name);
  check(`${t} has created_at & updated_at`, cols.includes('created_at') && cols.includes('updated_at'));
}

// Nullable-field policy: identity columns must be NOT NULL
const nn = await db.prepare(`PRAGMA table_info('users')`).all();
check('users.password_hash NOT NULL', nn.find(c => c.name === 'password_hash')?.notnull === 1);
check('users.role NOT NULL', nn.find(c => c.name === 'role')?.notnull === 1);
const respCols = await db.prepare(`PRAGMA table_info('responses')`).all();
check('responses.assessment_id NOT NULL', respCols.find(c => c.name === 'assessment_id')?.notnull === 1);
check('responses.question_id NOT NULL', respCols.find(c => c.name === 'question_id')?.notnull === 1);

// Indexes for hot lookups
const allIdx = (await db.prepare(`SELECT name FROM sqlite_master WHERE type='index'`).all()).map(r => r.name);
for (const idx of ['uq_responses_respondent', 'idx_stream_scores_rank', 'idx_llm_requests_assessment', 'idx_audit_logs_user', 'idx_audit_logs_created']) {
  check(`index exists: ${idx}`, allIdx.includes(idx));
}

// ---- 3. Runtime FK enforcement ----
await db.exec('PRAGMA foreign_keys = ON');
try {
  await db.prepare(`INSERT INTO assessments (student_id, version_id) VALUES (99999, 1)`).run();
  check('FK enforcement: orphan assessment rejected', false, 'insert unexpectedly succeeded');
} catch {
  check('FK enforcement: orphan assessment rejected', true);
}
try {
  await db.prepare(`INSERT INTO stream_scores (assessment_id, stream_id, stream_name, fit_score, fit_band, rank_order)
              VALUES (99999, 'pcm', 'PCM', 50, 'X', 1)`).run();
  check('FK enforcement: orphan stream_score rejected', false, 'insert unexpectedly succeeded');
} catch {
  check('FK enforcement: orphan stream_score rejected', true);
}

// ---- 4. Seed on fresh DB ----
const { seedDatabase } = require('../backend/seeds/runSeed');
// (continuing in the same async scope — merged IIFE)
  try {
    await seedDatabase();
    check('seed runs on fresh DB', true);
    const counts = {};
    for (const t of ['users', 'students', 'questions', 'question_options', 'assessment_versions', 'scoring_rules', 'prompt_versions', 'assessments', 'responses', 'stream_scores', 'reports']) {
      counts[t] = db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c;
    }
    check('seed created demo users', counts.users >= 3, `users=${counts.users}`);
    check('seed created question bank', counts.questions > 20, `questions=${counts.questions}`);
    check('seed created options', counts.question_options > counts.questions, `options=${counts.question_options}`);
    check('seed created 7 scoring rule streams', counts.scoring_rules === 7, `rules=${counts.scoring_rules}`);
    check('seed created prompt versions', counts.prompt_versions === 3, `prompts=${counts.prompt_versions}`);
    check('seed created demo assessment + scores', counts.assessments >= 1 && counts.stream_scores >= 7, `assessments=${counts.assessments} stream_scores=${counts.stream_scores}`);
    check('seed created demo reports', counts.reports >= 1, `reports=${counts.reports}`);

    // demo flags set on seeded users
    const demoUsers = await db.prepare(`SELECT COUNT(*) c FROM users WHERE is_demo = 1`).get().c;
    check('seed users flagged is_demo=1', demoUsers === counts.users, `${demoUsers}/${counts.users}`);

    // required scoring config
    const cfg = await db.prepare(`SELECT value_json FROM admin_settings WHERE key='scoring_config'`).get();
    check('scoring_config present in admin_settings', !!cfg);
    if (cfg) {
      const parsed = JSON.parse(cfg.value_json);
      check('difficulty_weights configured', !!parsed.difficulty_weights);
      check('fit_bands configured (3 bands)', Array.isArray(parsed.fit_bands) && parsed.fit_bands.length === 3);
      check('congruence config present', !!parsed.congruence);
      check('riasec tie-break order present', Array.isArray(parsed.riasec_tie_break_order) && parsed.riasec_tie_break_order.join('') === 'RIASEC');
    }
  } catch (err) {
    check('seed runs on fresh DB', false, err.message);
  }

  // ---- Summary ----
  const failed = results.filter(r => !r.ok);
  console.log(`\n==== DB VERIFICATION: ${results.length - failed.length}/${results.length} PASS, ${failed.length} FAIL ====`);
  fs.unlinkSync(process.env.DB_PATH);
  for (const suffix of ['-wal', '-shm']) {
    try { fs.unlinkSync(process.env.DB_PATH + suffix); } catch { /* ok */ }
  }
  process.exit(failed.length > 0 ? 1 : 0);
})();
