// Unit tests: grit engine + stream engine + congruence engine.
const { test } = require('node:test');
const assert = require('node:assert');

const { calculateGritScores } = require('../../src/services/psychometrics/gritEngine');
const { calculateStreamFits, DEFAULT_STREAM_WEIGHTS } = require('../../src/services/psychometrics/streamEngine');
const { calculateCongruence } = require('../../src/services/psychometrics/congruenceEngine');

const GRIT_EXPECTED = {
  persistence: 2, focus: 2, conscientiousness: 2, curiosity: 2,
  stress_resilience: 2, deliberate_practice: 2, response_to_failure: 2
};

// ---------- Grit ----------
test('grit: dimension means + composite + normalized index', () => {
  const answers = [
    { dimension: 'persistence', numeric_value: 4 }, { dimension: 'persistence', numeric_value: 5 },
    { dimension: 'focus', numeric_value: 3 }, { dimension: 'focus', numeric_value: 3 }
  ];
  const r = calculateGritScores(answers, GRIT_EXPECTED);
  assert.strictEqual(r.persistence, 4.5);
  assert.strictEqual(r.focus, 3);
  assert.strictEqual(r.curiosity, null); // unmeasured → null, not 3.0
  assert.strictEqual(r.composite_score, 3.75); // mean of measured dims
  assert.strictEqual(r.normalized_index, 75);
});

test('grit: output never contains a percentile field', () => {
  const r = calculateGritScores([{ dimension: 'focus', numeric_value: 5 }], GRIT_EXPECTED);
  assert.ok(!('percentile' in r), 'grit result must not fabricate a percentile');
});

test('grit: throws on empty responses', () => {
  assert.throws(() => calculateGritScores([], GRIT_EXPECTED), /no work-style responses/);
});

// ---------- Stream engine ----------
function fullScores() {
  const dims = {};
  for (const d of ['numerical', 'abstract', 'verbal', 'spatial', 'logical', 'data']) {
    dims[d] = { raw: 1, answered: 1, expected: 1, index: 80, measured: true };
  }
  return {
    aptitude: { dimensions: dims, overall_index: 80, items_answered: 6, items_expected: 6, all_dimensions_measured: true },
    riasec: { r_score: 70, i_score: 85, a_score: 55, s_score: 60, e_score: 65, c_score: 75, holland_code: 'ICR', ranking: [], all_dimensions_measured: true, items_answered: 18, items_expected: 18, tie_break_applied: false },
    grit: { composite_score: 4, normalized_index: 80, persistence: 4, focus: 4, conscientiousness: 4, curiosity: 4, stress_resilience: 4, deliberate_practice: 4, response_to_failure: 4, all_dimensions_measured: true, items_answered: 14, items_expected: 14 }
  };
}

test('stream: returns all 7 streams, ranked, with contributions', () => {
  const s = fullScores();
  const results = calculateStreamFits(s.aptitude, s.riasec, s.grit, []);
  assert.strictEqual(results.length, 7);
  for (let i = 1; i < results.length; i++) {
    assert.ok(results[i - 1].fit_score >= results[i].fit_score, 'ranked descending');
  }
  assert.strictEqual(results[0].rank_order, 1);
  for (const r of results) {
    assert.ok(r.contributions.length > 0, 'contributions present for explainability');
    assert.ok(['Strong Fit', 'Possible Fit', 'Explore Further'].includes(r.fit_band));
  }
});

test('stream: exact contribution math (PCM worked example)', () => {
  const s = fullScores();
  const results = calculateStreamFits(s.aptitude, s.riasec, s.grit, []);
  const pcm = results.find(r => r.stream_id === 'pcm');
  // weights: numerical .35, abstract .25, riasec_i .25, riasec_r .15 — all values 80/85/70
  const expected = (0.35 * 80 + 0.25 * 80 + 0.25 * 85 + 0.15 * 70) / 1.0;
  assert.strictEqual(pcm.fit_score, Number(expected.toFixed(1)));
  const sumWeights = pcm.contributions.reduce((acc, c) => acc + c.weight, 0);
  assert.ok(Math.abs(sumWeights - 1) < 1e-9);
});

