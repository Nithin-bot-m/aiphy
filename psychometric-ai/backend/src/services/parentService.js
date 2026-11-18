// parentService — link requests (with student consent), parent inventory,
// congruence recomputation. All access rules enforced server-side.

const assessmentRepository = require('../repositories/assessmentRepository');
const userRepository = require('../repositories/userRepository');
const { calculateCongruence } = require('./psychometrics/congruenceEngine');
const { generateReport } = require('./reports/reportService');
const { logAudit } = require('../middleware/auditLogger');
const assessmentService = require('./assessmentService');
const { badRequest, notFound, conflict } = require('../utils/helpers');

const STREAM_KEYS = ['pcm', 'pcb', 'commerce_math', 'commerce_no_math', 'humanities_law', 'design', 'vocational'];
const PRIORITIES = ['stability', 'prestige', 'fulfillment', 'entrepreneurship', 'balanced', 'exploration'];

// ---------- Linking with consent ----------
async function requestLink(req) {
  const parent = await userRepository.findParentByUserId(req.user.id);
  if (!parent) throw notFound('Parent profile not found.');

  const { student_code } = req.body;
  const student = await userRepository.findStudentByCode(String(student_code || '').trim());
  if (!student) throw notFound('No student found for this code.');

  const existing = await userRepository.findMapping(student.id, parent.id);
  if (existing) {
    if (existing.status === 'linked') throw conflict('You are already linked with this student.');
    if (existing.status === 'pending_student_approval') throw conflict('A link request is already awaiting student approval.');
    if (existing.status === 'revoked') {
      // Re-request creates a fresh pending mapping.
      await userRepository.createMapping({ studentId: student.id, parentId: parent.id, requestedBy: 'parent' });
      await logAudit(req, 'PARENT_LINK_REREQUEST', 'STUDENT', student.id);
      return { status: 'pending_student_approval', message: 'Link request sent to the student for approval.' };
    }
  }

  await userRepository.createMapping({ studentId: student.id, parentId: parent.id, requestedBy: 'parent' });
  await logAudit(req, 'PARENT_LINK_REQUEST', 'STUDENT', student.id);
  return { status: 'pending_student_approval', message: 'Link request sent to the student for approval.' };
}

/** Student side: approve a pending parent request. */
async function approveLink(req) {
  const student = await userRepository.findStudentByUserId(req.user.id);
  if (!student) throw notFound('Student profile not found.');
  const mapping = await userRepository.findMappingById(Number(req.params.mappingId));
  if (!mapping || mapping.student_id !== student.id) throw notFound('Link request not found.');
  if (mapping.status !== 'pending_student_approval') throw badRequest('This request is not pending approval.');

  await userRepository.approveMapping(mapping.id);
  await logAudit(req, 'PARENT_LINK_APPROVED', 'STUDENT', student.id, { mapping_id: mapping.id });
  return { status: 'linked' };
}

/** Student side: revoke any mapping. */
async function revokeLink(req) {
  const student = await userRepository.findStudentByUserId(req.user.id);
  if (!student) throw notFound('Student profile not found.');
  const mapping = await userRepository.findMappingById(Number(req.params.mappingId));
  if (!mapping || mapping.student_id !== student.id) throw notFound('Link not found.');

  await userRepository.revokeMapping(mapping.id);
  await logAudit(req, 'PARENT_LINK_REVOKED', 'STUDENT', student.id, { mapping_id: mapping.id });
  return { status: 'revoked' };
}

// ---------- Parent inventory ----------
/**
 * Parent inventory is recorded through the SAME question bank + responses table
 * as the student battery (respondent_type='parent') — eliminating the audited
 * dual-system problem — and materialized into parent_expectations/parent_perceptions.
 */
async function submitInventory(req, parent, assessment) {
  const { expected_stream, secondary_stream, outcome_priority, perceptions, comments } = req.body;

  if (!STREAM_KEYS.includes(expected_stream)) throw badRequest('Invalid expected stream.');
  if (secondary_stream && !STREAM_KEYS.includes(secondary_stream)) throw badRequest('Invalid secondary stream.');
  if (!PRIORITIES.includes(outcome_priority)) throw badRequest('Invalid outcome priority.');

  const p = perceptions || {};
  for (const key of ['observed_analytical', 'observed_creative', 'observed_study_habits', 'observed_stress_resilience']) {
    const v = p[key];
    if (!Number.isInteger(v) || v < 1 || v > 5) {
      throw badRequest(`Perception "${key}" must be an integer 1-5. Missing values are not defaulted.`);
    }
  }

  await assessmentRepository.upsertParentExpectations({
    assessment_id: assessment.id,
    parent_id: parent.id,
    expected_stream,
    secondary_stream: secondary_stream || null,
    outcome_priority,
    comments: comments ? String(comments).slice(0, 2000) : null
  });

  await assessmentRepository.upsertParentPerceptions({
    assessment_id: assessment.id,
    parent_id: parent.id,
    observed_analytical: p.observed_analytical,
    observed_creative: p.observed_creative,
    observed_study_habits: p.observed_study_habits,
    observed_stress_resilience: p.observed_stress_resilience
  });

  // Store raw inventory answers in responses (respondent_type='parent').
  const parentQuestions = await assessmentRepository.getActiveQuestionsForVersion(assessment.version_id, {
    modules: ['parent_perception', 'parent_expectation']
  });
  for (const q of parentQuestions) {
    if (q.module === 'parent_perception' && p[q.dimension] !== undefined) {
      const options = await assessmentRepository.getOptionsForQuestions([q.id]);
      const option = (options || []).find(o => Number(o.option_key) === p[q.dimension]);
      await assessmentRepository.upsertResponse({
        assessmentId: assessment.id,
        questionId: q.id,
        respondentType: 'parent',
        parentId: parent.id,
        selectedOptionId: option ? option.id : null,
        numericValue: p[q.dimension],
        responseTimeMs: 0
      });
    }
  }

  return recomputeCongruenceAndReports(req, parent, assessment);
}

