// Unit tests: RIASEC engine (scoring, tie handling, missing data).
const { test } = require('node:test');
const assert = require('node:assert');
const { calculateRiasecScores } = require('../../src/services/psychometrics/riasecEngine');

const EXPECTED = { R: 3, I: 3, A: 3, S: 3, E: 3, C: 3 };

test('riasec: mean scaling to 0-100 index', () => {
  const r = calculateRiasecScores([
    { dimension: 'I', numeric_value: 5 }, { dimension: 'I', numeric_value: 5 }, { dimension: 'I', numeric_value: 5 },
    { dimension: 'R', numeric_value: 4 }, { dimension: 'R', numeric_value: 4 }, { dimension: 'R', numeric_value: 4 }
  ], EXPECTED);
  assert.strictEqual(r.i_score, 100);
  assert.strictEqual(r.r_score, 80);
});

test('riasec: holland code is top 3 by score', () => {
  const r = calculateRiasecScores([
    { dimension: 'I', numeric_value: 5 }, { dimension: 'I', numeric_value: 5 }, { dimension: 'I', numeric_value: 5 },
    { dimension: 'C', numeric_value: 4 }, { dimension: 'C', numeric_value: 4 }, { dimension: 'C', numeric_value: 4 },
    { dimension: 'R', numeric_value: 3 }, { dimension: 'R', numeric_value: 3 }, { dimension: 'R', numeric_value: 3 },
    { dimension: 'A', numeric_value: 1 }, { dimension: 'A', numeric_value: 1 }, { dimension: 'A', numeric_value: 1 },
    { dimension: 'S', numeric_value: 2 }, { dimension: 'S', numeric_value: 2 }, { dimension: 'S', numeric_value: 2 },
    { dimension: 'E', numeric_value: 2 }, { dimension: 'E', numeric_value: 2 }, { dimension: 'E', numeric_value: 2 }
  ], EXPECTED);
  assert.strictEqual(r.holland_code, 'ICR');
});

test('riasec: ALL-EQUAL scores resolve via documented tie-break (R>I>A>S>E>C)', () => {
  const answers = [];
  for (const dim of ['R', 'I', 'A', 'S', 'E', 'C']) {
    for (let i = 0; i < 3; i++) answers.push({ dimension: dim, numeric_value: 3 });
  }
  const r = calculateRiasecScores(answers, EXPECTED);
  assert.strictEqual(r.tie_break_applied, true);
  // Every dimension has index 60 — top 3 must be R, I, A by hexagon tie-break order.
  assert.strictEqual(r.holland_code, 'RIA');
  // Determinism: same input → same code
  assert.strictEqual(calculateRiasecScores(answers, EXPECTED).holland_code, 'RIA');
});

test('riasec: partial tie between two dimensions keeps hexagon order', () => {
  // E and C both mean 4. Tie-break: dimension earlier in R>I>A>S>E>C ranks higher → E before C.
  const answers = [
    { dimension: 'E', numeric_value: 4 }, { dimension: 'E', numeric_value: 4 }, { dimension: 'E', numeric_value: 4 },
    { dimension: 'C', numeric_value: 4 }, { dimension: 'C', numeric_value: 4 }, { dimension: 'C', numeric_value: 4 },
    { dimension: 'R', numeric_value: 2 }, { dimension: 'R', numeric_value: 2 }, { dimension: 'R', numeric_value: 2 }
  ];
  const r = calculateRiasecScores(answers, EXPECTED);
  assert.strictEqual(r.holland_code.slice(0, 2), 'EC');
});

test('riasec: unmeasured dimension is null and excluded from code', () => {
  const answers = [
    { dimension: 'I', numeric_value: 5 }, { dimension: 'I', numeric_value: 5 }, { dimension: 'I', numeric_value: 5 },
    { dimension: 'R', numeric_value: 4 }, { dimension: 'R', numeric_value: 4 }, { dimension: 'R', numeric_value: 4 },
    { dimension: 'A', numeric_value: 3 }, { dimension: 'A', numeric_value: 3 }, { dimension: 'A', numeric_value: 3 }
  ];
  const r = calculateRiasecScores(answers, EXPECTED);
  assert.strictEqual(r.s_score, null);
  assert.strictEqual(r.e_score, null);
  assert.strictEqual(r.c_score, null);
  assert.strictEqual(r.holland_code, 'IRA');
});

test('riasec: throws on empty responses', () => {
  assert.throws(() => calculateRiasecScores([], EXPECTED), /no RIASEC responses/);
});

test('riasec: invalid numeric answers are ignored, not defaulted to 3', () => {
  const answers = [
    { dimension: 'I', numeric_value: null }, { dimension: 'I', numeric_value: 'junk' }, { dimension: 'I', numeric_value: 5 },
    { dimension: 'R', numeric_value: 5 }, { dimension: 'R', numeric_value: 5 }, { dimension: 'R', numeric_value: 5 }
  ];
  const r = calculateRiasecScores(answers, EXPECTED);
  // I mean over the single valid answer only: 5 → 100
  assert.strictEqual(r.i_score, 100);
});
