// Admin controller — dashboard, question bank, scoring config, prompts, audit,
// LLM usage/quota, data governance (retention, subject access & erasure).
const { db, transaction } = require('../config/db');
const { getScoringConfig, saveScoringConfig } = require('../services/configService');
const llmQuota = require('../services/llm/llmQuota');
const retention = require('../../scripts/retention');
const { asyncHandler, badRequest, notFound } = require('../utils/helpers');
const { logAudit } = require('../middleware/auditLogger');
const { STREAM_KEYS } = require('../config/constants');

// ---------- Dashboard (spec §21) ----------
exports.getDashboard = asyncHandler(async (req, res) => {
  const count = async (sql) => Number((await db.prepare(sql).get())?.c || 0);
  const totals = {
    candidates: await count('SELECT COUNT(*) AS c FROM students'),
    parents: await count('SELECT COUNT(*) AS c FROM parents'),
    assessments: await count('SELECT COUNT(*) AS c FROM assessments'),
    completed_assessments: await count("SELECT COUNT(*) AS c FROM assessments WHERE status = 'completed'"),
    reports_generated: await count('SELECT COUNT(*) AS c FROM reports')
  };
  totals.completion_rate = totals.assessments > 0
    ? Math.round((totals.completed_assessments / totals.assessments) * 100)
    : 0;

  const streamDistribution = await db.prepare(`
    SELECT stream_name, COUNT(*) AS count FROM stream_scores WHERE rank_order = 1 GROUP BY stream_name ORDER BY count DESC
  `).all();
  const riasecDistribution = await db.prepare(`
    SELECT holland_code, COUNT(*) AS count FROM riasec_scores GROUP BY holland_code ORDER BY count DESC LIMIT 12
  `).all();
  const alignmentDistribution = await db.prepare(`
    SELECT alignment_status, COUNT(*) AS count FROM congruence_scores GROUP BY alignment_status
  `).all();
  const avgAptitude = await db.prepare(`
    SELECT ROUND(CAST(AVG(numerical_idx) AS numeric),1) AS numerical, ROUND(CAST(AVG(abstract_idx) AS numeric),1) AS abstract,
           ROUND(CAST(AVG(verbal_idx) AS numeric),1) AS verbal, ROUND(CAST(AVG(spatial_idx) AS numeric),1) AS spatial,
           ROUND(CAST(AVG(logical_idx) AS numeric),1) AS logical, ROUND(CAST(AVG(data_idx) AS numeric),1) AS data,
           ROUND(CAST(AVG(overall_idx) AS numeric),1) AS overall
    FROM aptitude_scores
  `).get();
  const avgGrit = await db.prepare('SELECT ROUND(CAST(AVG(composite_score) AS numeric),2) AS composite, ROUND(CAST(AVG(normalized_index) AS numeric),1) AS normalized_index FROM grit_scores').get();

  // Question analytics (spec §21): attempts & correctness per question.
  const questionAnalytics = await db.prepare(`
    SELECT q.id, q.module, q.dimension, q.difficulty, q.category,
           COUNT(r.id) AS attempts,
           SUM(CASE WHEN q.module = 'aptitude' AND COALESCE(o.score_value, r.numeric_value, 0) > 0 THEN 1 ELSE 0 END) AS correct
    FROM questions q
    LEFT JOIN responses r ON r.question_id = q.id
    LEFT JOIN question_options o ON r.selected_option_id = o.id
    WHERE q.is_active = 1
    GROUP BY q.id ORDER BY attempts DESC
  `).all();

  const versions = await db.prepare(`
    SELECT v.id, v.version_code, v.name, v.is_active, v.created_at,
           CASE WHEN v.version_code = 'V2'
             THEN (SELECT COUNT(*) FROM v2_items vi WHERE vi.version_id = v.id AND vi.is_active = 1)
             ELSE (SELECT COUNT(*) FROM questions q WHERE q.version_id = v.id AND q.is_active = 1)
           END AS question_count
    FROM assessment_versions v ORDER BY v.id DESC
  `).all();

  res.json({
    summary: totals,
    stream_distribution: streamDistribution,
    riasec_distribution: riasecDistribution,
    alignment_distribution: alignmentDistribution,
    average_aptitude: avgAptitude,
    average_grit: avgGrit,
    question_analytics: questionAnalytics,
    assessment_versions: versions
  });
});

