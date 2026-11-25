// Question bank & assessment repository — versioned questions, responses, scores.

const { db } = require('../config/db');

// ---------- Assessment versions ----------
async function getActiveVersion(versionCode = 'V1') {
  if (versionCode) {
    const row = await db.prepare('SELECT * FROM assessment_versions WHERE version_code = ? AND is_active = 1').get(versionCode);
    if (row) return row;
  }
  return await db.prepare('SELECT * FROM assessment_versions WHERE is_active = 1 ORDER BY id DESC LIMIT 1').get();
}

async function getVersionByCode(code) {
  return await db.prepare('SELECT * FROM assessment_versions WHERE version_code = ?').get(code);
}

async function getVersionById(id) {
  return await db.prepare('SELECT * FROM assessment_versions WHERE id = ?').get(id);
}

async function listVersions() {
  return await db.prepare(`
    SELECT v.*, (SELECT COUNT(*) FROM questions q WHERE q.version_id = v.id AND q.is_active = 1) AS active_question_count
    FROM assessment_versions v ORDER BY v.id DESC
  `).all();
}

// ---------- Questions ----------
const STUDENT_MODULES = ['aptitude', 'riasec', 'grit'];
const MODULE_ORDER = "CASE q.module WHEN 'aptitude' THEN 1 WHEN 'riasec' THEN 2 WHEN 'grit' THEN 3 WHEN 'parent_perception' THEN 4 ELSE 5 END";

async function getActiveQuestionsForVersion(versionId, { modules = STUDENT_MODULES } = {}) {
  const placeholders = modules.map(() => '?').join(',');
  return await db.prepare(`
    SELECT q.id, q.version_id, q.module, q.category, q.difficulty, q.question_text, q.question_type,
           q.dimension, q.display_order
    FROM questions q
    WHERE q.version_id = ? AND q.is_active = 1 AND q.module IN (${placeholders})
    ORDER BY ${MODULE_ORDER}, q.display_order ASC, q.id ASC
  `).all(versionId, ...modules);
}

async function countActiveByDimension(versionId, modules) {
  const placeholders = modules.map(() => '?').join(',');
  const rows = await db.prepare(`
    SELECT module, dimension, COUNT(*) AS cnt
    FROM questions
    WHERE version_id = ? AND is_active = 1 AND module IN (${placeholders})
    GROUP BY module, dimension
  `).all(versionId, ...modules);
  return rows;
}

async function getOptionsForQuestions(questionIds) {
  if (questionIds.length === 0) return [];
  const placeholders = questionIds.map(() => '?').join(',');
  // Parameterized query (fixes audited bug D3 — no string interpolation of IDs).
  return await db.prepare(`
    SELECT id, question_id, option_key, option_text, display_order
    FROM question_options
    WHERE question_id IN (${placeholders})
    ORDER BY display_order ASC, id ASC
  `).all(...questionIds);
}

async function getOptionById(optionId) {
  return await db.prepare('SELECT * FROM question_options WHERE id = ?').get(optionId);
}

async function getQuestionById(questionId) {
  return await db.prepare('SELECT * FROM questions WHERE id = ?').get(questionId);
}

// ---------- Assessments ----------
async function createAssessment({ studentId, versionId }) {
  const info = await db.prepare(
    "INSERT INTO assessments (student_id, version_id, status, current_step) VALUES (?, ?, 'in_progress', 1)"
  ).run(studentId, versionId);
  return Number(info.lastInsertRowid);
}

async function getAssessmentById(id) {
  return await db.prepare('SELECT * FROM assessments WHERE id = ?').get(id);
}

async function getInProgressAssessment(studentId) {
  return await db.prepare(`
    SELECT * FROM assessments WHERE student_id = ? AND status = 'in_progress' ORDER BY id DESC LIMIT 1
  `).get(studentId);
}

async function getLatestCompletedAssessment(studentId) {
  return await db.prepare(`
    SELECT * FROM assessments WHERE student_id = ? AND status = 'completed' ORDER BY id DESC LIMIT 1
  `).get(studentId);
}

async function updateAssessmentStep(assessmentId, step) {
  await db.prepare("UPDATE assessments SET current_step = ?, updated_at = datetime('now') WHERE id = ?").run(step, assessmentId);
}

async function completeAssessmentRow(assessmentId) {
  await db.prepare(`
    UPDATE assessments SET status = 'completed', completed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?
  `).run(assessmentId);
}

// ---------- Responses ----------
async function getResponse(assessmentId, questionId, respondentType, parentId = null) {
  // Portable NULL handling: branch in JS instead of COALESCE(?, 0) — a bare
  // parameter inside COALESCE has no inferrable type in PostgreSQL.
  if (parentId === null || parentId === undefined) {
    return await db.prepare(`
      SELECT * FROM responses
      WHERE assessment_id = ? AND question_id = ? AND respondent_type = ? AND parent_id IS NULL
    `).get(assessmentId, questionId, respondentType);
  }
  return await db.prepare(`
    SELECT * FROM responses
    WHERE assessment_id = ? AND question_id = ? AND respondent_type = ? AND parent_id = ?
  `).get(assessmentId, questionId, respondentType, parentId);
}

