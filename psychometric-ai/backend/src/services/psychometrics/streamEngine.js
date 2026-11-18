// Stream Fit Engine — deterministic, contribution-explainable.
//
// Fit score = Σ(weight × normalized component value) / Σ(weight), 0-100 scale.
// - Weights & stream metadata (career clusters, curriculum) come from the
//   versioned scoring_rules table; DEFAULT_STREAM_WEIGHTS is the fallback used
//   when a version has no active rule for a stream.
// - Every component contribution is stored for explainability ("why this score?").
// - Missing/unmeasured components throw ScoringError — the engine NEVER
//   substitutes a mid-scale default (e.g. 50).
// - Ranking ties are broken deterministically: fit_score DESC, then stream_id ASC.
const { STREAMS } = require('../../config/constants');
const { getScoringConfig } = require('../configService');
const { ScoringError } = require('./errors');

// Product-default weights per stream. These are heuristics, not validated
// parameters; they are seeded into scoring_rules and editable by admins.
const DEFAULT_STREAM_WEIGHTS = {
  pcm: {
    stream_id: 'pcm', stream_name: STREAMS.PCM,
    weights: { numerical: 0.35, abstract: 0.25, riasec_i: 0.25, riasec_r: 0.15 }
  },
  pcb: {
    stream_id: 'pcb', stream_name: STREAMS.PCB,
    weights: { numerical: 0.20, abstract: 0.20, riasec_i: 0.35, riasec_s: 0.15, grit: 0.10 }
  },
  commerce_math: {
    stream_id: 'commerce_math', stream_name: STREAMS.COMMERCE_MATH,
    weights: { numerical: 0.30, riasec_e: 0.30, riasec_c: 0.20, grit: 0.20 }
  },
  commerce_no_math: {
    stream_id: 'commerce_no_math', stream_name: STREAMS.COMMERCE_NO_MATH,
    weights: { riasec_e: 0.35, riasec_c: 0.30, riasec_s: 0.20, grit: 0.15 }
  },
  humanities_law: {
    stream_id: 'humanities_law', stream_name: STREAMS.HUMANITIES_LAW,
    weights: { verbal: 0.35, riasec_s: 0.25, riasec_a: 0.25, riasec_e: 0.15 }
  },
  design: {
    stream_id: 'design', stream_name: STREAMS.DESIGN,
    weights: { spatial: 0.35, riasec_a: 0.35, abstract: 0.15, riasec_i: 0.15 }
  },
  vocational: {
    stream_id: 'vocational', stream_name: STREAMS.VOCATIONAL,
    weights: { riasec_r: 0.40, riasec_c: 0.30, aptitude_total: 0.30 }
  }
};

// Maps a weight key to the normalized 0-100 value from computed score objects.
function resolveComponentValue(key, inputs) {
  const { aptitude, riasec, grit } = inputs;
  const aptitudeMap = {
    numerical: aptitude?.dimensions?.numerical?.index,
    abstract: aptitude?.dimensions?.abstract?.index,
    verbal: aptitude?.dimensions?.verbal?.index,
    spatial: aptitude?.dimensions?.spatial?.index,
    logical: aptitude?.dimensions?.logical?.index,
    data: aptitude?.dimensions?.data?.index,
    aptitude_total: aptitude?.overall_index
  };
  if (key in aptitudeMap) {
    const value = aptitudeMap[key];
    if (value === null || value === undefined) {
      throw new ScoringError(`Stream scoring failed: aptitude component "${key}" was not measured.`);
    }
    return value;
  }
  const riasecMap = { r: riasec?.r_score, i: riasec?.i_score, a: riasec?.a_score, s: riasec?.s_score, e: riasec?.e_score, c: riasec?.c_score };
  if (key.startsWith('riasec_')) {
    const value = riasecMap[key.slice(7)];
    if (value === null || value === undefined) {
      throw new ScoringError(`Stream scoring failed: RIASEC dimension "${key.slice(7).toUpperCase()}" was not measured.`);
    }
    return value;
  }
  if (key === 'grit') {
    const value = grit?.normalized_index;
    if (value === null || value === undefined) {
      throw new ScoringError('Stream scoring failed: work-style (grit) index was not measured.');
    }
    return value;
  }
  throw new ScoringError(`Stream scoring failed: unknown scoring component "${key}".`);
}

function parseRuleWeights(rule) {
  if (!rule) return null;
  try {
    const parsed = typeof rule.weight_config_json === 'string'
      ? JSON.parse(rule.weight_config_json)
      : rule.weight_config_json;
    return parsed && parsed.weights ? parsed : null;
  } catch {
    return null; // malformed admin rule falls back to defaults rather than crashing
  }
}

/**
 * @param {Object} aptitude  result of calculateAptitudeScores
 * @param {Object} riasec    result of calculateRiasecScores
 * @param {Object} grit      result of calculateGritScores
 * @param {Array}  activeRules scoring_rules rows (versioned) for this assessment version
 */
function calculateStreamFits(aptitude, riasec, grit, activeRules = []) {
  const config = getScoringConfig();
  const rulesByStream = {};
  (activeRules || []).forEach(rule => {
    if (rule.is_active) rulesByStream[String(rule.stream_id).toLowerCase()] = rule;
  });

  const results = Object.keys(DEFAULT_STREAM_WEIGHTS).map(streamKey => {
    const defaultProfile = DEFAULT_STREAM_WEIGHTS[streamKey];
    const rule = rulesByStream[streamKey];
    const parsedRule = parseRuleWeights(rule);
    const weights = (parsedRule && parsedRule.weights) || defaultProfile.weights;
    const streamName = (rule && rule.stream_name) || defaultProfile.stream_name;
    const careerClusters = (parsedRule && parsedRule.career_clusters) || [];
    const curriculumBoards = (parsedRule && parsedRule.curriculum_boards) || {};

    let weightedSum = 0;
    let weightTotal = 0;
    const contributions = [];

    for (const [param, weight] of Object.entries(weights)) {
      const value = resolveComponentValue(param, { aptitude, riasec, grit });
      const contribution = Number((weight * value).toFixed(1));
      weightedSum += weight * value;
      weightTotal += weight;
      contributions.push({ component: param, weight, value, contribution });
    }

    const fitScore = weightTotal > 0 ? Number((weightedSum / weightTotal).toFixed(1)) : 0;
    const band = config.fit_bands.find(b => fitScore >= b.min && fitScore <= b.max);

    return {
      stream_id: streamKey,
      stream_name: streamName,
      fit_score: fitScore,
      fit_band: band ? band.label : 'Explore Further',
      contributions,
      weights_used: weights,
      career_clusters: careerClusters,
      curriculum_boards: curriculumBoards
    };
  });

  // Deterministic ranking: score DESC, then stream_id ASC (stable, documented).
  results.sort((a, b) => (b.fit_score - a.fit_score) || a.stream_id.localeCompare(b.stream_id));
  results.forEach((r, i) => { r.rank_order = i + 1; });
  return results;
}

module.exports = { DEFAULT_STREAM_WEIGHTS, calculateStreamFits, resolveComponentValue };
