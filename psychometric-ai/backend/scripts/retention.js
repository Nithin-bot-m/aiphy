// retentionJob — data-retention enforcement (DPDP Act 2023 §8(7): erase when
// purpose is served) + subject-rights support (access / erasure).
//
// Schedule (days, env, 0 = keep forever):
//   RETENTION_LLM_DAYS         llm_requests/llm_responses  (default 180)
//   RETENTION_AUDIT_DAYS       audit_logs                  (default 365)
//   RETENTION_OUTBOX_DAYS      notification_outbox         (default 90)
//   RETENTION_INCOMPLETE_DAYS  abandoned in_progress assessments (default 0 = keep)
//
// The job NEVER deletes: completed assessments, scores, reports (the product's
// source of truth), users, or parent mappings. It only prunes operational/
// audit exhaust whose retention window has elapsed.
//
// Run modes:
//   node backend/scripts/retention.js            # apply
//   node backend/scripts/retention.js --dry-run  # report only
//   admin endpoint POST /api/admin/retention/run # apply + audit

const env = require('../src/config/env');
const { db } = require('../src/config/db');

function cutoff(days) {
  if (!days || days <= 0) return null;
  return new Date(Date.now() - days * 86400_000).toISOString().slice(0, 19).replace('T', ' ');
}

async function countOld(table, dateColumn, cutoffTs, extraWhere = '') {
  if (!cutoffTs) return 0;
  const row = await db.prepare(`SELECT COUNT(*) AS c FROM ${table} WHERE ${dateColumn} < ? ${extraWhere}`).get(cutoffTs);
  return Number(row?.c || 0);
}

/**
 * Run the retention job.
 * @param {{ dryRun?: boolean }} opts
 * @returns {{ dryRun: boolean, deleted: Record<string, number>, kept: string[] }}
 */
async function runRetentionJob({ dryRun = false } = {}) {
  const deleted = {};
  const kept = [];
  const llmCutoff = cutoff(env.RETENTION_LLM_DAYS);
  const auditCutoff = cutoff(env.RETENTION_AUDIT_DAYS);
  const outboxCutoff = cutoff(env.RETENTION_OUTBOX_DAYS);
  const incompleteCutoff = cutoff(env.RETENTION_INCOMPLETE_DAYS);

  // ---- LLM audit exhaust (responses first — FK to requests) ----
  if (llmCutoff) {
    if (dryRun) {
      deleted.llm_responses = await countOld('llm_responses', 'created_at', llmCutoff);
      deleted.llm_requests = await countOld('llm_requests', 'created_at', llmCutoff);
    } else {
      const r = await db.prepare('DELETE FROM llm_responses WHERE created_at < ?').run(llmCutoff);
      const q = await db.prepare('DELETE FROM llm_requests WHERE created_at < ?').run(llmCutoff);
      deleted.llm_responses = Number(r.changes);
      deleted.llm_requests = Number(q.changes);
    }
  } else kept.push('llm_requests/llm_responses (RETENTION_LLM_DAYS=0)');

  // ---- Audit logs ----
  if (auditCutoff) {
    if (dryRun) {
      deleted.audit_logs = await countOld('audit_logs', 'created_at', auditCutoff);
    } else {
      const r = await db.prepare('DELETE FROM audit_logs WHERE created_at < ?').run(auditCutoff);
      deleted.audit_logs = Number(r.changes);
    }
  } else kept.push('audit_logs (RETENTION_AUDIT_DAYS=0)');

  // ---- Notification outbox ----
  if (outboxCutoff) {
    if (dryRun) {
      deleted.notification_outbox = await countOld('notification_outbox', 'created_at', outboxCutoff);
    } else {
      const r = await db.prepare('DELETE FROM notification_outbox WHERE created_at < ?').run(outboxCutoff);
      deleted.notification_outbox = Number(r.changes);
    }
  } else kept.push('notification_outbox (RETENTION_OUTBOX_DAYS=0)');

  // ---- Abandoned incomplete assessments (opt-in; default off) ----
  if (incompleteCutoff) {
    if (dryRun) {
      deleted.assessments_incomplete = await countOld('assessments', 'started_at', incompleteCutoff, "AND status = 'in_progress'");
    } else {
      // Responses cascade via FK; scores only exist for completed assessments.
      const rows = await db.prepare("SELECT id FROM assessments WHERE status = 'in_progress' AND started_at < ?").all(incompleteCutoff);
      let n = 0;
      for (const row of rows) {
        const r = await db.prepare("DELETE FROM assessments WHERE id = ? AND status = 'in_progress'").run(row.id);
        n += Number(r.changes);
      }
      deleted.assessments_incomplete = n;
    }
  } else kept.push('incomplete assessments (RETENTION_INCOMPLETE_DAYS=0)');

  return { dryRun, deleted, kept };
}

/**
 * DPDP data-principal access: assemble every row tied to a user.
 * Returns a portable JSON object (no scores fabrication — verbatim rows).
 */