// ---------- Candidates ----------
exports.getCandidates = asyncHandler(async (req, res) => {
  const rows = await db.prepare(`
    SELECT s.id, s.full_name, s.grade, s.school_name, s.board, s.student_code, s.is_demo, s.created_at,
           u.email, u.phone,
           (SELECT a.id FROM assessments a WHERE a.student_id = s.id AND a.status = 'completed' ORDER BY a.id DESC LIMIT 1) AS latest_completed_assessment_id,
           (SELECT av.version_code FROM assessments a JOIN assessment_versions av ON a.version_id = av.id WHERE a.student_id = s.id AND a.status = 'completed' ORDER BY a.id DESC LIMIT 1) AS version_code,
           (SELECT ss.stream_name FROM stream_scores ss WHERE ss.assessment_id = (SELECT a.id FROM assessments a WHERE a.student_id = s.id AND a.status = 'completed' ORDER BY a.id DESC LIMIT 1) AND ss.rank_order = 1) AS top_stream,
           (SELECT cs.congruence_pct FROM congruence_scores cs WHERE cs.assessment_id = (SELECT a.id FROM assessments a WHERE a.student_id = s.id AND a.status = 'completed' ORDER BY a.id DESC LIMIT 1)) AS congruence_pct,
           (SELECT v2r.summary_json FROM v2_scoring_results v2r WHERE v2r.assessment_id = (SELECT a.id FROM assessments a WHERE a.student_id = s.id AND a.status = 'completed' ORDER BY a.id DESC LIMIT 1)) AS v2_summary_json,
           (SELECT v2m.status FROM v2_counsellor_maps v2m WHERE v2m.assessment_id = (SELECT a.id FROM assessments a WHERE a.student_id = s.id AND a.status = 'completed' ORDER BY a.id DESC LIMIT 1)) AS counsellor_map_status
    FROM students s JOIN users u ON s.user_id = u.id
    ORDER BY s.id DESC
  `).all();
  const candidates = rows.map(({ v2_summary_json, ...rest }) => {
    let v2Summary = null;
    if (v2_summary_json) {
      try { v2Summary = JSON.parse(v2_summary_json); } catch { /* ignore */ }
    }
    const v2TopCluster = v2Summary?.top5?.[0] || null;
    return {
      ...rest,
      top_stream: rest.top_stream || v2Summary?.streams_10?.[0]?.name || v2TopCluster || null,
      v2_riasec_code: v2Summary?.riasec_code || null,
      v2_top_clusters: v2Summary?.top5 || null
    };
  });
  res.json({ candidates });
});

// ---------- Question bank ----------
exports.getQuestions = asyncHandler(async (req, res) => {
  const { module, difficulty, version_id } = req.query;
  let sql = 'SELECT * FROM questions WHERE 1=1';
  const params = [];
  if (module) { sql += ' AND module = ?'; params.push(module); }
  if (difficulty) { sql += ' AND difficulty = ?'; params.push(difficulty); }
  if (version_id) { sql += ' AND version_id = ?'; params.push(Number(version_id)); }
  sql += ' ORDER BY version_id, module, display_order, id';
  const questions = await db.prepare(sql).all(...params);
  res.json({ questions });
});

