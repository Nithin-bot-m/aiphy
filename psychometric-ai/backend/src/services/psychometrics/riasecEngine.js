// RIASEC (Holland) Interest Engine — deterministic, explicit tie handling.
//
// - Dimension score = mean of Likert 1-5 answers, scaled to a 0-100 normalized index.
// - Unmeasured dimensions yield index null, measured false (never a fabricated mean).
// - Holland code = top 3 dimensions by score. TIES ARE RESOLVED EXPLICITLY using
//   the configured tie-break order (hexagon order R-I-A-S-E-C), never randomness.
const { RIASEC_DIMENSIONS, RIASEC_NAMES } = require('../../config/constants');
const { getScoringConfig } = require('../configService');
const { ScoringError } = require('./errors');

function calculateRiasecScores(responses, expectedCounts = {}) {
  if (!Array.isArray(responses)) throw new ScoringError('RIASEC scoring requires a responses array.');
  const config = getScoringConfig();
  const tieBreakOrder = config.riasec_tie_break_order; // e.g. ['R','I','A','S','E','C']

  const totals = {};
  const counts = {};
  RIASEC_DIMENSIONS.forEach(dim => { totals[dim] = 0; counts[dim] = 0; });

  for (const resp of responses) {
    const dim = String(resp.dimension || '').toUpperCase();
    if (totals[dim] === undefined) continue;
    const raw = resp.numeric_value;
    // null/undefined/'' must be SKIPPED (Number(null) === 0 would fabricate a 0 answer).
    if (raw === null || raw === undefined || raw === '') continue;
    const val = Number(raw);
    if (!Number.isFinite(val)) continue; // invalid numeric answers are ignored, not defaulted
    totals[dim] += val;
    counts[dim] += 1;
  }

  const ranking = RIASEC_DIMENSIONS.map(dim => {
    const measured = counts[dim] > 0;
    const mean = measured ? totals[dim] / counts[dim] : null;
    const index = measured ? Math.round((mean / 5) * 100) : null;
    return {
      dimension: dim,
      name: RIASEC_NAMES[dim],
      mean: mean === null ? null : Number(mean.toFixed(2)),
      index,
      answered: counts[dim],
      expected: Number(expectedCounts[dim]) || 0,
      measured,
      // Explicit, stable tie-break key: smaller value ranks higher.
      tieBreakRank: tieBreakOrder.indexOf(dim) === -1 ? RIASEC_DIMENSIONS.length : tieBreakOrder.indexOf(dim)
    };
  });

  const answeredTotal = ranking.reduce((sum, r) => sum + r.answered, 0);
  if (answeredTotal === 0) {
    throw new ScoringError('RIASEC scoring failed: no RIASEC responses were recorded for this assessment.');
  }

  // Deterministic sort: score DESC, then configured tie-break order ASC.
  const sorted = [...ranking].sort((a, b) => {
    const scoreA = a.index === null ? -1 : a.index;
    const scoreB = b.index === null ? -1 : b.index;
    if (scoreB !== scoreA) return scoreB - scoreA;
    return a.tieBreakRank - b.tieBreakRank;
  });

  const hollandCode = sorted.slice(0, 3).map(d => d.dimension).join('');
  const scores = {};
  ranking.forEach(r => { scores[`${r.dimension.toLowerCase()}_score`] = r.index; });

  return {
    ...scores,
    holland_code: hollandCode,
    ranking: sorted.map(({ tieBreakRank: _tieBreakRank, ...rest }) => rest),
    items_answered: answeredTotal,
    items_expected: ranking.reduce((sum, r) => sum + r.expected, 0),
    all_dimensions_measured: ranking.every(r => r.measured),
    tie_break_applied: new Set(sorted.map(s => s.index)).size !== sorted.length
  };
}

function toRiasecRow(assessmentId, result) {
  return {
    assessment_id: assessmentId,
    r_score: result.r_score ?? 0,
    i_score: result.i_score ?? 0,
    a_score: result.a_score ?? 0,
    s_score: result.s_score ?? 0,
    e_score: result.e_score ?? 0,
    c_score: result.c_score ?? 0,
    holland_code: result.holland_code,
    dominant_traits_json: JSON.stringify({ ranking: result.ranking }),
    items_answered: result.items_answered,
    items_expected: result.items_expected,
    complete: result.all_dimensions_measured ? 1 : 0
  };
}

module.exports = { calculateRiasecScores, toRiasecRow };
