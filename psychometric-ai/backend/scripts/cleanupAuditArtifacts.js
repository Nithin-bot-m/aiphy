#!/usr/bin/env node
/**
 * Audit Artifact Cleanup Tool (Audit Report §13.1).
 *
 * Safely removes known synthetic test accounts and QA questions created during
 * pre-launch penetration testing without touching seeded demo accounts (`is_demo = 1`)
 * or genuine student records.
 *
 * Usage:
 *   node psychometric-ai/backend/scripts/cleanupAuditArtifacts.js --dry-run
 *   node psychometric-ai/backend/scripts/cleanupAuditArtifacts.js --apply
 *   node psychometric-ai/backend/scripts/cleanupAuditArtifacts.js --apply --emails a@b.com,c@d.com --question-ids 101,102
 */
require('dotenv').config();
const { db, transaction, DRIVER } = require('../src/config/db');

const DEFAULT_AUDIT_EMAIL_PATTERNS = [
  'audit%@%',
  'pentest%@%',
  'qa-test%@%',
  'xss-test%@%',
  'test_audit%@%'
];

function parseArgs(argv) {
  const apply = argv.includes('--apply');
  const getVal = (flag) => {
    const idx = argv.indexOf(flag);
    return idx !== -1 && argv[idx + 1] ? argv[idx + 1] : '';
  };
  const emails = getVal('--emails').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const questionIds = getVal('--question-ids').split(',').map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n > 0);
  return { dryRun: !apply, emails, questionIds };
}

async function main() {
  const { dryRun, emails, questionIds } = parseArgs(process.argv.slice(2));
  console.log(`[cleanup] driver=${DRIVER} mode=${dryRun ? 'DRY-RUN' : 'APPLY'}`);

  const candidateUsers = [];
  if (emails.length > 0) {
    for (const em of emails) {
      const u = await db.prepare('SELECT id, email, role, is_demo FROM users WHERE LOWER(email) = ? AND is_demo = 0 AND role != ?').get(em, 'admin');
      if (u) candidateUsers.push(u);
    }
  } else {
    for (const pat of DEFAULT_AUDIT_EMAIL_PATTERNS) {
      const rows = await db.prepare('SELECT id, email, role, is_demo FROM users WHERE LOWER(email) LIKE LOWER(?) AND is_demo = 0 AND role != ?').all(pat, 'admin');
      for (const r of rows) {
        if (!candidateUsers.some((x) => x.id === r.id)) candidateUsers.push(r);
      }
    }
  }

  console.log(`[cleanup] matched synthetic users: ${candidateUsers.length}`, candidateUsers.map((u) => `${u.id}:${u.email}`));
  console.log(`[cleanup] targeted question IDs to deactivate: ${questionIds.length ? questionIds.join(', ') : '(none)'}`);

  if (dryRun) {
    console.log('[cleanup] dry-run complete — pass --apply to delete synthetic users and hide specified QA questions.');
    process.exit(0);
  }

  await transaction(async () => {
    for (const u of candidateUsers) {
      const student = await db.prepare('SELECT id FROM students WHERE user_id = ?').get(u.id);
      if (student) {
        const assessments = await db.prepare('SELECT id FROM assessments WHERE student_id = ?').all(student.id);
        for (const a of assessments) {
          await db.prepare('DELETE FROM reports WHERE assessment_id = ?').run(a.id);
          await db.prepare('DELETE FROM responses WHERE assessment_id = ?').run(a.id);
          await db.prepare('DELETE FROM v2_responses WHERE assessment_id = ?').run(a.id);
          await db.prepare('DELETE FROM v2_scoring_results WHERE assessment_id = ?').run(a.id);
          await db.prepare('DELETE FROM v2_counsellor_maps WHERE assessment_id = ?').run(a.id);
          await db.prepare('DELETE FROM assessments WHERE id = ?').run(a.id);
        }
        await db.prepare('DELETE FROM student_parent_mapping WHERE student_id = ?').run(student.id);
        await db.prepare('DELETE FROM students WHERE id = ?').run(student.id);
      }
      const parent = await db.prepare('SELECT id FROM parents WHERE user_id = ?').get(u.id);
      if (parent) {
        await db.prepare('DELETE FROM student_parent_mapping WHERE parent_id = ?').run(parent.id);
        await db.prepare('DELETE FROM parents WHERE id = ?').run(parent.id);
      }
      await db.prepare('DELETE FROM audit_logs WHERE user_id = ?').run(u.id);
      await db.prepare('DELETE FROM users WHERE id = ?').run(u.id);
    }

    for (const qid of questionIds) {
      await db.prepare('UPDATE questions SET is_active = 0 WHERE id = ?').run(qid);
    }
  });

  console.log('[cleanup] applied successfully.');
}

main().catch((err) => {
  console.error('[cleanup] failed:', err);
  process.exit(1);
});

