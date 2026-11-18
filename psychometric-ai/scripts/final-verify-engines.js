#!/usr/bin/env node
// final-verify-engines.js — FINAL AUDIT sections 7-14, 21, 22.
// Independent verification: every engine checked against HAND-CALCULATED
// vectors. No test data comes from the engines themselves.
//
// Sections:
//   7  Psychometric engine verification (manual vs engine, exact match)
//   10 Stream engine (weights sum, contributions, deterministic ranking, bands)
//   11 Explainability (dimension/weight/value/contribution present & correct)
//   12 RIASEC (all-R..all-C, ties, Holland code, deterministic order)
//   13 Grit (min/max/mixed, per-item contribution documentation)
//   14 Parent congruence (5 cases incl. missing data + neutral language)
//   21 Reproducibility (same responses -> byte-identical scores)
//   22 Assessment versioning (V1 vs V2 isolation)

process.env.DB_PATH = `/tmp/verify-engines-${process.pid}.db`;
process.env.NODE_ENV = 'test';
process.env.SEED_DEMO_DATA = 'true';

const fs = require('fs');
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? ' — ' + detail : ''}`);
}
function eq(name, actual, expected) {
  const ok = Object.is(actual, expected) || (typeof actual === 'number' && typeof expected === 'number' && Math.abs(actual - expected) < 1e-9);
  check(name, ok, ok ? '' : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// ---- bootstrap isolated DB + seed (needed for configService admin_settings) ----
const { runMigrations } = require('../backend/migrations/migrate');
const { seedDatabase } = require('../backend/seeds/runSeed');
runMigrations().then(() => seedDatabase()).then(async () => {
  const { calculateAptitudeScores } = require('../backend/src/services/psychometrics/aptitudeEngine');
  const { calculateRiasecScores } = require('../backend/src/services/psychometrics/riasecEngine');
  const { calculateGritScores } = require('../backend/src/services/psychometrics/gritEngine');
  const { calculateStreamFits, DEFAULT_STREAM_WEIGHTS } = require('../backend/src/services/psychometrics/streamEngine');
  const { calculateCongruence } = require('../backend/src/services/psychometrics/congruenceEngine');
  const { getScoringConfig } = require('../backend/src/services/configService');
  const config = await getScoringConfig(); // difficulty_weights: {easy:1.0, medium:1.5, hard:2.0}

  // =====================================================================
  // SECTION 7a — APTITUDE manual vectors
  // =====================================================================
  console.log('\n── SECTION 7a: Aptitude ──────────────────────────────');
  const dims = ['numerical', 'abstract', 'verbal', 'spatial', 'logical', 'data'];
  const mkExpected = () => Object.fromEntries(dims.map(d => [d, 1]));

  // Vector A1: ALL CORRECT (max) — every dimension 1 easy correct item.
  const allMax = calculateAptitudeScores(
    dims.map(d => ({ dimension: d, difficulty: 'easy', is_correct: 1 })), mkExpected());
  for (const d of dims) eq(`apt max: ${d}.index = 100`, allMax.dimensions[d].index, 100);
  eq('apt max: overall = 100', allMax.overall_index, 100);

  // Vector A2: ALL WRONG (min)
  const allMin = calculateAptitudeScores(
    dims.map(d => ({ dimension: d, difficulty: 'easy', is_correct: 0 })), mkExpected());
  for (const d of dims) eq(`apt min: ${d}.index = 0`, allMin.dimensions[d].index, 0);
  eq('apt min: overall = 0', allMin.overall_index, 0);

  // Vector A3: mixed, hand-computed.
  // numerical: easy correct (w1), medium wrong (w1.5), hard correct (w2)
  //   weightedEarned=1+0+2=3, weightedTotal=4.5 -> 3/4.5*100 = 66.666... -> round 67
  // abstract: medium correct (w1.5) -> 100
  // verbal: hard wrong (w2) -> 0
  // spatial: easy wrong + easy correct -> (0+1)/2*100 = 50
  // logical, data: no answers -> null (excluded from overall)
  // overall = round((67+100+0+50)/4) = round(54.25) = 54
  const mixed = calculateAptitudeScores([
    { dimension: 'numerical', difficulty: 'easy', is_correct: 1 },
    { dimension: 'numerical', difficulty: 'medium', is_correct: 0 },
    { dimension: 'numerical', difficulty: 'hard', is_correct: 1 },
    { dimension: 'abstract', difficulty: 'medium', is_correct: 1 },
    { dimension: 'verbal', difficulty: 'hard', is_correct: 0 },
    { dimension: 'spatial', difficulty: 'easy', is_correct: 0 },
    { dimension: 'spatial', difficulty: 'easy', is_correct: 1 }
  ], { numerical: 3, abstract: 1, verbal: 1, spatial: 2, logical: 1, data: 1 });
  eq('apt mixed: numerical=67', mixed.dimensions.numerical.index, 67);
  eq('apt mixed: abstract=100', mixed.dimensions.abstract.index, 100);
  eq('apt mixed: verbal=0', mixed.dimensions.verbal.index, 0);
  eq('apt mixed: spatial=50', mixed.dimensions.spatial.index, 50);
  eq('apt mixed: logical=null (unmeasured, never a fake 50)', mixed.dimensions.logical.index, null);
  eq('apt mixed: data=null', mixed.dimensions.data.index, null);
  eq('apt mixed: overall=54 (nulls excluded, not averaged as 50)', mixed.overall_index, 54);
  eq('apt mixed: all_dimensions_measured=false', mixed.all_dimensions_measured, false);

  // Vector A4: difficulty weights actually change results (documented weights used)
  // same correctness pattern, all-easy vs weighted mix must differ:
  const flat = calculateAptitudeScores([
    { dimension: 'numerical', difficulty: 'easy', is_correct: 0 },
    { dimension: 'numerical', difficulty: 'hard', is_correct: 1 }
  ], { numerical: 2 });
  // weighted: (0*1 + 1*2)/(1+2) = 2/3 -> 67
  eq('apt weights: hard item counts 2x (2/3 -> 67)', flat.dimensions.numerical.index, 67);

  // Vector A5: zero responses -> await ScoringError(no fabricated fallback)
  try {
    calculateAptitudeScores([], mkExpected());
    check('apt empty: throws ScoringError', false, 'no error thrown');
  } catch (err) {
    check('apt empty: throws ScoringError', err.name === 'ScoringError' || err.constructor.name === 'ScoringError', err.message);
  }

  // =====================================================================
  // SECTION 7b/12 — RIASEC manual vectors
  // =====================================================================
  console.log('\n── SECTION 7b/12: RIASEC ─────────────────────────────');
  const rDims = ['R', 'I', 'A', 'S', 'E', 'C'];

  // Vector R1: ALL-R (all 5s on R only)
  const allR = calculateRiasecScores([{ dimension: 'R', numeric_value: 5 }, { dimension: 'R', numeric_value: 5 }], {});
  eq('riasec all-R: R index=100', allR.r_score, 100);
  eq('riasec all-R: I=null', allR.i_score, null);
  eq('riasec all-R: top dimension is R', allR.ranking[0].dimension, 'R');
  eq('riasec all-R: holland code starts with R', allR.holland_code[0], 'R');

  // Vector R2: each single-dimension max → that dim ranks first (6 runs)
  for (const dim of rDims) {
    const r = calculateRiasecScores([{ dimension: dim, numeric_value: 5 }], {});
    check(`riasec all-${dim}: top dimension = ${dim}`, r.ranking[0].dimension === dim,
      `got ${r.ranking[0].dimension}`);
  }

  // Vector R3: mixed, hand-computed.
  // R: [4,2] mean 3 -> 60 ; I: [5,5,4] mean 4.6667 -> 93 (round((4.6667/5)*100)=93.33->93)
  // A: [1] -> 20 ; S: [3,4] mean 3.5 -> 70 ; E: [4,4] -> 80 ; C: [2,3] mean 2.5 -> 50
  const mixedR = calculateRiasecScores([
    { dimension: 'R', numeric_value: 4 }, { dimension: 'R', numeric_value: 2 },
    { dimension: 'I', numeric_value: 5 }, { dimension: 'I', numeric_value: 5 }, { dimension: 'I', numeric_value: 4 },
    { dimension: 'A', numeric_value: 1 },
    { dimension: 'S', numeric_value: 3 }, { dimension: 'S', numeric_value: 4 },
    { dimension: 'E', numeric_value: 4 }, { dimension: 'E', numeric_value: 4 },
    { dimension: 'C', numeric_value: 2 }, { dimension: 'C', numeric_value: 3 }
  ], {});
  eq('riasec mixed: R=60', mixedR.r_score, 60);
  eq('riasec mixed: I=93 (4.6667/5*100 rounded)', mixedR.i_score, 93);
  eq('riasec mixed: A=20', mixedR.a_score, 20);
  eq('riasec mixed: S=70', mixedR.s_score, 70);
  eq('riasec mixed: E=80', mixedR.e_score, 80);
  eq('riasec mixed: C=50', mixedR.c_score, 50);
  eq('riasec mixed: holland code = I-E-S (top3 desc)', mixedR.holland_code, 'IES');
  eq('riasec mixed: ranking order I,E,S,R,C,A', mixedR.ranking.map(r => r.dimension).join(''), 'IESRCA');

  // Vector R4: FULL TIE — all six get identical answers -> hexagon order R>I>A>S>E>C
  const tie = calculateRiasecScores(
    rDims.flatMap(d => [{ dimension: d, numeric_value: 3 }, { dimension: d, numeric_value: 3 }]), {});
  eq('riasec tie: holland code = RIA (hexagon tie-break)', tie.holland_code, 'RIA');
  eq('riasec tie: tie_break_applied=true', tie.tie_break_applied, true);
  eq('riasec tie: deterministic order R,I,A,S,E,C', tie.ranking.map(r => r.dimension).join(''), 'RIASEC');

  // Vector R5: partial tie between E and C only (both 70), I higher.
  // Scores: I=90, R=40, A=40, S=40, E=70, C=70 -> order I(90), E(70), C(70) [hexagon E before C], then R, A, S (40-tie, hexagon R<A<S)
  const partTie = calculateRiasecScores([
    { dimension: 'I', numeric_value: 5 }, { dimension: 'I', numeric_value: 4 },
    { dimension: 'R', numeric_value: 2 },
    { dimension: 'A', numeric_value: 2 }, { dimension: 'S', numeric_value: 2 },
    { dimension: 'E', numeric_value: 4 }, { dimension: 'E', numeric_value: 3 },
    { dimension: 'C', numeric_value: 4 }, { dimension: 'C', numeric_value: 3 }
  ], {});
  eq('riasec partial tie: code IEC (E before C by hexagon at 70)', partTie.holland_code, 'IEC');
  eq('riasec partial tie: E ranked before C', partTie.ranking.findIndex(r => r.dimension === 'E') < partTie.ranking.findIndex(r => r.dimension === 'C'), true);
  eq('riasec partial tie: 40-tie resolves R before A before S',
    partTie.ranking.slice(3).map(r => r.dimension).join(''), 'RAS');

  // Vector R6: null/invalid answers skipped (never Number(null)=0)
  const nullish = calculateRiasecScores([
    { dimension: 'R', numeric_value: null }, { dimension: 'R', numeric_value: 5 },
    { dimension: 'I', numeric_value: 'x' }, { dimension: 'I', numeric_value: 5 }
  ], {});
  eq('riasec nulls skipped: R=100 (only valid answer counted)', nullish.r_score, 100);
  eq('riasec nulls skipped: I=100 (invalid string ignored)', nullish.i_score, 100);

  // Vector R7: empty -> ScoringError
  try {
    calculateRiasecScores([], {});
    check('riasec empty: throws ScoringError', false, 'no error thrown');
  } catch (err) {
    check('riasec empty: throws ScoringError', err.constructor.name === 'ScoringError', err.message);
  }

  // =====================================================================
  // SECTION 7c/13 — GRIT manual vectors
  // =====================================================================
  console.log('\n── SECTION 7c/13: Grit ───────────────────────────────');
  const gDims = ['persistence', 'focus', 'conscientiousness', 'curiosity', 'stress_resilience', 'deliberate_practice', 'response_to_failure'];

  // Vector G1: minimum — every item 1
  const gMin = calculateGritScores(gDims.map(d => ({ dimension: d, numeric_value: 1 })), {});
  for (const d of gDims) eq(`grit min: ${d}=1.00`, gMin[d], 1);
  eq('grit min: composite=1.00', gMin.composite_score, 1);
  eq('grit min: normalized_index=20 (1/5*100, NOT a percentile)', gMin.normalized_index, 20);

  // Vector G2: maximum — every item 5
  const gMax = calculateGritScores(gDims.map(d => ({ dimension: d, numeric_value: 5 })), {});
  eq('grit max: composite=5.00', gMax.composite_score, 5);
  eq('grit max: normalized_index=100', gMax.normalized_index, 100);

  // Vector G3: mixed, hand-computed.
  // persistence [4,5]=4.5 ; focus [3]=3 ; conscientiousness [4,4]=4 ; curiosity [2,3,4]=3
  // stress_resilience [1,5]=3 ; deliberate_practice [4]=4 ; response_to_failure [2,2]=2
  // composite = (4.5+3+4+3+3+4+2)/7 = 23.5/7 = 3.357142... -> 3.36
  // normalized = round(3.357142.../5*100) = round(67.142857) = 67
  const gMixed = calculateGritScores([
    { dimension: 'persistence', numeric_value: 4 }, { dimension: 'persistence', numeric_value: 5 },
    { dimension: 'focus', numeric_value: 3 },
    { dimension: 'conscientiousness', numeric_value: 4 }, { dimension: 'conscientiousness', numeric_value: 4 },
    { dimension: 'curiosity', numeric_value: 2 }, { dimension: 'curiosity', numeric_value: 3 }, { dimension: 'curiosity', numeric_value: 4 },
    { dimension: 'stress_resilience', numeric_value: 1 }, { dimension: 'stress_resilience', numeric_value: 5 },
    { dimension: 'deliberate_practice', numeric_value: 4 },
    { dimension: 'response_to_failure', numeric_value: 2 }, { dimension: 'response_to_failure', numeric_value: 2 }
  ], {});
  eq('grit mixed: persistence=4.5', gMixed.persistence, 4.5);
  eq('grit mixed: composite=3.36 (manual 23.5/7)', gMixed.composite_score, 3.36);
  eq('grit mixed: normalized_index=67 (manual round(23.5/7/5*100))', gMixed.normalized_index, 67);
  eq('grit mixed: all 7 items contribute (items_answered=13)', gMixed.items_answered, 13);

  // Vector G4: unmeasured dimension excluded from composite, stays null
  const gPartial = calculateGritScores([
    { dimension: 'persistence', numeric_value: 5 }, { dimension: 'focus', numeric_value: 3 }
  ], {});
  eq('grit partial: curiosity=null (never mid-default)', gPartial.curiosity, null);
  eq('grit partial: composite=(5+3)/2=4.00 (only measured dims)', gPartial.composite_score, 4);
  eq('grit partial: all_dimensions_measured=false', gPartial.all_dimensions_measured, false);

  // Vector G5: no reverse-scored items in this instrument — verify monotonicity:
  // raising every answer must raise (or hold) the composite. Reverse scoring would break this.
  const gLow = calculateGritScores(gDims.map(d => ({ dimension: d, numeric_value: 2 })), {});
  const gHigh = calculateGritScores(gDims.map(d => ({ dimension: d, numeric_value: 4 })), {});
  check('grit: no reverse-scored items (higher answers -> higher composite)', gHigh.composite_score > gLow.composite_score);

  // Vector G6: empty -> ScoringError
  try {
    calculateGritScores([], {});
    check('grit empty: throws ScoringError', false, 'no error thrown');
  } catch (err) {
    check('grit empty: throws ScoringError', err.constructor.name === 'ScoringError', err.message);
  }

  // =====================================================================
  // SECTION 10/11 — STREAM ENGINE manual verification
  // =====================================================================
  console.log('\n── SECTION 10/11: Stream engine ──────────────────────');
  // Verify every stream's configured weights sum to 1.0 (implementation contract).
  for (const [sid, profile] of Object.entries(DEFAULT_STREAM_WEIGHTS)) {
    const sum = Object.values(profile.weights).reduce((s, w) => s + w, 0);
    check(`stream ${sid}: weights sum to 1.0`, Math.abs(sum - 1) < 1e-9, `sum=${sum}`);
  }

  // Hand-compute EVERY stream with the documented formula Σ(w·v)/Σ(w):
  const manualInputs = {
    aptitude: {
      dimensions: {
        numerical: { index: 82 }, abstract: { index: 76 }, verbal: { index: 70 },
        spatial: { index: 80 }, logical: { index: 84 }, data: { index: 73 }
      },
      overall_index: 78
    },
    riasec: { r_score: 65, i_score: 86, a_score: 58, s_score: 62, e_score: 70, c_score: 75 },
    grit: { normalized_index: 79.6 }
  };
  const manualExpected = {
    pcm: (0.35 * 82 + 0.25 * 76 + 0.25 * 86 + 0.15 * 65) / 1.0,                    // 28.7+19+21.5+9.75 = 78.95 -> 79 (banker? no, toFixed half-up) check below
    pcb: (0.20 * 82 + 0.20 * 76 + 0.35 * 86 + 0.15 * 62 + 0.10 * 79.6) / 1.0,      // 16.4+15.2+30.1+9.3+7.96 = 78.96 -> 79.0
    commerce_math: (0.30 * 82 + 0.30 * 70 + 0.20 * 75 + 0.20 * 79.6) / 1.0,        // 24.6+21+15+15.92 = 76.52 -> 76.5
    commerce_no_math: (0.35 * 70 + 0.30 * 75 + 0.20 * 62 + 0.15 * 79.6) / 1.0,     // 24.5+22.5+12.4+11.94 = 71.34 -> 71.3
    humanities_law: (0.35 * 70 + 0.25 * 62 + 0.25 * 58 + 0.15 * 70) / 1.0,         // 24.5+15.5+14.5+10.5 = 65 -> 65.0
    design: (0.35 * 80 + 0.35 * 58 + 0.15 * 76 + 0.15 * 86) / 1.0,                 // 28+20.3+11.4+12.9 = 72.6
    vocational: (0.40 * 65 + 0.30 * 75 + 0.30 * 78) / 1.0                          // 26+22.5+23.4 = 71.9
  };
  const streamResults = calculateStreamFits(manualInputs.aptitude, manualInputs.riasec, manualInputs.grit, []);
  const byId = Object.fromEntries(streamResults.map(s => [s.stream_id, s]));
  for (const [sid, manual] of Object.entries(manualExpected)) {
    const manualRounded = Number(manual.toFixed(1));
    eq(`stream ${sid}: fit_score matches hand calculation (${manualRounded})`, byId[sid].fit_score, manualRounded);
    // Band by documented thresholds: >=75 Strong, 55-74.999 Possible, else Explore
    const expectBand = manualRounded >= 75 ? 'Strong Fit' : manualRounded >= 55 ? 'Possible Fit' : 'Explore Further';
    eq(`stream ${sid}: band = ${expectBand}`, byId[sid].fit_band, expectBand);
  }

  // All 7 streams calculated + every contribution stored (explainability)
  check('stream: all 7 streams calculated', streamResults.length === 7, `got ${streamResults.length}`);
  let explainOk = true; let explainDetail = '';
  for (const s of streamResults) {
    const weights = s.weights_used;
    if (s.contributions.length !== Object.keys(weights).length) { explainOk = false; explainDetail = `${s.stream_id} contribution count`; break; }
    for (const c of s.contributions) {
      const w = weights[c.component];
      if (!(typeof w === 'number' && w === c.weight && c.value >= 0 && c.value <= 100 && Math.abs(c.contribution - Number((w * c.value).toFixed(1))) < 0.05)) {
        explainOk = false; explainDetail = `${s.stream_id}.${c.component} w=${w} v=${c.value} c=${c.contribution}`; break;
      }
    }
    // fit score == Σ contributions(unrounded)/Σw — verify via stored pieces:
    const wSum = Object.values(weights).reduce((a, b) => a + b, 0);
    const cSum = s.contributions.reduce((a, c) => a + c.weight * c.value, 0);
    if (Math.abs(Number((cSum / wSum).toFixed(1)) - s.fit_score) > 0.05) { explainOk = false; explainDetail = `${s.stream_id} Σ(w·v)/Σw mismatch`; break; }
  }
  check('stream explainability: every {component, weight, value, contribution} stored & arithmetically consistent', explainOk, explainDetail);

  // Deterministic ranking: score desc, tie-break stream_id asc.
  const sortedDesc = [...streamResults].sort((a, b) => (b.fit_score - a.fit_score) || a.stream_id.localeCompare(b.stream_id));
  check('stream: ranking deterministic (score desc, id asc)', streamResults.every((s, i) => s === sortedDesc[i] && s.rank_order === i + 1));
  // Equal-score tie-break test:
  const t1 = calculateStreamFits(
    { dimensions: Object.fromEntries(dims.map(d => [d, { index: 50 }])), overall_index: 50 },
    { r_score: 50, i_score: 50, a_score: 50, s_score: 50, e_score: 50, c_score: 50 },
    { normalized_index: 50 }, []);
  const equalScores = new Set(t1.map(s => s.fit_score));
  const expectedOrder = [...t1].sort((a, b) => (b.fit_score - a.fit_score) || a.stream_id.localeCompare(b.stream_id));
  check('stream: uniform input -> deterministic tie-break (alphabetical stream_id)',
    t1.every((s, i) => s === expectedOrder[i]) && equalScores.size === 1,
    `order=${t1.map(s => s.stream_id).join(',')}`);

  // Missing component -> explicit await ScoringError(never a silent default 50)
  try {
    calculateStreamFits(
      { dimensions: { numerical: { index: 80 } }, overall_index: 80 }, // abstract missing
      { r_score: 50, i_score: 50, a_score: 50, s_score: 50, e_score: 50, c_score: 50 },
      { normalized_index: 50 }, []);
    check('stream: unmeasured aptitude component -> ScoringError', false, 'no error');
  } catch (err) {
    check('stream: unmeasured aptitude component -> ScoringError', err.constructor.name === 'ScoringError' && err.message.includes('abstract'), err.message);
  }

  // DB rule override: custom weights replace defaults
  const customRules = [{ stream_id: 'pcm', stream_name: 'PCM custom', is_active: 1, weight_config_json: JSON.stringify({ weights: { numerical: 0.5, riasec_i: 0.5 } }) }];
  const overridden = calculateStreamFits(manualInputs.aptitude, manualInputs.riasec, manualInputs.grit, customRules);
  const pcmOver = overridden.find(s => s.stream_id === 'pcm');
  eq('stream: DB scoring_rules override defaults (0.5*82+0.5*86=84)', pcmOver.fit_score, 84);
  eq('stream: overridden stream name from DB rule', pcmOver.stream_name, 'PCM custom');
  // non-active rules ignored:
  const inactiveRules = [{ stream_id: 'pcm', is_active: 0, weight_config_json: JSON.stringify({ weights: { numerical: 0.5, riasec_i: 0.5 } }) }];
  const notOverridden = calculateStreamFits(manualInputs.aptitude, manualInputs.riasec, manualInputs.grit, inactiveRules);
  eq('stream: inactive rules ignored', notOverridden.find(s => s.stream_id === 'pcm').fit_score, byId.pcm.fit_score);

  // =====================================================================
  // SECTION 14 — CONGRUENCE (5 cases + neutral language)
  // =====================================================================
  console.log('\n── SECTION 14: Congruence ────────────────────────────');
  const cg = config.congruence;
  const streamsFor = (orderIds) => orderIds.map((id, i) => ({
    stream_id: id,
    stream_name: { pcm: 'Science / PCM', pcb: 'Science / PCB', design: 'Design / Creative Arts', commerce_math: 'Commerce with Mathematics', humanities_law: 'Humanities / Law' }[id] || id,
    fit_score: 90 - i * 5, fit_band: 'Strong Fit'
  }));
  const gritAligned = { normalized_index: 80, stress_resilience: 4.0, curiosity: 4.0, conscientiousness: 4.0 };
  const percep = { observed_analytical: 4, observed_creative: 4, observed_study_habits: 4, observed_stress_resilience: 4 };
  // Manual: all parent sides 80 (4/5*100); student sides 80 -> gaps 0 -> perceptionGap=100

  // CASE 1: agree — parent expects student's top stream.
  const c1 = calculateCongruence({ streamResults: streamsFor(['pcm', 'pcb', 'design']), parentExpectations: { expected_stream: 'pcm', expected_stream_name: 'Science / PCM', outcome_priority: 'prestige' }, parentPerceptions: percep, studentGrit: gritAligned });
  const manualC1 = Math.round(cg.stream_match_rank_scores['1'] * cg.stream_match_weight + 100 * cg.perception_gap_weight); // 60+40=100
  eq('congruence case1 (agree): stream_match=100', c1.stream_match_score, 100);
  eq('congruence case1: congruence=100 (manual 0.6*100+0.4*100)', c1.congruence_pct, manualC1);
  eq('congruence case1: band=High Alignment', c1.alignment_status, 'High Alignment');
  eq('congruence case1: no friction factors', c1.friction_factors.length, 0);

  // CASE 2: strong disagreement — parent expects design (not ranked, cross-family from pcm)
  const c2 = calculateCongruence({ streamResults: streamsFor(['pcm', 'pcb', 'commerce_math']), parentExpectations: { expected_stream: 'design', expected_stream_name: 'Design / Creative Arts', outcome_priority: 'stability' }, parentPerceptions: { observed_analytical: 1, observed_creative: 1, observed_study_habits: 1, observed_stress_resilience: 1 }, studentGrit: gritAligned });
  // perception gaps: parent 20 vs student 80/80/80/80 -> avg gap 60 -> 100-60*0.8=52 -> max(20,min(100,52))=52
  // congruence = round(30*0.6 + 52*0.4) = round(18+20.8) = 39 -> High Friction
  eq('congruence case2 (disagree): stream_match=30 (cross-family)', c2.stream_match_score, cg.cross_family_score);
  eq('congruence case2: perception_gap=52 (manual 100-avg60*0.8)', c2.perception_gap_score, 52);
  eq('congruence case2: congruence=39 (manual)', c2.congruence_pct, 39);
  eq('congruence case2: band=High Friction', c2.alignment_status, 'High Friction');
  check('congruence case2: friction factors include stream_direction + perceptions',
    c2.friction_factors.some(f => f.area === 'stream_direction') && c2.friction_factors.some(f => f.area.startsWith('perception_')));

  // CASE 3: partial agreement — parent expects rank-2 stream.
  const c3 = calculateCongruence({ streamResults: streamsFor(['pcm', 'pcb', 'design']), parentExpectations: { expected_stream: 'pcb', expected_stream_name: 'Science / PCB', outcome_priority: 'balanced' }, parentPerceptions: percep, studentGrit: gritAligned });
  const manualC3 = Math.round(cg.stream_match_rank_scores['2'] * cg.stream_match_weight + 100 * cg.perception_gap_weight); // round(48+40)=88
  eq('congruence case3 (partial): stream_match=80 (rank-2 ladder)', c3.stream_match_score, 80);
  eq('congruence case3: congruence=88 (manual)', c3.congruence_pct, manualC3);
  eq('congruence case3: band=High Alignment (85+)', c3.alignment_status, 'High Alignment');

  // CASE 4: parent data missing — explicit null state.
  const c4 = calculateCongruence({ streamResults: streamsFor(['pcm']), parentExpectations: null, parentPerceptions: null, studentGrit: gritAligned });
  eq('congruence case4 (parent missing): has_parent_data=false', c4.has_parent_data, false);
  eq('congruence case4: congruence_pct=null (no fabricated 75)', c4.congruence_pct, null);
  eq('congruence case4: alignment_status=null', c4.alignment_status, null);
  eq('congruence case4: friction_factors empty', c4.friction_factors.length, 0);

  // CASE 5: student data missing (no streams yet), parent expects something.
  const c5 = calculateCongruence({ streamResults: [], parentExpectations: { expected_stream: 'pcm', expected_stream_name: 'Science / PCM', outcome_priority: 'prestige' }, parentPerceptions: null, studentGrit: null });
  eq('congruence case5 (student missing): stream_match=25 (no_match_score)', c5.stream_match_score, cg.no_match_score);
  eq('congruence case5: perception_gap=null (nothing to compare)', c5.perception_gap_score, null);
  eq('congruence case5: congruence rests on stream match only (25, documented)', c5.congruence_pct, 25);
  eq('congruence case5: band=High Friction (documented banding)', c5.alignment_status, 'High Friction');

  // Case 4b: perceptions present but student grit missing — only stream match.
  const c4b = calculateCongruence({ streamResults: streamsFor(['pcm']), parentExpectations: { expected_stream: 'pcm', expected_stream_name: 'Science / PCM', outcome_priority: 'prestige' }, parentPerceptions: percep, studentGrit: null });
  eq('congruence case4b (grit missing): perception_gap=null', c4b.perception_gap_score, null);
  eq('congruence case4b: congruence=stream_match only (documented)', c4b.congruence_pct, 100);

  // Neutral language check across all friction output
  const allFriction = [c1, c2, c3, c4, c5, c4b].flatMap(c => [...(c.friction_factors || []).map(f => f.detail), ...(c.discussion_areas || [])]).join(' ');
  const loaded = allFriction.match(/\b(must|destined|guarantee|guaranteed|blame|fault|wrong choice|bad parent|failure)\b/gi);
  check('congruence: neutral language (no loaded/emotionally-charged terms)', !loaded, loaded ? loaded.join(',') : '');

  // =====================================================================
  // SECTION 21 — REPRODUCIBILITY
  // =====================================================================
  console.log('\n── SECTION 21: Reproducibility ───────────────────────');
  const repInputs = () => ({
    apt: calculateAptitudeScores([
      { dimension: 'numerical', difficulty: 'easy', is_correct: 1 },
      { dimension: 'numerical', difficulty: 'hard', is_correct: 0 },
      { dimension: 'abstract', difficulty: 'medium', is_correct: 1 },
      { dimension: 'verbal', difficulty: 'easy', is_correct: 1 },
      { dimension: 'spatial', difficulty: 'medium', is_correct: 0 },
      { dimension: 'logical', difficulty: 'hard', is_correct: 1 },
      { dimension: 'data', difficulty: 'medium', is_correct: 1 }
    ], { numerical: 2, abstract: 1, verbal: 1, spatial: 1, logical: 1, data: 1 }),
    ria: calculateRiasecScores([
      { dimension: 'R', numeric_value: 4 }, { dimension: 'R', numeric_value: 3 },
      { dimension: 'I', numeric_value: 5 }, { dimension: 'I', numeric_value: 4 }, { dimension: 'I', numeric_value: 5 },
      { dimension: 'A', numeric_value: 2 }, { dimension: 'A', numeric_value: 3 },
      { dimension: 'S', numeric_value: 3 }, { dimension: 'S', numeric_value: 4 },
      { dimension: 'E', numeric_value: 4 }, { dimension: 'E', numeric_value: 3 },
      { dimension: 'C', numeric_value: 4 }, { dimension: 'C', numeric_value: 4 }
    ], {}),
    gri: calculateGritScores(gDims.map((d, i) => ({ dimension: d, numeric_value: 3 + (i % 3) })), {})
  });
  const run1 = repInputs();
  const run2 = repInputs();
  const snap = (r) => JSON.stringify({ a: r.apt, r: r.ria, g: r.gri });
  eq('reproducibility: two full engine passes -> byte-identical JSON', snap(run1) === snap(run2) ? 1 : 0, 1);
  const s1 = calculateStreamFits(run1.apt, run1.ria, run1.gri, []);
  const s2 = calculateStreamFits(run2.apt, run2.ria, run2.gri, []);
  eq('reproducibility: stream scores + ranks identical across runs', JSON.stringify(s1) === JSON.stringify(s2) ? 1 : 0, 1);

  // Congruence determinism
  const cc1 = calculateCongruence({ streamResults: s1, parentExpectations: { expected_stream: s1[0].stream_id, expected_stream_name: s1[0].stream_name, outcome_priority: 'balanced' }, parentPerceptions: percep, studentGrit: run1.gri });
  const cc2 = calculateCongruence({ streamResults: s2, parentExpectations: { expected_stream: s2[0].stream_id, expected_stream_name: s2[0].stream_name, outcome_priority: 'balanced' }, parentPerceptions: percep, studentGrit: run2.gri });
  eq('reproducibility: congruence identical across runs', JSON.stringify(cc1) === JSON.stringify(cc2) ? 1 : 0, 1);

  // =====================================================================
  // SECTION 22 — ASSESSMENT VERSIONING (V1 vs V2, DB-level isolation)
  // =====================================================================
  console.log('\n── SECTION 22: Assessment versioning ─────────────────');
  const { db } = require('../backend/src/config/db');
  const v1 = await db.prepare('SELECT * FROM assessment_versions WHERE version_code = ?').get('V1');
  check('V1 battery seeded', !!v1);
  const v1Questions = await db.prepare('SELECT * FROM questions WHERE version_id = ? AND is_active = 1 ORDER BY id').all(v1.id);
  const STUDENT_MODULES = ['aptitude', 'riasec', 'grit'];
  const studentQuestions = v1Questions.filter(q => STUDENT_MODULES.includes(q.module));
  const aptCount = studentQuestions.filter(q => q.module === 'aptitude').length;
  const riasecCount = studentQuestions.filter(q => q.module === 'riasec').length;
  const gritCount = studentQuestions.filter(q => q.module === 'grit').length;
  const parentCount = v1Questions.length - studentQuestions.length;
  check(`V1 battery composition (12 apt / 18 riasec / 14 grit = 44 student + 10 parent items)`,
    aptCount === 12 && riasecCount === 18 && gritCount === 14 && studentQuestions.length === 44 && parentCount === 10,
    `apt=${aptCount} ria=${riasecCount} grit=${gritCount} parent=${parentCount}`);

  // Create V2: clone V1, change ONE question (deactivate old, insert new wording)
  const { v2Id, changedId, revisedText } = await (async () => {
    const { transaction } = require('../backend/src/config/db');
    return transaction(async () => {
      const info = await db.prepare(`INSERT INTO assessment_versions (version_code, name, description, is_active) VALUES ('V2-AUDIT', 'Audit V2 (changed 1 item)', 'temp', 0)`).run();
      const v2Id = Number(info.lastInsertRowid);
      const changed = await db.prepare(`SELECT * FROM questions WHERE version_id = ? AND module = 'riasec' ORDER BY id LIMIT 1`).get(v1.id);
      const changedOpts = await db.prepare('SELECT * FROM question_options WHERE question_id = ? ORDER BY display_order').all(changed.id);
      const insQ = db.prepare(`INSERT INTO questions (version_id, module, category, difficulty, question_text, question_type, dimension, display_order, is_active)
                               VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`);
      const insOpt = db.prepare(`INSERT INTO question_options (question_id, option_key, option_text, score_value, dimension_target, display_order) VALUES (?, ?, ?, ?, ?, ?)`);
      for (const q of v1Questions) {
        if (q.id === changed.id) continue; // V2 replaces this one item
        const qi = await insQ.run(v2Id, q.module, q.category, q.difficulty, q.question_text, q.question_type, q.dimension, q.display_order);
        const opts = await db.prepare('SELECT * FROM question_options WHERE question_id = ? ORDER BY display_order').all(q.id);
        for (const o of opts) {
          await insOpt.run(Number(qi.lastInsertRowid), o.option_key, o.option_text, o.score_value, o.dimension_target, o.display_order);
        }
      }
      // the CHANGED question: same dimension/type, new wording
      const qi = await insQ.run(v2Id, changed.module, changed.category, changed.difficulty, '[V2 REVISED] ' + changed.question_text, changed.question_type, changed.dimension, changed.display_order);
      for (const o of changedOpts) {
        await insOpt.run(Number(qi.lastInsertRowid), o.option_key, o.option_text, o.score_value, o.dimension_target, o.display_order);
      }
      return { v2Id, changedId: changed.id, revisedText: '[V2 REVISED] ' + changed.question_text };
    });
  })();
  check('V2 created with 54 questions (44 student + 10 parent)', (await db.prepare('SELECT COUNT(*) c FROM questions WHERE version_id = ? AND is_active = 1').get(v2Id)).c === 54);
  check('V2 student module composition unchanged (44)', (await db.prepare(`SELECT COUNT(*) c FROM questions WHERE version_id = ? AND is_active = 1 AND module IN ('aptitude','riasec','grit')`).get(v2Id)).c === 44);
  check('V2 contains the revised item text', (await db.prepare('SELECT COUNT(*) c FROM questions WHERE version_id = ? AND question_text = ?').get(v2Id, revisedText)).c === 1);
  check('V2 does NOT contain the original V1 changed item', (await db.prepare('SELECT COUNT(*) c FROM questions WHERE version_id = ? AND id = ?').get(v2Id, changedId)).c === 0);

  // V1 results reproducible: V1 question rows untouched by V2 creation
  const v1After = await db.prepare('SELECT * FROM questions WHERE version_id = ? AND is_active = 1 ORDER BY id').all(v1.id);
  eq('versioning: V1 question set byte-identical after V2 creation', JSON.stringify(v1Questions) === JSON.stringify(v1After) ? 1 : 0, 1);

  // Idempotent re-run of migrations must not alter data
  await runMigrations();
  const v1After2 = await db.prepare('SELECT * FROM questions WHERE version_id = ? AND is_active = 1 ORDER BY id').all(v1.id);
  eq('migrations: replay is idempotent (V1 rows unchanged)', JSON.stringify(v1Questions) === JSON.stringify(v1After2) ? 1 : 0, 1);

  // =====================================================================
  const failed = results.filter(r => !r.ok);
  console.log(`\n==== ENGINE VERIFICATION: ${results.length - failed.length}/${results.length} PASS, ${failed.length} FAIL ====`);
  fs.unlinkSync(process.env.DB_PATH);
  for (const suffix of ['-wal', '-shm']) { try { fs.unlinkSync(process.env.DB_PATH + suffix); } catch { /* ok */ } }
  process.exit(failed.length ? 1 : 0);
}).catch(err => { console.error('BOOTSTRAP FAILED:', err); process.exit(1); });