/** Deterministic congruence recomputation + parent/counselor report refresh. */
async function recomputeCongruenceAndReports(req, parent, assessment) {
  if (assessment.status !== 'completed') {
    return { congruence: null, message: 'Student assessment is not completed yet; alignment will be computed after completion.' };
  }

  const expectations = await assessmentRepository.getParentExpectations(assessment.id);
  const perceptions = await assessmentRepository.getParentPerceptions(assessment.id);
  const streamRows = await assessmentRepository.getStreamScores(assessment.id);
  const grit = await assessmentRepository.getGritScore(assessment.id);
  const streamNameById = Object.fromEntries(streamRows.map(r => [r.stream_id, r.stream_name]));

  const congruence = calculateCongruence({
    streamResults: streamRows.map(r => ({ stream_id: r.stream_id, stream_name: r.stream_name, fit_score: r.fit_score, fit_band: r.fit_band })),
    parentExpectations: {
      expected_stream: expectations.expected_stream,
      expected_stream_name: streamNameById[expectations.expected_stream] || expectations.expected_stream,
      outcome_priority: expectations.outcome_priority
    },
    parentPerceptions: {
      observed_analytical: perceptions.observed_analytical,
      observed_creative: perceptions.observed_creative,
      observed_study_habits: perceptions.observed_study_habits,
      observed_stress_resilience: perceptions.observed_stress_resilience
    },
    studentGrit: {
      normalized_index: grit.normalized_index,
      stress_resilience: grit.stress_resilience,
      curiosity: grit.curiosity,
      conscientiousness: grit.conscientiousness
    }
  });

  await assessmentRepository.upsertCongruenceScore({
    assessment_id: assessment.id,
    parent_id: parent.id,
    congruence_pct: congruence.congruence_pct,
    alignment_status: congruence.alignment_status,
    stream_match_score: congruence.stream_match_score,
    perception_gap_score: congruence.perception_gap_score,
    friction_factors_json: JSON.stringify({ friction_factors: congruence.friction_factors, discussion_areas: congruence.discussion_areas })
  });
  await logAudit(req, 'CONGRUENCE_RECOMPUTED', 'ASSESSMENT', assessment.id, { congruence_pct: congruence.congruence_pct });

  // Refresh parent + counselor reports with parent context included.
  const canonicalResult = await assessmentService.assembleResult(assessment);
  const refreshed = {};
  for (const reportType of ['parent', 'counselor']) {
    try {
      const result = await generateReport({
        assessmentId: assessment.id, reportType, canonicalResult, userId: req.user.id
      });
      refreshed[reportType] = { report_id: result.reportId, status: result.status };
    } catch (err) {
      refreshed[reportType] = { status: 'failed', error: err.message };
    }
  }

  return { congruence, refreshed_reports: refreshed };
}

async function getChildDashboard(req, parent, assessment) {
  const student = await userRepository.findStudentById(assessment.student_id);
  if (!student) throw notFound('Student record not found.');
  const congruence = await assessmentRepository.getCongruenceScore(assessment.id);
  const expectations = await assessmentRepository.getParentExpectations(assessment.id);
  const perceptions = await assessmentRepository.getParentPerceptions(assessment.id);
  const allStreams = await assessmentRepository.getStreamScores(assessment.id);
  const streams = allStreams.slice(0, 3);
  const version = await assessmentRepository.getVersionById(assessment.version_id);

  return {
    student: { id: student.id, first_name: student.full_name.split(' ')[0], grade: student.grade, board: student.board, is_demo: !!student.is_demo },
    assessment: {
      id: assessment.id,
      status: assessment.status,
      version_code: version?.version_code,
      completed_at: assessment.completed_at
    },
    top_streams: streams.map(s => ({ id: s.stream_id, name: s.stream_name, score: s.fit_score, band: s.fit_band, rank: s.rank_order })),
    congruence: congruence ? {
      score: congruence.congruence_pct,
      band: congruence.alignment_status,
      stream_match_score: congruence.stream_match_score,
      perception_gap_score: congruence.perception_gap_score,
      friction: JSON.parse(congruence.friction_factors_json || '{}')
    } : null,
    my_expectations: expectations ? {
      expected_stream: expectations.expected_stream,
      expected_stream_name: streams.find(s => s.stream_id === expectations.expected_stream)?.stream_name || expectations.expected_stream,
      outcome_priority: expectations.outcome_priority,
      submitted: true
    } : { submitted: false },
    my_perceptions: perceptions ? {
      observed_analytical: perceptions.observed_analytical,
      observed_creative: perceptions.observed_creative,
      observed_study_habits: perceptions.observed_study_habits,
      observed_stress_resilience: perceptions.observed_stress_resilience,
      note: 'Parent perception — not a psychological evaluation.'
    } : null
  };
}

module.exports = { requestLink, approveLink, revokeLink, submitInventory, recomputeCongruenceAndReports, getChildDashboard };
