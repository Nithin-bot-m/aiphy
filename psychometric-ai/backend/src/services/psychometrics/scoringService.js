// scoringService — orchestrates the deterministic pipeline inside a transaction.
//
//   validated responses
//        ↓
//   aptitude / riasec / grit engines   (pure, config-driven, no fabricated data)
//        ↓
//   stream engine (versioned weights)
//        ↓
//   persistence (single SQLite transaction — atomic completion, fixes D7)
//
// Completeness gate (fixes D8): an assessment CANNOT be completed with
// unanswered active questions. Missing data produces an explicit error,
// never an invented score.

const { transaction } = require('../../config/db');
const assessmentRepository = require('../../repositories/assessmentRepository');
const { loadScoringConfig } = require('../configService');
const { calculateAptitudeScores, toAptitudeRow } = require('./aptitudeEngine');
const { calculateRiasecScores, toRiasecRow } = require('./riasecEngine');
const { calculateGritScores, toGritRow } = require('./gritEngine');
const { calculateStreamFits } = require('./streamEngine');
const { ScoringError } = require('./errors');
const { HttpError } = require('../../utils/helpers');

const STUDENT_MODULES = ['aptitude', 'riasec', 'grit'];

function isCorrectFromResponse(resp) {
  // Aptitude items: score_value of the chosen option decides correctness.
  return Number(resp.score_value) > 0;
}

async function buildEngineInputs(assessmentId, versionId) {
  const responses = await assessmentRepository.listResponsesForAssessment(assessmentId, 'student');
  const dimensionCounts = await assessmentRepository.countActiveByDimension(versionId, STUDENT_MODULES);

  const expected = {};
  for (const row of dimensionCounts) expected[row.dimension] = row.cnt;

  const aptResponses = responses.filter(r => r.module === 'aptitude').map(r => ({
    dimension: r.dimension,
    difficulty: r.difficulty,
    is_correct: isCorrectFromResponse(r)
  }));
  const riasecResponses = responses.filter(r => r.module === 'riasec').map(r => ({
    dimension: r.dimension,
    numeric_value: r.numeric_value
  }));
  const gritResponses = responses.filter(r => r.module === 'grit').map(r => ({
    dimension: r.dimension,
    numeric_value: r.numeric_value
  }));

  return { expected, aptResponses, riasecResponses, gritResponses, answeredCount: responses.length };
}

async function assertComplete(assessment, expected, answeredCount) {
  const activeCount = await assessmentRepository.countActiveQuestions(assessment.version_id, STUDENT_MODULES);
  if (answeredCount < activeCount) {
    throw new HttpError(422,
      `Assessment is incomplete: ${answeredCount}/${activeCount} questions answered. Missing answers are never auto-scored.`,
      'ASSESSMENT_INCOMPLETE');
  }
  void expected;
}

/** Recompute + persist all deterministic scores for an assessment. */
async function scoreAssessment(assessment) {
  const version = await assessmentRepository.getVersionById(assessment.version_id);
  if (!version) throw new ScoringError('Assessment version not found.');

  const { expected, aptResponses, riasecResponses, gritResponses, answeredCount } =
    await buildEngineInputs(assessment.id, assessment.version_id);

  await assertComplete(assessment, expected, answeredCount);

  // DB-driven scoring config becomes effective here (engines stay pure/sync).
  await loadScoringConfig();

  const aptitude = calculateAptitudeScores(aptResponses, expected);
  const riasec = calculateRiasecScores(riasecResponses, expected);
  const grit = calculateGritScores(gritResponses, expected);

  const activeRules = await assessmentRepository.getActiveScoringRules(assessment.version_id);
  const streamResults = calculateStreamFits(aptitude, riasec, grit, activeRules);

  // Persist atomically.
  await transaction(async () => {
    await assessmentRepository.deleteScoresForAssessment(assessment.id);
    await assessmentRepository.insertAptitudeScore(toAptitudeRow(assessment.id, aptitude));
    await assessmentRepository.insertRiasecScore(toRiasecRow(assessment.id, riasec));
    await assessmentRepository.insertGritScore(toGritRow(assessment.id, grit));
    for (const s of streamResults) {
      await assessmentRepository.insertStreamScore({
        assessment_id: assessment.id,
        stream_id: s.stream_id,
        stream_name: s.stream_name,
        fit_score: s.fit_score,
        fit_band: s.fit_band,
        rank_order: s.rank_order,
        rationale_json: JSON.stringify({ contributions: s.contributions, weights_used: s.weights_used })
      });
    }
  });

  return { aptitude, riasec, grit, streamResults, version };
}

module.exports = { scoreAssessment, STUDENT_MODULES };
