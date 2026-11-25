// assessmentService — candidate assessment lifecycle + result assembly.

const assessmentRepository = require('../repositories/assessmentRepository');
const userRepository = require('../repositories/userRepository');
const { FixedAssessmentStrategy } = require('./psychometrics/assessmentStrategy');
const { scoreAssessment } = require('./psychometrics/scoringService');
const { buildCanonicalResult } = require('./reports/resultService');
const { calculateCongruence } = require('./psychometrics/congruenceEngine');
const { generateReport } = require('./reports/reportService');
const { logAudit } = require('../middleware/auditLogger');
const { badRequest, notFound, conflict } = require('../utils/helpers');

const questionRepository = {
  getActiveQuestionsForVersion: (versionId, opts) => assessmentRepository.getActiveQuestionsForVersion(versionId, opts)
};
const strategy = new FixedAssessmentStrategy(questionRepository);

const STUDENT_MODULES = ['aptitude', 'riasec', 'grit'];

async function startOrResume(req) {
  const student = await userRepository.findStudentByUserId(req.user.id);
  if (!student) throw notFound('Student profile not found.');

  const version = await assessmentRepository.getActiveVersion('V1');
  if (!version) throw conflict('No active assessment version is configured.');

  let assessment = await assessmentRepository.getInProgressAssessment(student.id, version.id);
  if (!assessment) {
    const id = await assessmentRepository.createAssessment({ studentId: student.id, versionId: version.id });
    assessment = await assessmentRepository.getAssessmentById(id);
    await logAudit(req, 'START_ASSESSMENT', 'ASSESSMENT', id, { version: version.version_code });
  }
  return { assessment, version };
}

/** Questions for the candidate client — options carry NO score values (anti-cheat). */
async function getQuestions(req, assessment) {
  const questions = await strategy.selectQuestions(assessment.version_id, { modules: STUDENT_MODULES });
  const options = await assessmentRepository.getOptionsForQuestions(questions.map(q => q.id));
  const optMap = {};
  for (const o of options) {
    (optMap[o.question_id] ||= []).push({ id: o.id, option_key: o.option_key, option_text: o.option_text, display_order: o.display_order });
  }
  const withOptions = questions.map(q => ({ ...q, options: optMap[q.id] || [] }));

  const responses = await assessmentRepository.listResponsesForAssessment(assessment.id, 'student');
  const responseMap = {};
  for (const r of responses) {
    responseMap[r.question_id] = { selected_option_id: r.selected_option_id, numeric_value: r.numeric_value };
  }

  const activeCount = await assessmentRepository.countActiveQuestions(assessment.version_id, STUDENT_MODULES);
  const version = await assessmentRepository.getVersionById(assessment.version_id);
  return {
    assessment_id: assessment.id,
    version_code: version?.version_code,
    strategy: strategy.strategyName,
    total_questions: activeCount,
    answered: Object.keys(responseMap).length,
    current_step: assessment.current_step,
    questions: withOptions,
    responses: responseMap
  };
}

/**
 * Save one response. SERVER derives the value from the option (fixes D1/D14):
 * the client never dictates score_value; the question must belong to the
 * assessment's version; ownership is enforced by middleware upstream.
 */
async function saveResponse(req, assessment) {
  const { question_id, selected_option_id, response_time_ms, current_step } = req.body;
  const question = await assessmentRepository.getQuestionById(Number(question_id));
  if (!question || question.version_id !== assessment.version_id || !question.is_active) {
    throw badRequest('Question does not belong to this assessment version.');
  }

  let numericValue = null;
  let selectedId = null;
  if (selected_option_id !== undefined && selected_option_id !== null) {
    const option = await assessmentRepository.getOptionById(Number(selected_option_id));
    if (!option || option.question_id !== question.id) {
      throw badRequest('Selected option does not belong to this question.');
    }
    selectedId = option.id;
    numericValue = Number(option.score_value);
  }

  if (question.question_type === 'likert_5' && numericValue !== null) {
    if (!Number.isInteger(numericValue) || numericValue < 1 || numericValue > 5) {
      throw badRequest('Invalid Likert response value.');
    }
  }

  await assessmentRepository.upsertResponse({
    assessmentId: assessment.id,
    questionId: question.id,
    respondentType: 'student',
    parentId: null,
    selectedOptionId: selectedId,
    numericValue,
    responseTimeMs: Number.isFinite(Number(response_time_ms)) ? Math.min(Math.max(Number(response_time_ms), 0), 3_600_000) : 0
  });

  if (current_step !== undefined) {
    const step = Number(current_step);
    if (Number.isInteger(step) && step >= 1) {
      await assessmentRepository.updateAssessmentStep(assessment.id, step);
    }
  }
  return { success: true };
}

/** Complete: gate on completeness → deterministic scoring → reports. */
async function complete(req, assessment) {
  if (assessment.status === 'completed') throw conflict('Assessment is already completed.');

  const scored = await scoreAssessment(assessment);
  await assessmentRepository.completeAssessmentRow(assessment.id);
  await logAudit(req, 'COMPLETE_ASSESSMENT', 'ASSESSMENT', assessment.id, { version: scored.version.version_code });

  const student = await userRepository.findStudentById(assessment.student_id);
  const canonicalResult = await buildCanonicalResult({
    assessment: { ...assessment, status: 'completed', completed_at: new Date().toISOString() },
    version: scored.version,
    student,
    scores: { aptitude: scored.aptitude, riasec: scored.riasec, grit: scored.grit },
    streamResults: scored.streamResults,
    parentContext: await assembleParentContext(assessment.id)
  });

  // Reports are generated synchronously for the MVP; LLM provider has a hard
  // timeout, and offline fallback guarantees completion. (A job queue is the
  // documented next step for large deployments.)
  const reportStatus = {};
  for (const reportType of ['candidate', 'parent', 'counselor']) {
    try {
      const result = await generateReport({
        assessmentId: assessment.id,
        reportType,
        canonicalResult,
        userId: req.user.id
      });
      reportStatus[reportType] = { report_id: result.reportId, status: result.status, model: result.model };
    } catch (err) {
      reportStatus[reportType] = { status: 'failed', error: err.message };
    }
  }
  logAudit(req, 'REPORTS_GENERATED', 'ASSESSMENT', assessment.id, reportStatus).catch(() => {});

  return {
    assessment_id: assessment.id,
    top_streams: canonicalResult.recommendations,
    reports: reportStatus
  };
}