async function upsertResponse({ assessmentId, questionId, respondentType, parentId, selectedOptionId, numericValue, responseTimeMs }) {
  const existing = await getResponse(assessmentId, questionId, respondentType, parentId);
  if (existing) {
    await db.prepare(`
      UPDATE responses
      SET selected_option_id = ?, numeric_value = ?, response_time_ms = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(selectedOptionId, numericValue, responseTimeMs || 0, existing.id);
    return existing.id;
  }
  const info = await db.prepare(`
    INSERT INTO responses (assessment_id, question_id, respondent_type, parent_id, selected_option_id, numeric_value, response_time_ms)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(assessmentId, questionId, respondentType, parentId, selectedOptionId, numericValue, responseTimeMs || 0);
  return Number(info.lastInsertRowid);
}

async function listResponsesForAssessment(assessmentId, respondentType = 'student') {
  // LEFT JOIN question_options: score_value (correctness) lives on the OPTION,
  // not on the response row — required by the aptitude engine.
  return await db.prepare(`
    SELECT r.*, q.module, q.dimension, q.category, q.difficulty, q.question_type,
           o.score_value
    FROM responses r
    JOIN questions q ON r.question_id = q.id
    LEFT JOIN question_options o ON r.selected_option_id = o.id
    WHERE r.assessment_id = ? AND r.respondent_type = ?
  `).all(assessmentId, respondentType);
}

async function countAnsweredQuestions(assessmentId, versionId, respondentType = 'student') {
  const row = await db.prepare(`
    SELECT COUNT(DISTINCT r.question_id) AS cnt
    FROM responses r
    JOIN questions q ON r.question_id = q.id
    WHERE r.assessment_id = ? AND r.respondent_type = ? AND q.version_id = ? AND q.is_active = 1
  `).get(assessmentId, respondentType, versionId);
  return Number(row?.cnt || 0);
}

async function countActiveQuestions(versionId, modules = STUDENT_MODULES) {
  const placeholders = modules.map(() => '?').join(',');
  const row = await db.prepare(`
    SELECT COUNT(*) AS cnt FROM questions WHERE version_id = ? AND is_active = 1 AND module IN (${placeholders})
  `).get(versionId, ...modules);
  return Number(row?.cnt || 0);
}

// ---------- Scores (delete + insert inside caller's transaction) ----------
async function deleteScoresForAssessment(assessmentId) {
  await db.prepare('DELETE FROM aptitude_scores WHERE assessment_id = ?').run(assessmentId);
  await db.prepare('DELETE FROM riasec_scores WHERE assessment_id = ?').run(assessmentId);
  await db.prepare('DELETE FROM grit_scores WHERE assessment_id = ?').run(assessmentId);
  await db.prepare('DELETE FROM stream_scores WHERE assessment_id = ?').run(assessmentId);
}

async function insertAptitudeScore(row) {
  await db.prepare(`
    INSERT INTO aptitude_scores (assessment_id, numerical_raw, numerical_idx, abstract_raw, abstract_idx,
      verbal_raw, verbal_idx, spatial_raw, spatial_idx, logical_raw, logical_idx, data_raw, data_idx,
      overall_idx, items_answered, items_expected, complete)
    VALUES (@assessment_id, @numerical_raw, @numerical_idx, @abstract_raw, @abstract_idx,
      @verbal_raw, @verbal_idx, @spatial_raw, @spatial_idx, @logical_raw, @logical_idx, @data_raw, @data_idx,
      @overall_idx, @items_answered, @items_expected, @complete)
  `).run(row);
}

async function insertRiasecScore(row) {
  await db.prepare(`
    INSERT INTO riasec_scores (assessment_id, r_score, i_score, a_score, s_score, e_score, c_score,
      holland_code, dominant_traits_json, items_answered, items_expected, complete)
    VALUES (@assessment_id, @r_score, @i_score, @a_score, @s_score, @e_score, @c_score,
      @holland_code, @dominant_traits_json, @items_answered, @items_expected, @complete)
  `).run(row);
}

async function insertGritScore(row) {
  await db.prepare(`
    INSERT INTO grit_scores (assessment_id, persistence, focus, conscientiousness, curiosity,
      stress_resilience, deliberate_practice, response_to_failure, composite_score, normalized_index,
      items_answered, items_expected, complete)
    VALUES (@assessment_id, @persistence, @focus, @conscientiousness, @curiosity,
      @stress_resilience, @deliberate_practice, @response_to_failure, @composite_score, @normalized_index,
      @items_answered, @items_expected, @complete)
  `).run(row);
}

async function insertStreamScore(s) {
  await db.prepare(`
    INSERT INTO stream_scores (assessment_id, stream_id, stream_name, fit_score, fit_band, rank_order, rationale_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(s.assessment_id, s.stream_id, s.stream_name, s.fit_score, s.fit_band, s.rank_order, s.rationale_json);
}

// ---------- Score readers ----------
async function getAptitudeScore(assessmentId) { return await db.prepare('SELECT * FROM aptitude_scores WHERE assessment_id = ?').get(assessmentId); }
async function getRiasecScore(assessmentId) { return await db.prepare('SELECT * FROM riasec_scores WHERE assessment_id = ?').get(assessmentId); }
async function getGritScore(assessmentId) { return await db.prepare('SELECT * FROM grit_scores WHERE assessment_id = ?').get(assessmentId); }
async function getStreamScores(assessmentId) { return await db.prepare('SELECT * FROM stream_scores WHERE assessment_id = ? ORDER BY rank_order ASC').all(assessmentId); }
async function getCongruenceScore(assessmentId) { return await db.prepare('SELECT * FROM congruence_scores WHERE assessment_id = ?').get(assessmentId); }

async function upsertCongruenceScore(row) {
  await db.prepare(`
    INSERT INTO congruence_scores (assessment_id, parent_id, congruence_pct, alignment_status, stream_match_score, perception_gap_score, friction_factors_json)
    VALUES (@assessment_id, @parent_id, @congruence_pct, @alignment_status, @stream_match_score, @perception_gap_score, @friction_factors_json)
    ON CONFLICT(assessment_id) DO UPDATE SET
      parent_id = excluded.parent_id, congruence_pct = excluded.congruence_pct,
      alignment_status = excluded.alignment_status, stream_match_score = excluded.stream_match_score,
      perception_gap_score = excluded.perception_gap_score, friction_factors_json = excluded.friction_factors_json,
      updated_at = datetime('now')
  `).run(row);
}

// ---------- Parent inventory materialized rows ----------
async function upsertParentExpectations(row) {
  await db.prepare(`
    INSERT INTO parent_expectations (assessment_id, parent_id, expected_stream, secondary_stream, outcome_priority, comments)
    VALUES (@assessment_id, @parent_id, @expected_stream, @secondary_stream, @outcome_priority, @comments)
    ON CONFLICT(assessment_id, parent_id) DO UPDATE SET
      expected_stream = excluded.expected_stream, secondary_stream = excluded.secondary_stream,
      outcome_priority = excluded.outcome_priority, comments = excluded.comments, updated_at = datetime('now')
  `).run(row);
}

async function upsertParentPerceptions(row) {
  await db.prepare(`
    INSERT INTO parent_perceptions (assessment_id, parent_id, observed_analytical, observed_creative, observed_study_habits, observed_stress_resilience)
    VALUES (@assessment_id, @parent_id, @observed_analytical, @observed_creative, @observed_study_habits, @observed_stress_resilience)
    ON CONFLICT(assessment_id, parent_id) DO UPDATE SET
      observed_analytical = excluded.observed_analytical, observed_creative = excluded.observed_creative,
      observed_study_habits = excluded.observed_study_habits, observed_stress_resilience = excluded.observed_stress_resilience,
      updated_at = datetime('now')
  `).run(row);
}

async function getParentExpectations(assessmentId) {
  return await db.prepare('SELECT * FROM parent_expectations WHERE assessment_id = ?').get(assessmentId);
}

async function getParentPerceptions(assessmentId) {
  return await db.prepare('SELECT * FROM parent_perceptions WHERE assessment_id = ?').get(assessmentId);
}

// ---------- Scoring rules ----------
async function getActiveScoringRules(versionId) {
  return await db.prepare('SELECT * FROM scoring_rules WHERE version_id = ? AND is_active = 1').all(versionId);
}

module.exports = {
  getActiveVersion, getVersionByCode, getVersionById, listVersions,
  getActiveQuestionsForVersion, countActiveByDimension, getOptionsForQuestions, getOptionById, getQuestionById,
  createAssessment, getAssessmentById, getInProgressAssessment, getLatestCompletedAssessment,
  updateAssessmentStep, completeAssessmentRow,
  getResponse, upsertResponse, listResponsesForAssessment, countAnsweredQuestions, countActiveQuestions,
  deleteScoresForAssessment, insertAptitudeScore, insertRiasecScore, insertGritScore, insertStreamScore,
  getAptitudeScore, getRiasecScore, getGritScore, getStreamScores, getCongruenceScore, upsertCongruenceScore,
  upsertParentExpectations, upsertParentPerceptions, getParentExpectations, getParentPerceptions,
  getActiveScoringRules
};
