// Portable SQLite + PostgreSQL repository for V2 psychometric tables.
const { db } = require('../config/db');

async function getItemsForVersion(versionId, { respondent = null } = {}) {
  if (respondent) {
    return await db.prepare(
      'SELECT * FROM v2_items WHERE version_id = ? AND is_active = 1 AND respondent = ? ORDER BY module ASC, display_order ASC, id ASC'
    ).all(versionId, respondent);
  }
  return await db.prepare(
    'SELECT * FROM v2_items WHERE version_id = ? AND is_active = 1 ORDER BY module ASC, display_order ASC, id ASC'
  ).all(versionId);
}

async function getItemsByIds(itemIds) {
  if (!itemIds || itemIds.length === 0) return [];
  const placeholders = itemIds.map(() => '?').join(',');
  const rows = await db.prepare(`SELECT * FROM v2_items WHERE id IN (${placeholders})`).all(...itemIds);
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  return itemIds.map((id) => byId[id]).filter(Boolean);
}

async function getItemById(id) {
  return await db.prepare('SELECT * FROM v2_items WHERE id = ?').get(id);
}

// ---------- Blueprints ----------
async function getBlueprint(assessmentId) {
  return await db.prepare('SELECT * FROM v2_assessment_blueprints WHERE assessment_id = ?').get(assessmentId);
}

async function upsertBlueprint({ assessmentId, grade, itemIds, pairLinks = null, m1Context = null, accommodations = null }) {
  await db.prepare(`
    INSERT INTO v2_assessment_blueprints (assessment_id, grade, item_ids_json, pair_links_json, m1_context_json, accommodations_json)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(assessment_id) DO UPDATE SET
      grade = excluded.grade,
      item_ids_json = excluded.item_ids_json,
      pair_links_json = COALESCE(excluded.pair_links_json, v2_assessment_blueprints.pair_links_json),
      m1_context_json = COALESCE(excluded.m1_context_json, v2_assessment_blueprints.m1_context_json),
      accommodations_json = COALESCE(excluded.accommodations_json, v2_assessment_blueprints.accommodations_json),
      updated_at = datetime('now')
  `).run(
    assessmentId,
    Number(grade),
    JSON.stringify(itemIds),
    pairLinks ? JSON.stringify(pairLinks) : null,
    m1Context ? JSON.stringify(m1Context) : null,
    accommodations ? JSON.stringify(accommodations) : null
  );
}

// ---------- Responses ----------
async function getV2Response(assessmentId, itemId, respondentType, parentId = null) {
  if (parentId === null || parentId === undefined) {
    return await db.prepare(`
      SELECT * FROM v2_responses
      WHERE assessment_id = ? AND item_id = ? AND respondent_type = ? AND parent_id IS NULL
    `).get(assessmentId, itemId, respondentType);
  }
  return await db.prepare(`
    SELECT * FROM v2_responses
    WHERE assessment_id = ? AND item_id = ? AND respondent_type = ? AND parent_id = ?
  `).get(assessmentId, itemId, respondentType, parentId);
}

