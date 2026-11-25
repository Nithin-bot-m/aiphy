// Seed runner — populates the database with versioned battery + config + prompts.
//
// DEMO DATA POLICY (spec §26): demo accounts / assessments are created ONLY
// when SEED_DEMO_DATA=true (default for local dev), are flagged is_demo=1,
// and the demo assessment is computed THROUGH THE REAL ENGINES — never by
// inserting hand-written score rows (an audited anti-pattern).

const bcrypt = require('bcryptjs');
const { db, transaction } = require('../src/config/db');
const env = require('../src/config/env');
const { buildQuestionBank } = require('./questionBank');
const { seedV2Bank } = require('./seedV2Bank');
const { STREAM_PROFILES } = require('./streamProfiles');
const { PROMPT_SEEDS } = require('./promptSeeds');
const { runMigrations } = require('../migrations/migrate');
const { scoreAssessment } = require('../src/services/psychometrics/scoringService');
const assessmentRepository = require('../src/repositories/assessmentRepository');
const { DEFAULT_SCORING_CONFIG } = require('../src/config/constants');

const DEMO_STUDENT_EMAIL = 'aarav@demo.psychometric-ai.local';
const DEMO_PARENT_EMAIL = 'sunita@demo.psychometric-ai.local';
const DEMO_ADMIN_EMAIL = 'admin@demo.psychometric-ai.local';
const DEMO_PASSWORD = 'Demo@12345';