/** Parent context (expectations/perceptions/congruence) for canonical result assembly. */
async function assembleParentContext(assessmentId) {
  const expectations = await assessmentRepository.getParentExpectations(assessmentId);
  if (!expectations) return null;
  const perceptions = await assessmentRepository.getParentPerceptions(assessmentId);
  const streamRows = await assessmentRepository.getStreamScores(assessmentId);
  const grit = await assessmentRepository.getGritScore(assessmentId);

  const streamResults = streamRows.map(r => ({ stream_id: r.stream_id, stream_name: r.stream_name, fit_score: r.fit_score, fit_band: r.fit_band }));
  const streamNameById = Object.fromEntries(streamRows.map(r => [r.stream_id, r.stream_name]));

  const congruence = calculateCongruence({
    streamResults,
    parentExpectations: {
      expected_stream: expectations.expected_stream,
      expected_stream_name: streamNameById[expectations.expected_stream] || expectations.expected_stream,
      outcome_priority: expectations.outcome_priority
    },
    parentPerceptions: perceptions ? {
      observed_analytical: perceptions.observed_analytical,
      observed_creative: perceptions.observed_creative,
      observed_study_habits: perceptions.observed_study_habits,
      observed_stress_resilience: perceptions.observed_stress_resilience
    } : null,
    studentGrit: grit ? {
      normalized_index: grit.normalized_index,
      stress_resilience: grit.stress_resilience,
      curiosity: grit.curiosity,
      conscientiousness: grit.conscientiousness
    } : null
  });

  return { expectations, perceptions, congruence };
}

/** Assemble the canonical result from persisted scores (results endpoints). */
async function assembleResult(assessment) {
  const version = await assessmentRepository.getVersionById(assessment.version_id);
  const student = await userRepository.findStudentById(assessment.student_id);
  const aptitudeRow = await assessmentRepository.getAptitudeScore(assessment.id);
  const riasecRow = await assessmentRepository.getRiasecScore(assessment.id);
  const gritRow = await assessmentRepository.getGritScore(assessment.id);
  const streamRows = await assessmentRepository.getStreamScores(assessment.id);

  if (!aptitudeRow || !riasecRow || !gritRow) return null;

  // Rebuild engine-shaped objects from persisted rows (single source of truth).
  const aptitude = {
    dimensions: {},
    overall_index: aptitudeRow.overall_idx,
    items_answered: aptitudeRow.items_answered,
    items_expected: aptitudeRow.items_expected,
    all_dimensions_measured: !!aptitudeRow.complete
  };
  for (const dim of ['numerical', 'abstract', 'verbal', 'spatial', 'logical', 'data']) {
    aptitude.dimensions[dim] = {
      raw: aptitudeRow[`${dim}_raw`],
      index: aptitudeRow[`${dim}_idx`],
      answered: null,
      expected: null,
      measured: !!aptitudeRow.complete
    };
  }

  const riasec = {
    r_score: riasecRow.r_score, i_score: riasecRow.i_score, a_score: riasecRow.a_score,
    s_score: riasecRow.s_score, e_score: riasecRow.e_score, c_score: riasecRow.c_score,
    holland_code: riasecRow.holland_code,
    ranking: JSON.parse(riasecRow.dominant_traits_json || '{"ranking":[]}').ranking || [],
    items_answered: riasecRow.items_answered,
    items_expected: riasecRow.items_expected,
    all_dimensions_measured: !!riasecRow.complete,
    tie_break_applied: false
  };

  const grit = {
    persistence: gritRow.persistence, focus: gritRow.focus,
    conscientiousness: gritRow.conscientiousness, curiosity: gritRow.curiosity,
    stress_resilience: gritRow.stress_resilience, deliberate_practice: gritRow.deliberate_practice,
    response_to_failure: gritRow.response_to_failure,
    composite_score: gritRow.composite_score,
    normalized_index: gritRow.normalized_index,
    items_answered: gritRow.items_answered,
    items_expected: gritRow.items_expected,
    all_dimensions_measured: !!gritRow.complete
  };

  const streamResults = streamRows.map(r => {
    const rationale = JSON.parse(r.rationale_json || '{}');
    return {
      stream_id: r.stream_id, stream_name: r.stream_name,
      fit_score: r.fit_score, fit_band: r.fit_band, rank_order: r.rank_order,
      contributions: rationale.contributions || [], weights_used: rationale.weights_used || {},
      career_clusters: [], curriculum_boards: {}
    };
  });

  const parentContext = await assembleParentContext(assessment.id);

  return buildCanonicalResult({
    assessment, version, student,
    scores: { aptitude, riasec, grit },
    streamResults,
    parentContext
  });
}

module.exports = { startOrResume, getQuestions, saveResponse, complete, assembleResult, assembleParentContext };
