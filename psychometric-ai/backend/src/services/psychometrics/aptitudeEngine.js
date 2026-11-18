// Aptitude Scoring Engine (deterministic, no fabricated values).
//
// Scores are NORMALIZED INDICES on a 0-100 scale — they are NOT percentiles.
// A true percentile requires a normative reference population, which this MVP
// does not have (see docs/PSYCHOMETRIC_LIMITATIONS.md).
//
// Inputs (from the response repository, already validated):
//   responses: [{ dimension, difficulty, is_correct (0|1) }]
//   expectedCounts: { [dimension]: number of active questions in the version }
//
// Behaviour on missing data:
//   - A dimension with zero responses yields index = null, measured = false.
//     It is excluded from the overall index (never treated as a mid score).
//   - If NO dimension has responses, a ScoringError is thrown.
const { APTITUDE_DIMENSIONS } = require('../../config/constants');
const { getScoringConfig } = require('../configService');
const { ScoringError } = require('./errors');

function calculateAptitudeScores(responses, expectedCounts = {}) {
  if (!Array.isArray(responses)) throw new ScoringError('Aptitude scoring requires a responses array.');
  const config = getScoringConfig();
  const difficultyWeights = config.difficulty_weights;

  const stats = {};
  APTITUDE_DIMENSIONS.forEach(dim => {
    stats[dim] = { earned: 0, total: 0, weightedEarned: 0, weightedTotal: 0 };
  });

  for (const resp of responses) {
    const dim = String(resp.dimension || '').toLowerCase();
    if (!stats[dim]) continue; // foreign dimension — ignore (version mismatch is caught upstream)
    const isCorrect = resp.is_correct ? 1 : 0;
    const weight = difficultyWeights[resp.difficulty] || difficultyWeights.easy || 1.0;
    stats[dim].earned += isCorrect;
    stats[dim].total += 1;
    stats[dim].weightedEarned += isCorrect * weight;
    stats[dim].weightedTotal += weight;
  }

  const scores = {
    dimensions: {},
    items_answered: 0,
    items_expected: APTITUDE_DIMENSIONS.reduce((sum, d) => sum + (Number(expectedCounts[d]) || 0), 0)
  };
  let indexSum = 0;
  let measuredCount = 0;

  APTITUDE_DIMENSIONS.forEach(dim => {
    const s = stats[dim];
    scores.items_answered += s.total;
    const measured = s.total > 0;
    // Weighted index 0-100; unmeasured dimensions stay null (never a fake 50).
    const idx = measured
      ? Math.round((s.weightedEarned / s.weightedTotal) * 100)
      : null;
    scores.dimensions[dim] = {
      raw: s.earned,
      answered: s.total,
      expected: Number(expectedCounts[dim]) || 0,
      index: idx,
      measured
    };
    if (measured) {
      indexSum += idx;
      measuredCount += 1;
    }
  });

  if (measuredCount === 0) {
    throw new ScoringError('Aptitude scoring failed: no aptitude responses were recorded for this assessment.');
  }

  scores.overall_index = Math.round(indexSum / measuredCount);
  scores.all_dimensions_measured = measuredCount === APTITUDE_DIMENSIONS.length;
  return scores;
}

/**
 * Flatten to the DB persistence shape used by aptitude_scores table.
 */
function toAptitudeRow(assessmentId, result) {
  const row = { assessment_id: assessmentId };
  for (const dim of APTITUDE_DIMENSIONS) {
    const d = result.dimensions[dim];
    row[`${dim}_raw`] = d.raw;
    row[`${dim}_idx`] = d.index ?? 0;
  }
  row.overall_idx = result.overall_index;
  row.items_answered = result.items_answered;
  row.items_expected = result.items_expected;
  row.complete = result.all_dimensions_measured ? 1 : 0;
  return row;
}

module.exports = { calculateAptitudeScores, toAptitudeRow };