async function exportUserData(userId) {
  const user = await db.prepare('SELECT id, email, phone, role, is_active, is_demo, email_verified, deletion_requested_at, created_at, last_login_at FROM users WHERE id = ?').get(userId);
  if (!user) return null;

  const export_ = { exported_at: new Date().toISOString(), user, students: [], parents: [], mappings: [], assessments: [] };

  if (user.role === 'candidate') {
    export_.students = await db.prepare('SELECT * FROM students WHERE user_id = ?').all(userId);
    const studentIds = export_.students.map(s => s.id);
    for (const sid of studentIds) {
      export_.mappings.push(...await db.prepare('SELECT * FROM student_parent_mapping WHERE student_id = ?').all(sid));
      const assessments = await db.prepare('SELECT * FROM assessments WHERE student_id = ?').all(sid);
      for (const a of assessments) {
        const detail = { ...a };
        detail.responses = await db.prepare('SELECT question_id, respondent_type, selected_option_id, numeric_value, created_at FROM responses WHERE assessment_id = ?').all(a.id);
        detail.aptitude_scores = await db.prepare('SELECT * FROM aptitude_scores WHERE assessment_id = ?').all(a.id);
        detail.riasec_scores = await db.prepare('SELECT * FROM riasec_scores WHERE assessment_id = ?').all(a.id);
        detail.grit_scores = await db.prepare('SELECT * FROM grit_scores WHERE assessment_id = ?').all(a.id);
        detail.stream_scores = await db.prepare('SELECT stream_id, stream_name, fit_score, fit_band, rank_order FROM stream_scores WHERE assessment_id = ?').all(a.id);
        detail.reports = await db.prepare('SELECT report_type, title, status, model, structured_input_hash, generated_at FROM reports WHERE assessment_id = ?').all(a.id);
        try {
          detail.v2_responses = await db.prepare('SELECT item_id, respondent_type, selected_option_id, numeric_value, created_at FROM v2_responses WHERE assessment_id = ?').all(a.id);
          detail.v2_scoring_results = await db.prepare('SELECT summary_json, computed_at FROM v2_scoring_results WHERE assessment_id = ?').all(a.id);
          detail.v2_counsellor_maps = await db.prepare('SELECT status, map_json, updated_at FROM v2_counsellor_maps WHERE assessment_id = ?').all(a.id);
        } catch {
          // V2 tables may be absent in minimal unit fixtures
        }
        export_.assessments.push(detail);
      }
    }
  }

  if (user.role === 'parent') {
    export_.parents = await db.prepare('SELECT * FROM parents WHERE user_id = ?').all(userId);
    const parentIds = export_.parents.map(p => p.id);
    for (const pid of parentIds) {
      export_.mappings.push(...await db.prepare('SELECT * FROM student_parent_mapping WHERE parent_id = ?').all(pid));
      export_.assessments.push(...await db.prepare('SELECT * FROM parent_expectations WHERE parent_id = ?').all(pid));
      export_.assessments.push(...await db.prepare('SELECT * FROM parent_perceptions WHERE parent_id = ?').all(pid));
      try {
        export_.assessments.push(...await db.prepare('SELECT * FROM v2_parent_sessions WHERE parent_id = ?').all(pid));
      } catch { /* optional */ }
    }
  }

  return export_;
}

/**
 * DPDP erasure: anonymize identity data while PRESERVING psychometric records
 * (aggregate integrity + report reproducibility). Irreversible.
 */
async function eraseUserData(userId) {
  const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) return null;

  const anonymized = `deleted-user-${userId}@anonymized.invalid`;
  const suffix = ` (erased ${new Date().toISOString().slice(0, 10)})`;

  await db.prepare(`
    UPDATE users SET email = ?, phone = NULL, otp_code_hash = NULL, otp_expires_at = NULL,
      is_active = 0, verification_token_hash = NULL, verification_expires_at = NULL,
      reset_token_hash = NULL, reset_expires_at = NULL, updated_at = datetime('now')
    WHERE id = ?
  `).run(anonymized, userId);

  if (user.role === 'candidate') {
    await db.prepare(`
      UPDATE students SET full_name = 'Erased User', dob = NULL, school_name = NULL,
        profile_completed = profile_completed, updated_at = datetime('now')
      WHERE user_id = ?
    `).run(userId);
  }
  if (user.role === 'parent') {
    await db.prepare(`
      UPDATE parents SET full_name = 'Erased Parent', phone = NULL, occupation = NULL, updated_at = datetime('now')
      WHERE user_id = ?
    `).run(userId);
  }

  // Scrub free-text comments from parent inventory rows linked to this parent.
  const parentRow = await db.prepare('SELECT id FROM parents WHERE user_id = ?').get(userId);
  if (parentRow) {
    await db.prepare("UPDATE parent_expectations SET comments = NULL, updated_at = datetime('now') WHERE parent_id = ?").run(parentRow.id);
  }

  // Scrub the user's audit trail PII (keep actions for security history).
  await db.prepare('UPDATE audit_logs SET details_json = ?, ip_address = NULL WHERE user_id = ?')
    .run(JSON.stringify({ note: 'erased' }) + suffix, userId);

  return { user_id: userId, anonymized_email: anonymized, preserved: 'assessment scores, reports, mappings (security history)' };
}

module.exports = { runRetentionJob, exportUserData, eraseUserData, cutoff };