test('stream: custom DB weights override defaults', () => {
  const s = fullScores();
  const rules = [{
    stream_id: 'pcm', is_active: 1,
    weight_config_json: JSON.stringify({ weights: { numerical: 1.0 } })
  }];
  const results = calculateStreamFits(s.aptitude, s.riasec, s.grit, rules);
  const pcm = results.find(r => r.stream_id === 'pcm');
  assert.strictEqual(pcm.fit_score, 80);
});

test('stream: tie-break is deterministic (equal scores → alphabetical stream_id)', () => {
  const s = fullScores();
  const flat = {};
  for (const k of ['numerical', 'abstract', 'verbal', 'spatial', 'logical', 'data']) flat[k] = { index: 70, measured: true };
  const aptitude = { dimensions: flat, overall_index: 70, all_dimensions_measured: true };
  const rules = Object.keys(DEFAULT_STREAM_WEIGHTS).map(sid => ({
    stream_id: sid, is_active: 1,
    weight_config_json: JSON.stringify({ weights: { aptitude_total: 1.0 } })
  }));
  const results = calculateStreamFits(aptitude, s.riasec, s.grit, rules);
  // every stream scores exactly 70 → ranking must be alphabetical by stream_id
  const sortedIds = results.map(r => r.stream_id);
  assert.deepStrictEqual(sortedIds, [...sortedIds].sort());
});

test('stream: throws ScoringError on missing component (no silent 50)', () => {
  const s = fullScores();
  const broken = { ...s.riasec, r_score: null };
  assert.throws(() => calculateStreamFits(s.aptitude, broken, s.grit, []), /RIASEC dimension "R" was not measured/);
});

// ---------- Congruence ----------
test('congruence: no parent data → explicit null state, never fabricated 75', () => {
  const s = fullScores();
  const streams = calculateStreamFits(s.aptitude, s.riasec, s.grit, []);
  const r = calculateCongruence({ streamResults: streams, parentExpectations: null, parentPerceptions: null, studentGrit: s.grit });
  assert.strictEqual(r.has_parent_data, false);
  assert.strictEqual(r.congruence_pct, null);
  assert.strictEqual(r.alignment_status, null);
});

test('congruence: exact match with top stream + aligned perceptions → High Alignment', () => {
  const s = fullScores();
  const streams = calculateStreamFits(s.aptitude, s.riasec, s.grit, []);
  const r = calculateCongruence({
    streamResults: streams,
    parentExpectations: { expected_stream: streams[0].stream_id, outcome_priority: 'stability' },
    parentPerceptions: { observed_analytical: 4, observed_creative: 4, observed_study_habits: 4, observed_stress_resilience: 4 },
    studentGrit: s.grit
  });
  assert.strictEqual(r.has_parent_data, true);
  assert.ok(r.congruence_pct >= 85, `expected high, got ${r.congruence_pct}`);
  assert.strictEqual(r.alignment_status, 'High Alignment');
});

test('congruence: low-ranked expected stream → moderate, neutral, no fabricated gaps', () => {
  const s = fullScores();
  const streams = calculateStreamFits(s.aptitude, s.riasec, s.grit, []);
  // humanities_law ranks 7th here → documented rank ladder clamps to 40 beyond rank 3.
  const r = calculateCongruence({
    streamResults: streams,
    parentExpectations: { expected_stream: 'humanities_law', outcome_priority: 'stability' },
    parentPerceptions: { observed_analytical: 5, observed_creative: 5, observed_study_habits: 5, observed_stress_resilience: 5 },
    studentGrit: s.grit
  });
  assert.strictEqual(r.stream_match_score, 40);
  assert.strictEqual(r.alignment_status, 'Moderate Alignment');
  // Neutral: friction details must not blame either side.
  for (const f of r.friction_factors) {
    assert.ok(!/must|should be forced|wrong/.test(f.detail), 'language must stay neutral');
  }
});

test('congruence: rank-2 expectation lands in moderate territory', () => {
  const s = fullScores();
  const streams = calculateStreamFits(s.aptitude, s.riasec, s.grit, []);
  // pcb ranks 2nd in this fixture → rank ladder score 80.
  const r = calculateCongruence({
    streamResults: streams,
    parentExpectations: { expected_stream: 'pcb', outcome_priority: 'fulfillment' },
    parentPerceptions: null,
    studentGrit: s.grit
  });
  assert.strictEqual(r.stream_match_score, 80);
  assert.strictEqual(r.alignment_status, 'Moderate Alignment');
  assert.strictEqual(r.perception_gap_score, null, 'perception gap null when perceptions missing');
});