async function upsertV2Response({
  assessmentId, itemId, respondentType = 'student', parentId = null,
  answerKey = null, numericValue = null, responseJson = null, responseText = null, responseTimeMs = 0
}) {
  const existing = await getV2Response(assessmentId, itemId, respondentType, parentId);
  if (existing) {
    await db.prepare(`
      UPDATE v2_responses
      SET answer_key = ?, numeric_value = ?, response_json = ?, response_text = ?,
          response_time_ms = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(answerKey, numericValue, responseJson, responseText, Number(responseTimeMs) || 0, existing.id);
    return existing.id;
  }
  const info = await db.prepare(`
    INSERT INTO v2_responses (assessment_id, item_id, respondent_type, parent_id, answer_key, numeric_value, response_json, response_text, response_time_ms)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(assessmentId, itemId, respondentType, parentId, answerKey, numericValue, responseJson, responseText, Number(responseTimeMs) || 0);
  return Number(info.lastInsertRowid);
}

async function listV2ResponsesJoined(assessmentId, respondentType = 'student', parentId = null) {
  if (parentId === null || parentId === undefined) {
    return await db.prepare(`
      SELECT r.*, it.external_id, it.module, it.respondent, it.sub, it.dim, it.field_name,
             it.item_type, it.grade_scope, it.difficulty, it.time_sec, it.scale_name,
             it.stem, it.options_json, it.answer_key AS item_answer_key, it.key_json, it.display_order
      FROM v2_responses r
      JOIN v2_items it ON r.item_id = it.id
      WHERE r.assessment_id = ? AND r.respondent_type = ? AND r.parent_id IS NULL
      ORDER BY it.module ASC, it.display_order ASC, it.id ASC
    `).all(assessmentId, respondentType);
  }
  return await db.prepare(`
    SELECT r.*, it.external_id, it.module, it.respondent, it.sub, it.dim, it.field_name,
           it.item_type, it.grade_scope, it.difficulty, it.time_sec, it.scale_name,
           it.stem, it.options_json, it.answer_key AS item_answer_key, it.key_json, it.display_order
    FROM v2_responses r
    JOIN v2_items it ON r.item_id = it.id
    WHERE r.assessment_id = ? AND r.respondent_type = ? AND r.parent_id = ?
    ORDER BY it.module ASC, it.display_order ASC, it.id ASC
  `).all(assessmentId, respondentType, parentId);
}

// ---------- V2 Scoring Results ----------
async function upsertV2ScoringResult({ assessmentId, result }) {
  await db.prepare(`
    INSERT INTO v2_scoring_results (
      assessment_id, grade, norm_status, validity_json, aptitude_json, personality_json,
      values_json, readiness_json, clusters_json, summary_json, canonical_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(assessment_id) DO UPDATE SET
      grade = excluded.grade,
      norm_status = excluded.norm_status,
      validity_json = excluded.validity_json,
      aptitude_json = excluded.aptitude_json,
      personality_json = excluded.personality_json,
      values_json = excluded.values_json,
      readiness_json = excluded.readiness_json,
      clusters_json = excluded.clusters_json,
      summary_json = excluded.summary_json,
      canonical_json = excluded.canonical_json,
      updated_at = datetime('now')
  `).run(
    assessmentId,
    Number(result.grade),
    result.norm_status,
    JSON.stringify(result.validity),
    JSON.stringify(result.aptitude),
    JSON.stringify({ personality: result.personality, thinking_styles: result.thinking_styles, eq_facets: result.eq_facets }),
    JSON.stringify({ rank: result.values_rank, scores: result.values_scores }),
    JSON.stringify(result.readiness),
    JSON.stringify(result.clusters),
    JSON.stringify({
      riasec_code: result.riasec_code,
      riasec: result.riasec,
      passion_type: result.passion_type,
      grit: result.grit,
      top5: result.top5,
      picks: result.picks,
      confidence: result.confidence,
      hidden_gems: result.hidden_gems,
      growth_paths: result.growth_paths,
      streams_10: result.streams_10,
      courses_12: result.courses_12,
      reality_check: result.reality_check
    }),
    JSON.stringify(result)
  );
}

async function getV2ScoringResult(assessmentId) {
  const row = await db.prepare('SELECT * FROM v2_scoring_results WHERE assessment_id = ?').get(assessmentId);
  if (!row) return null;
  return JSON.parse(row.canonical_json);
}

// ---------- Parent Module 8 Sessions ----------
async function getParentSession(assessmentId, parentId) {
  return await db.prepare(
    'SELECT * FROM v2_parent_sessions WHERE assessment_id = ? AND parent_id = ?'
  ).get(assessmentId, parentId);
}

async function listParentSessionsForAssessment(assessmentId) {
  return await db.prepare(
    'SELECT * FROM v2_parent_sessions WHERE assessment_id = ? ORDER BY parent_slot ASC, id ASC'
  ).all(assessmentId);
}

async function upsertParentSession({ assessmentId, parentId, parentSlot, itemIds, status = 'in_progress', summary = null, consentSensitive = 0 }) {
  const existing = await getParentSession(assessmentId, parentId);
  if (existing) {
    await db.prepare(`
      UPDATE v2_parent_sessions
      SET item_ids_json = ?, status = ?, summary_json = ?,
          completed_at = CASE WHEN ? = 'completed' THEN COALESCE(completed_at, datetime('now')) ELSE completed_at END,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(JSON.stringify(itemIds), status, summary ? JSON.stringify(summary) : existing.summary_json, status, existing.id);
    return existing.id;
  }
  const info = await db.prepare(`
    INSERT INTO v2_parent_sessions (assessment_id, parent_id, parent_slot, item_ids_json, status, student_consent_sensitive, summary_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(assessmentId, parentId, parentSlot, JSON.stringify(itemIds), status, consentSensitive ? 1 : 0, summary ? JSON.stringify(summary) : null);
  return Number(info.lastInsertRowid);
}

async function setParentSensitiveConsent(assessmentId, allowed) {
  await db.prepare(
    "UPDATE v2_parent_sessions SET student_consent_sensitive = ?, updated_at = datetime('now') WHERE assessment_id = ?"
  ).run(allowed ? 1 : 0, assessmentId);
}

// ---------- Counsellor Maps ----------
async function getCounsellorMap(assessmentId) {
  const row = await db.prepare('SELECT * FROM v2_counsellor_maps WHERE assessment_id = ?').get(assessmentId);
  if (!row) return null;
  return { ...row, map: JSON.parse(row.map_json) };
}

async function upsertCounsellorMap({ assessmentId, mapObj, model = 'deterministic', status = 'ready' }) {
  await db.prepare(`
    INSERT INTO v2_counsellor_maps (assessment_id, schema_version, map_json, model, status, generated_at)
    VALUES (?, 'counsellor_map_v1', ?, ?, ?, datetime('now'))
    ON CONFLICT(assessment_id) DO UPDATE SET
      map_json = excluded.map_json,
      model = excluded.model,
      status = excluded.status,
      generated_at = datetime('now'),
      updated_at = datetime('now')
  `).run(assessmentId, JSON.stringify(mapObj), model, status);
}

// ---------- Grade-Partitioned Norms (10th and 12th strictly separated) ----------
async function getGradeNorms(grade) {
  const rows = await db.prepare('SELECT * FROM v2_grade_norms WHERE grade = ?').all(Number(grade));
  const metrics = {};
  let maxCount = 0;
  for (const r of rows) {
    const n = Number(r.sample_count || 0);
    if (n > maxCount) maxCount = n;
    const variance = n > 1 ? Number(r.m2_val) / (n - 1) : 0;
    metrics[r.metric_key] = { count: n, mean: Number(r.mean_val), sd: Math.sqrt(Math.max(0, variance)) };
  }
  return { cohortCount: maxCount, metrics };
}

async function recordGradeNormObservation(grade, metricKey, value) {
  if (value == null || Number.isNaN(Number(value))) return;
  const x = Number(value);
  const g = Number(grade) >= 11 ? 12 : 10;
  const row = await db.prepare('SELECT * FROM v2_grade_norms WHERE grade = ? AND metric_key = ?').get(g, metricKey);
  if (!row) {
    await db.prepare(`
      INSERT INTO v2_grade_norms (grade, metric_key, sample_count, mean_val, m2_val)
      VALUES (?, ?, 1, ?, 0)
    `).run(g, metricKey, x);
    return;
  }
  // Welford's online algorithm for numerical stability
  const n = Number(row.sample_count) + 1;
  const delta = x - Number(row.mean_val);
  const newMean = Number(row.mean_val) + delta / n;
  const delta2 = x - newMean;
  const newM2 = Number(row.m2_val) + delta * delta2;
  await db.prepare(`
    UPDATE v2_grade_norms SET sample_count = ?, mean_val = ?, m2_val = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(n, newMean, newM2, row.id);
}

module.exports = {
  getItemsForVersion,
  getItemsByIds,
  getItemById,
  getBlueprint,
  upsertBlueprint,
  getV2Response,
  upsertV2Response,
  listV2ResponsesJoined,
  upsertV2ScoringResult,
  getV2ScoringResult,
  getParentSession,
  listParentSessionsForAssessment,
  upsertParentSession,
  setParentSensitiveConsent,
  getCounsellorMap,
  upsertCounsellorMap,
  getGradeNorms,
  recordGradeNormObservation
};