function validateQuestionPayload(body, { partial = false } = {}) {
  const MODULES = ['aptitude', 'riasec', 'grit', 'parent_perception', 'parent_expectation'];
  const TYPES = ['single_choice', 'likert_5', 'categorical'];
  const DIFFICULTIES = ['easy', 'medium', 'hard'];
  const out = {};

  if (!partial || body.module !== undefined) {
    if (!MODULES.includes(body.module)) throw badRequest('Invalid module.');
    out.module = body.module;
  }
  if (!partial || body.question_text !== undefined) {
    if (typeof body.question_text !== 'string' || body.question_text.trim().length < 8) throw badRequest('question_text too short.');
    out.question_text = body.question_text.trim().slice(0, 2000);
  }
  if (!partial || body.question_type !== undefined) {
    if (!TYPES.includes(body.question_type)) throw badRequest('Invalid question_type.');
    out.question_type = body.question_type;
  }
  if (!partial || body.dimension !== undefined) {
    if (typeof body.dimension !== 'string' || !body.dimension.trim()) throw badRequest('dimension required.');
    out.dimension = body.dimension.trim().toLowerCase();
  }
  if (body.category !== undefined) out.category = String(body.category).slice(0, 120);
  if (body.difficulty !== undefined) {
    if (body.difficulty !== null && !DIFFICULTIES.includes(body.difficulty)) throw badRequest('Invalid difficulty.');
    out.difficulty = body.difficulty;
  }
  return out;
}

exports.createQuestion = asyncHandler(async (req, res) => {
  const version = await db.prepare('SELECT id FROM assessment_versions WHERE is_active = 1 ORDER BY id DESC LIMIT 1').get();
  if (!version) throw badRequest('No active assessment version.');
  const data = validateQuestionPayload(req.body);
  const { options } = req.body;

  if (!Array.isArray(options) || options.length < 2 || options.length > 8) {
    throw badRequest('Between 2 and 8 options are required.');
  }
  for (const opt of options) {
    if (typeof opt.option_text !== 'string' || !opt.option_text.trim()) throw badRequest('Each option needs option_text.');
    const sv = Number(opt.score_value || 0);
    if (!Number.isFinite(sv)) throw badRequest('option score_value must be numeric.');
  }

  const qId = await transaction(async () => {
    const info = await db.prepare(`
      INSERT INTO questions (version_id, module, category, difficulty, question_text, question_type, dimension, display_order, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?,
        COALESCE((SELECT MAX(display_order) + 1 FROM questions WHERE version_id = ? AND module = ?), 1), 1)
    `).run(version.id, data.module, data.category || data.module, data.difficulty ?? null,
      data.question_text, data.question_type, data.dimension, version.id, data.module);
    const newQId = Number(info.lastInsertRowid);
    const insOpt = db.prepare('INSERT INTO question_options (question_id, option_key, option_text, score_value, display_order) VALUES (?, ?, ?, ?, ?)');
    for (let idx = 0; idx < options.length; idx++) {
      const opt = options[idx];
      await insOpt.run(newQId, opt.option_key || String.fromCharCode(65 + idx), opt.option_text.trim().slice(0, 500), Number(opt.score_value || 0), idx + 1);
    }
    return newQId;
  });

  await logAudit(req, 'CREATE_QUESTION', 'QUESTION', qId, { module: data.module });
  res.status(201).json({ question_id: qId });
});

