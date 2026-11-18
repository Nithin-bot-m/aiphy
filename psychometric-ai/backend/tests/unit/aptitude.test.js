// Unit tests: aptitude engine (determinism, weighting, missing data).
const { test } = require('node:test');
const assert = require('node:assert');
const { calculateAptitudeScores } = require('../../src/services/psychometrics/aptitudeEngine');

const EXPECTED = {
  numerical: 2, abstract: 2, verbal: 2, spatial: 2, logical: 2, data: 2
};

test('aptitude: weighted scoring with difficulty multipliers', () => {
  const responses = [
    { dimension: 'numerical', difficulty: 'easy', is_correct: 1 },
    { dimension: 'numerical', difficulty: 'hard', is_correct: 0 }, // weight 2.0
    { dimension: 'numerical', difficulty: 'medium', is_correct: 1 } // weight 1.5
  ];
  const r = calculateAptitudeScores(responses, { numerical: 3 });
  // weightedEarned = 1.0 + 1.5 = 2.5 ; weightedTotal = 1.0 + 2.0 + 1.5 = 4.5
  assert.strictEqual(r.dimensions.numerical.index, Math.round((2.5 / 4.5) * 100));
});

test('aptitude: unmeasured dimension is null (never a fabricated 50)', () => {
  const responses = [{ dimension: 'numerical', difficulty: 'easy', is_correct: 1 }];
  const r = calculateAptitudeScores(responses, { numerical: 2, verbal: 2 });
  assert.strictEqual(r.dimensions.verbal.index, null);
  assert.strictEqual(r.dimensions.verbal.measured, false);
  assert.strictEqual(r.dimensions.numerical.index, 100);
});

test('aptitude: overall index excludes unmeasured dimensions', () => {
  const responses = [
    { dimension: 'numerical', difficulty: 'easy', is_correct: 1 },
    { dimension: 'logical', difficulty: 'easy', is_correct: 0 }
  ];
  const r = calculateAptitudeScores(responses, EXPECTED);
  assert.strictEqual(r.overall_index, 50); // (100 + 0) / 2 measured
  assert.strictEqual(r.all_dimensions_measured, false);
});

test('aptitude: throws ScoringError when no responses at all', () => {
  assert.throws(() => calculateAptitudeScores([], EXPECTED), /no aptitude responses/);
});

test('aptitude: same input yields identical output (deterministic)', () => {
  const mk = () => [
    { dimension: 'numerical', difficulty: 'medium', is_correct: 1 },
    { dimension: 'abstract', difficulty: 'easy', is_correct: 0 },
    { dimension: 'verbal', difficulty: 'hard', is_correct: 1 }
  ];
  assert.deepStrictEqual(calculateAptitudeScores(mk(), EXPECTED), calculateAptitudeScores(mk(), EXPECTED));
});
