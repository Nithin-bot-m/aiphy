// Grit / Work Style Engine — deterministic, no fabricated values.
//
// - Dimension score = mean of Likert 1-5 answers (raw scale, 1.00-5.00).
// - normalized_index = composite/5 * 100 — an index on a 0-100 scale.
//   It is explicitly NOT a percentile; no normative population exists (MVP).
// - Unmeasured dimensions yield null and are excluded from the composite.
const { GRIT_DIMENSIONS } = require('../../config/constants');
const { ScoringError } = require('./errors');

function calculateGritScores(responses, expectedCounts = {}) {
  if (!Array.isArray(responses)) throw new ScoringError('Grit scoring requires a responses array.');

  const totals = {};
  const counts = {};
  GRIT_DIMENSIONS.forEach(dim => { totals[dim] = 0; counts[dim] = 0; });

  for (const resp of responses) {
    const dim = String(resp.dimension || '').toLowerCase();
    if (totals[dim] === undefined) continue;
    const raw = resp.numeric_value;
    // null/undefined/'' must be SKIPPED (Number(null) === 0 would fabricate a 0 answer).
    if (raw === null || raw === undefined || raw === '') continue;
    const val = Number(raw);
    if (!Number.isFinite(val)) continue;
    totals[dim] += val;
    counts[dim] += 1;
  }

  const scores = {};
  let compositeSum = 0;
  let measuredCount = 0;
  let answeredTotal = 0;

  GRIT_DIMENSIONS.forEach(dim => {
    const measured = counts[dim] > 0;
    const mean = measured ? totals[dim] / counts[dim] : null;
    scores[dim] = mean === null ? null : Number(mean.toFixed(2));
    answeredTotal += counts[dim];
    if (measured) {
      compositeSum += mean;
      measuredCount += 1;
    }
  });

  if (measuredCount === 0) {
    throw new ScoringError('Grit scoring failed: no work-style responses were recorded for this assessment.');
  }

  const composite = Number((compositeSum / measuredCount).toFixed(2));
  const normalizedIndex = Math.round((composite / 5) * 100);

  return {
    ...scores,
    composite_score: composite,
    normalized_index: normalizedIndex,
    items_answered: answeredTotal,
    items_expected: GRIT_DIMENSIONS.reduce((sum, d) => sum + (Number(expectedCounts[d]) || 0), 0),
    all_dimensions_measured: measuredCount === GRIT_DIMENSIONS.length
  };
}

function toGritRow(assessmentId, result) {
  const row = { assessment_id: assessmentId };
  GRIT_DIMENSIONS.forEach(dim => { row[dim] = result[dim] ?? 0; });
  row.composite_score = result.composite_score;
  row.normalized_index = result.normalized_index;
  row.items_answered = result.items_answered;
  row.items_expected = result.items_expected;
  row.complete = result.all_dimensions_measured ? 1 : 0;
  return row;
}

module.exports = { calculateGritScores, toGritRow };