async function seedBattery() {
  const version = await db.prepare('SELECT * FROM assessment_versions WHERE version_code = ?').get('V1');
  if (version) return version.id;

  const info = await db.prepare(`
    INSERT INTO assessment_versions (version_code, name, description, is_active)
    VALUES ('V1', 'Grade 10 Guidance Battery V1 (MVP)', 'Fixed-form: 12 aptitude, 18 RIASEC, 14 work-style items + 10 parent inventory items (8 perception, 2 expectation). NOT a validated psychometric instrument — see docs/PSYCHOMETRIC_LIMITATIONS.md.', 1)
  `).run();
  const versionId = Number(info.lastInsertRowid);

  const questions = buildQuestionBank();
  const insQ = db.prepare(`
    INSERT INTO questions (version_id, module, category, difficulty, question_text, question_type, dimension, display_order, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
  `);
  const insOpt = db.prepare(`
    INSERT INTO question_options (question_id, option_key, option_text, score_value, dimension_target, display_order)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  await transaction(async () => {
    let displayOrder = 0;
    for (const q of questions) {
      displayOrder += 1;
      const qInfo = await insQ.run(
        versionId, q.module, q.category, q.difficulty ?? null, q.question_text,
        q.question_type, q.dimension, displayOrder
      );
      const qId = Number(qInfo.lastInsertRowid);
      for (let idx = 0; idx < q.options.length; idx++) {
        const opt = q.options[idx];
        await insOpt.run(qId, opt.key, opt.text, opt.score ?? 0, q.dimension, idx + 1);
      }
    }
  });
  console.log(`[seed] battery V1: ${questions.length} questions`);
  return versionId;
}

async function seedScoringRules(versionId) {
  const row = await db.prepare('SELECT COUNT(*) AS c FROM scoring_rules WHERE version_id = ?').get(versionId);
  if (Number(row?.c) > 0) return;
  const ins = db.prepare(`
    INSERT INTO scoring_rules (version_id, stream_id, stream_name, weight_config_json, is_active)
    VALUES (?, ?, ?, ?, 1)
  `);
  await transaction(async () => {
    for (const profile of Object.values(STREAM_PROFILES)) {
      await ins.run(versionId, profile.stream_id, profile.stream_name,
        JSON.stringify({ weights: profile.weights, career_clusters: profile.career_clusters, curriculum_boards: profile.curriculum_boards }));
    }
  });
  console.log('[seed] scoring rules: 7 stream profiles');
}

async function seedScoringConfig() {
  const row = await db.prepare('SELECT key FROM admin_settings WHERE key = ?').get('scoring_config');
  if (row) return;
  await db.prepare(`
    INSERT INTO admin_settings (key, value_json, description) VALUES ('scoring_config', ?, ?)
  `).run(JSON.stringify(DEFAULT_SCORING_CONFIG), 'Default deterministic scoring configuration (product heuristics, not validated parameters)');
  console.log('[seed] scoring config: defaults stored');
}

async function seedPrompts() {
  const row = await db.prepare('SELECT COUNT(*) AS c FROM prompt_versions').get();
  if (Number(row?.c) > 0) return;
  const ins = db.prepare(`
    INSERT INTO prompt_versions (prompt_type, version_code, system_prompt, user_template, is_active)
    VALUES (?, ?, ?, ?, 1)
  `);
  await transaction(async () => {
    for (const [type, seed] of Object.entries(PROMPT_SEEDS)) {
      await ins.run(type, seed.version_code, seed.system_prompt, seed.user_template);
    }
  });
  console.log('[seed] prompt versions: 3 templates');
}

async function seedDemoData(versionId) {
  if (!env.SEED_DEMO_DATA) {
    console.log('[seed] demo data disabled (SEED_DEMO_DATA=false)');
    return;
  }

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  // ---- Admin ----
  let admin = await db.prepare('SELECT * FROM users WHERE email = ?').get(DEMO_ADMIN_EMAIL);
  if (!admin) {
    const id = await db.prepare("INSERT INTO users (email, role, password_hash, is_active, is_demo) VALUES (?, 'admin', ?, 1, 1)").run(DEMO_ADMIN_EMAIL, passwordHash);
    admin = { id: Number(id.lastInsertRowid) };
  }

  // ---- Student ----
  let student = await db.prepare('SELECT s.* FROM students s JOIN users u ON s.user_id = u.id WHERE u.email = ?').get(DEMO_STUDENT_EMAIL);
  if (!student) {
    const userId = await db.prepare("INSERT INTO users (email, phone, role, password_hash, is_active, is_demo) VALUES (?, '+910000000001', 'candidate', ?, 1, 1)").run(DEMO_STUDENT_EMAIL, passwordHash);
    const studentId = await db.prepare(`
      INSERT INTO students (user_id, full_name, grade, school_name, board, student_code, profile_completed, is_demo)
      VALUES (?, 'Aarav (DEMO)', 10, 'Demo Public School', 'CBSE', 'PC-DEMOSTU1', 1, 1)
    `).run(Number(userId.lastInsertRowid));
    student = await db.prepare('SELECT * FROM students WHERE id = ?').get(Number(studentId.lastInsertRowid));
  }

  // ---- Parent ----
  let parent = await db.prepare('SELECT p.* FROM parents p JOIN users u ON p.user_id = u.id WHERE u.email = ?').get(DEMO_PARENT_EMAIL);
  if (!parent) {
    const userId = await db.prepare("INSERT INTO users (email, phone, role, password_hash, is_active, is_demo) VALUES (?, '+910000000002', 'parent', ?, 1, 1)").run(DEMO_PARENT_EMAIL, passwordHash);
    const parentId = await db.prepare(`
      INSERT INTO parents (user_id, full_name, phone, relationship, is_demo)
      VALUES (?, 'Sunita (DEMO)', '+910000000002', 'Mother', 1)
    `).run(Number(userId.lastInsertRowid));
    parent = await db.prepare('SELECT * FROM parents WHERE id = ?').get(Number(parentId.lastInsertRowid));
  }

  // ---- Pre-approved demo link (models a completed consent flow) ----
  const mapping = await db.prepare('SELECT * FROM student_parent_mapping WHERE student_id = ? AND parent_id = ?').get(student.id, parent.id);
  if (!mapping) {
    await db.prepare(`
      INSERT INTO student_parent_mapping (student_id, parent_id, status, requested_by, student_consented_at, linked_at)
      VALUES (?, ?, 'linked', 'admin', datetime('now'), datetime('now'))
    `).run(student.id, parent.id);
  }

  // ---- Completed demo assessment THROUGH THE REAL ENGINES ----
  const existingAssessment = await db.prepare('SELECT id FROM assessments WHERE student_id = ?').get(student.id);
  if (!existingAssessment) {
    const assessmentId = await assessmentRepository.createAssessment({ studentId: student.id, versionId });
    const questions = await db.prepare('SELECT * FROM questions WHERE version_id = ? AND is_active = 1').all(versionId);
    const insResp = db.prepare(`
      INSERT INTO responses (assessment_id, question_id, respondent_type, selected_option_id, numeric_value, response_time_ms)
      VALUES (?, ?, 'student', ?, ?, ?)
    `);

    // Deterministic demo answer pattern: strong numerical/abstract, investigative profile.
    const likertAnswers = {
      R: [4, 4, 3], I: [5, 5, 4], A: [3, 2, 3], S: [3, 4, 3], E: [4, 3, 3], C: [4, 4, 4],
      persistence: [4, 4], focus: [4, 3], conscientiousness: [4, 4], curiosity: [5, 4],
      stress_resilience: [4, 3], deliberate_practice: [4, 4], response_to_failure: [4, 4]
    };
    const likertCounters = {};

    await transaction(async () => {
      for (const q of questions) {
        if (q.module === 'aptitude') {
          const opts = await db.prepare('SELECT * FROM question_options WHERE question_id = ? ORDER BY display_order').all(q.id);
          // Demo pattern: answer correctly on easy/medium, incorrectly on 'hard' numerical & data items.
          const correct = opts.find(o => o.score_value > 0);
          const wrong = opts.find(o => o.score_value === 0);
          const pick = (q.difficulty === 'hard' && ['numerical', 'data'].includes(q.dimension) && wrong) ? wrong : (correct || opts[0]);
          await insResp.run(assessmentId, q.id, pick.id, pick.score_value, 25000);
        } else if (q.module === 'riasec' || q.module === 'grit') {
          const list = likertAnswers[q.dimension] || [4, 4];
          const idx = likertCounters[q.dimension] = (likertCounters[q.dimension] ?? -1) + 1;
          const score = list[idx % list.length];
          const opt = await db.prepare('SELECT * FROM question_options WHERE question_id = ? AND score_value = ?').get(q.id, score)
            || await db.prepare('SELECT * FROM question_options WHERE question_id = ? ORDER BY display_order LIMIT 1').get(q.id);
          await insResp.run(assessmentId, q.id, opt.id, opt.score_value, 12000);
        }
      }
    });

    const assessmentRow = await assessmentRepository.getAssessmentById(assessmentId);
    await scoreAssessment(assessmentRow);
    await assessmentRepository.completeAssessmentRow(assessmentId);
    console.log(`[seed] demo assessment completed through deterministic engines (assessment ${assessmentId})`);

    // Generate the three reports via the REAL report pipeline (offline provider).
    const refreshed = await assessmentRepository.getAssessmentById(assessmentId);
    const assessmentService = require('../src/services/assessmentService');
    const { generateReport } = require('../src/services/reports/reportService');
    const canonical = await assessmentService.assembleResult(refreshed);
    for (const reportType of ['candidate', 'parent', 'counselor']) {
      await generateReport({ assessmentId, reportType, canonicalResult: canonical, userId: admin.id });
    }
    console.log('[seed] demo reports generated (candidate/parent/counselor)');
  }
}

async function seedDatabase() {
  await runMigrations();
  const versionId = await seedBattery();
  await seedScoringRules(versionId);
  await seedScoringConfig();
  await seedPrompts();
  await seedV2Bank();
  await seedDemoData(versionId);
  // PRIVACY: never log credentials — not even demo ones. Documented in README.
  console.log('[seed] done. Demo accounts (if enabled):');
  console.log('  admin:    admin@demo.psychometric-ai.local');
  console.log('  student:  aarav@demo.psychometric-ai.local');
  console.log('  parent:   sunita@demo.psychometric-ai.local');
  console.log('  (demo passwords are set by the DEMO_PASSWORD constant / .env, never logged)');
}

module.exports = { seedDatabase, DEMO_PASSWORD };

if (require.main === module) {
  seedDatabase().then(() => process.exit(0)).catch(err => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
}