exports.updateQuestion = asyncHandler(async (req, res) => {
  const existing = await db.prepare('SELECT * FROM questions WHERE id = ?').get(Number(req.params.id));
  if (!existing) throw notFound('Question not found.');
  const data = validateQuestionPayload(req.body, { partial: true });

  // Immutability rule: questions used by completed assessments are versioned by
  // deactivating + creating a new row, never silently rewritten.
  const usedRow = await db.prepare(`
    SELECT COUNT(*) AS c FROM responses r JOIN assessments a ON r.assessment_id = a.id
    WHERE r.question_id = ? AND a.status = 'completed'
  `).get(existing.id);
  const usedByCompleted = Number(usedRow?.c || 0) > 0;

  if (usedByCompleted) {
    if (Object.keys(data).some(k => k !== 'is_active')) {
      throw badRequest('This question is referenced by completed assessments. It is now locked; create a new question version instead (deactivate this one and add a new row).', 'QUESTION_LOCKED');
    }
  }

  const sets = [];
  const params = [];
  for (const [k, v] of Object.entries(data)) { sets.push(`${k} = ?`); params.push(v); }
  if (sets.length === 0) throw badRequest('No updatable fields provided.');
  sets.push("updated_at = datetime('now')");
  params.push(existing.id);
  await db.prepare(`UPDATE questions SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  await logAudit(req, 'UPDATE_QUESTION', 'QUESTION', existing.id, { fields: Object.keys(data) });
  res.json({ message: 'Question updated.' });
});

exports.toggleQuestion = asyncHandler(async (req, res) => {
  const existing = await db.prepare('SELECT * FROM questions WHERE id = ?').get(Number(req.params.id));
  if (!existing) throw notFound('Question not found.');
  await db.prepare("UPDATE questions SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END, updated_at = datetime('now') WHERE id = ?").run(existing.id);
  await logAudit(req, 'TOGGLE_QUESTION', 'QUESTION', existing.id, { new_state: existing.is_active ? 'inactive' : 'active' });
  res.json({ message: 'Question active state toggled.' });
});

// ---------- Scoring config ----------
exports.getScoringConfig = asyncHandler(async (req, res) => {
  res.json({ scoring_config: await getScoringConfig() });
});

exports.updateScoringConfig = asyncHandler(async (req, res) => {
  const { path, value } = req.body;
  if (typeof path !== 'string' || value === undefined) throw badRequest('Provide "path" (dot notation into scoring config) and "value".');
  const allowedRoots = ['difficulty_weights', 'fit_bands', 'congruence', 'riasec_tie_break_order', 'stream_tie_break'];
  const root = path.split('.')[0];
  if (!allowedRoots.includes(root)) throw badRequest(`Unknown config root "${root}". Allowed: ${allowedRoots.join(', ')}.`);

  const next = await saveScoringConfig(pathToObject(path, value));
  await logAudit(req, 'UPDATE_SCORING_CONFIG', 'ADMIN_SETTINGS', 'scoring_config', { path });
  res.json({ scoring_config: next });
});

function pathToObject(path, value) {
  const parts = path.split('.');
  const out = {};
  let node = out;
  for (let i = 0; i < parts.length - 1; i += 1) {
    node[parts[i]] = {};
    node = node[parts[i]];
  }
  node[parts[parts.length - 1]] = value;
  return out;
}

// ---------- Stream rules (versioned weights) ----------
async function defaultActiveVersionId() {
  const v1 = await db.prepare("SELECT id FROM assessment_versions WHERE version_code = 'V1' ORDER BY id DESC LIMIT 1").get();
  if (v1?.id) return v1.id;
  const row = await db.prepare('SELECT id FROM assessment_versions WHERE is_active = 1 ORDER BY id DESC LIMIT 1').get();
  return row?.id;
}

exports.toggleVersion = asyncHandler(async (req, res) => {
  const versionId = Number(req.params.id);
  if (!Number.isInteger(versionId) || versionId <= 0) throw badRequest('Valid version id required.');
  const existing = await db.prepare('SELECT * FROM assessment_versions WHERE id = ?').get(versionId);
  if (!existing) throw notFound('Assessment version not found.');

  const nextState = req.body?.is_active !== undefined
    ? (req.body.is_active ? 1 : 0)
    : (existing.is_active ? 0 : 1);

  if (nextState === 0) {
    const otherActive = await db.prepare('SELECT COUNT(*) AS c FROM assessment_versions WHERE is_active = 1 AND id != ?').get(versionId);
    if (Number(otherActive?.c || 0) === 0) {
      throw badRequest('At least one assessment version must remain active.');
    }
  }

  await db.prepare('UPDATE assessment_versions SET is_active = ? WHERE id = ?').run(nextState, versionId);
  const updated = await db.prepare('SELECT id, version_code, name, is_active, created_at FROM assessment_versions WHERE id = ?').get(versionId);
  await logAudit(req, 'TOGGLE_ASSESSMENT_VERSION', 'ASSESSMENT_VERSION', versionId, {
    version_code: existing.version_code,
    is_active: Boolean(nextState)
  });
  res.json({ version: updated });
});

exports.getStreamRules = asyncHandler(async (req, res) => {
  const versionId = Number(req.query.version_id) || (await defaultActiveVersionId());
  const rules = await db.prepare('SELECT * FROM scoring_rules WHERE version_id = ? ORDER BY stream_id').all(versionId);
  res.json({ version_id: versionId, rules });
});

exports.updateStreamRule = asyncHandler(async (req, res) => {
  const streamId = String(req.params.streamId || '').toLowerCase();
  if (!STREAM_KEYS.includes(streamId)) throw badRequest('Unknown stream id.');
  const versionId = Number(req.body.version_id) || (await defaultActiveVersionId());
  const { weights } = req.body;
  if (!weights || typeof weights !== 'object' || Object.keys(weights).length === 0) throw badRequest('weights object required.');

  const sum = Object.values(weights).reduce((s, v) => s + Number(v || 0), 0);
  if (!Number.isFinite(sum) || Math.abs(sum - 1) > 0.01) throw badRequest('Weights must sum to 1.00 (±0.01).');

  const existing = await db.prepare('SELECT * FROM scoring_rules WHERE version_id = ? AND stream_id = ?').get(versionId, streamId);
  if (!existing) throw notFound('No scoring rule row for this version/stream.');
  const parsed = JSON.parse(existing.weight_config_json || '{}');
  parsed.weights = weights;

  await db.prepare("UPDATE scoring_rules SET weight_config_json = ?, updated_at = datetime('now') WHERE id = ?")
    .run(JSON.stringify(parsed), existing.id);
  await logAudit(req, 'UPDATE_STREAM_WEIGHTS', 'SCORING_RULE', `${versionId}:${streamId}`, { weights });
  res.json({ message: 'Stream weights updated.', stream_id: streamId, version_id: versionId });
});

// ---------- Prompts ----------
exports.getPrompts = asyncHandler(async (req, res) => {
  const prompts = await db.prepare('SELECT id, prompt_type, version_code, is_active, created_at, updated_at, length(system_prompt) AS system_prompt_len FROM prompt_versions ORDER BY prompt_type, id').all();
  res.json({ prompts });
});

exports.getPromptDetail = asyncHandler(async (req, res) => {
  const prompt = await db.prepare('SELECT * FROM prompt_versions WHERE id = ?').get(Number(req.params.id));
  if (!prompt) throw notFound('Prompt not found.');
  res.json({ prompt });
});

/**
 * Prompt updates are VERSIONED: editing creates a new prompt_versions row and
 * deactivates the old one — prompt history is never rewritten (spec §7/§20).
 */
exports.updatePrompt = asyncHandler(async (req, res) => {
  const existing = await db.prepare('SELECT * FROM prompt_versions WHERE id = ?').get(Number(req.params.id));
  if (!existing) throw notFound('Prompt not found.');
  const { system_prompt, user_template } = req.body;
  if ((!system_prompt || typeof system_prompt !== 'string') && (!user_template || typeof user_template !== 'string')) {
    throw badRequest('Provide system_prompt and/or user_template.');
  }
  if (system_prompt && system_prompt.length < 40) throw badRequest('system_prompt too short.');
  if (user_template && user_template.length < 40) throw badRequest('user_template too short.');

  const nextCode = `${existing.version_code.replace(/-v\d+$/, '')}-v${Date.now()}`;
  const newId = await transaction(async () => {
    await db.prepare("UPDATE prompt_versions SET is_active = 0, updated_at = datetime('now') WHERE id = ?").run(existing.id);
    const info = await db.prepare(`
      INSERT INTO prompt_versions (prompt_type, version_code, system_prompt, user_template, is_active)
      VALUES (?, ?, ?, ?, 1)
    `).run(
      existing.prompt_type, nextCode,
      system_prompt || existing.system_prompt,
      user_template || existing.user_template
    );
    return Number(info.lastInsertRowid);
  });
  await logAudit(req, 'PROMPT_VERSION_CREATED', 'PROMPT', newId, { replaces: existing.id });
  res.status(201).json({ prompt_id: newId, version_code: nextCode });
});

// ---------- Audit logs ----------
exports.getAuditLogs = asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const action = req.query.action ? String(req.query.action) : null;
  const rows = action
    ? await db.prepare(`
        SELECT a.*, u.email, u.role FROM audit_logs a LEFT JOIN users u ON a.user_id = u.id
        WHERE a.action = ? ORDER BY a.id DESC LIMIT ? OFFSET ?
      `).all(action, limit, offset)
    : await db.prepare(`
        SELECT a.*, u.email, u.role FROM audit_logs a LEFT JOIN users u ON a.user_id = u.id
        ORDER BY a.id DESC LIMIT ? OFFSET ?
      `).all(limit, offset);
  res.json({ logs: rows, limit, offset });
});

// ---------- Export (permitted data only, admin-gated upstream) ----------
exports.exportData = asyncHandler(async (req, res) => {
  const { type } = req.params;
  if (type === 'candidates') {
    const data = await db.prepare(`
      SELECT s.id, s.full_name, s.grade, s.board, s.student_code, s.is_demo,
             u.email,
             (SELECT a.id FROM assessments a WHERE a.student_id = s.id AND a.status='completed' ORDER BY a.id DESC LIMIT 1) AS assessment_id,
             (SELECT overall_idx FROM aptitude_scores WHERE assessment_id = (SELECT a.id FROM assessments a WHERE a.student_id = s.id AND a.status='completed' ORDER BY a.id DESC LIMIT 1)) AS aptitude_overall_idx,
             (SELECT holland_code FROM riasec_scores WHERE assessment_id = (SELECT a.id FROM assessments a WHERE a.student_id = s.id AND a.status='completed' ORDER BY a.id DESC LIMIT 1)) AS holland_code,
             (SELECT composite_score FROM grit_scores WHERE assessment_id = (SELECT a.id FROM assessments a WHERE a.student_id = s.id AND a.status='completed' ORDER BY a.id DESC LIMIT 1)) AS grit_composite
      FROM students s JOIN users u ON s.user_id = u.id
      ORDER BY s.id
    `).all();
    await logAudit(req, 'EXPORT_CANDIDATES', 'ADMIN_EXPORT', 'candidates', { count: data.length });
    return res.json({ format: 'json', type: 'candidates', count: data.length, data });
  }
  if (type === 'audit') {
    const data = await db.prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 5000').all();
    await logAudit(req, 'EXPORT_AUDIT', 'ADMIN_EXPORT', 'audit', { count: data.length });
    return res.json({ format: 'json', type: 'audit', count: data.length, data });
  }
  throw badRequest('Unknown export type. Supported: candidates, audit.');
});

// ---------- LLM usage & quota (spend monitoring) ----------
exports.getLlmUsage = asyncHandler(async (req, res) => {
  res.json(await llmQuota.getUsageSummary());
});

// ---------- Data governance (DPDP subject rights + retention) ----------
exports.runRetention = asyncHandler(async (req, res) => {
  const dryRun = req.body?.dry_run === true;
  const result = await retention.runRetentionJob({ dryRun });
  await logAudit(req, dryRun ? 'RETENTION_DRY_RUN' : 'RETENTION_RUN', 'GOVERNANCE', 'retention', { deleted: result.deleted });
  res.json(result);
});

exports.exportUserData = asyncHandler(async (req, res) => {
  const userId = Number(req.params.id);
  if (!Number.isInteger(userId) || userId <= 0) throw badRequest('Valid user id required.');
  const data = await retention.exportUserData(userId);
  if (!data) throw notFound('User not found.');
  await logAudit(req, 'SUBJECT_ACCESS_EXPORT', 'USER', userId, {});
  res.json(data);
});

exports.eraseUserData = asyncHandler(async (req, res) => {
  const userId = Number(req.params.id);
  if (!Number.isInteger(userId) || userId <= 0) throw badRequest('Valid user id required.');
  const actingAdmin = req.user.id;
  if (actingAdmin === userId) throw badRequest('You cannot erase your own admin account.');
  const target = await db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!target) throw notFound('User not found.');
  if (target.role === 'admin') throw badRequest('Admin accounts cannot be erased via the API (provisioning change required).');

  const result = await retention.eraseUserData(userId);
  await logAudit(req, 'SUBJECT_ERASURE', 'USER', userId, { by: actingAdmin });
  res.json(result);
});
