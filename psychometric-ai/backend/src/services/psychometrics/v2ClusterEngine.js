// Deterministic V2 8-Module & 16-Cluster Psychometric Engine.
// Implements 00_Interest_Segregation_and_Scoring.md §§3-8 faithfully.
//
// HARD GUARANTEES:
//   - Gender, handedness, budget, relocation, family business & marks_band
//     NEVER modify Interest, Passion, Aptitude, Personality, Values, or Cluster ranks.
//   - Grade 10 and Grade 12 norms never mix; `norm_status` stays 'provisional'
//     until grade cohort N >= 500.
//   - Deterministic: identical inputs + same norms produce byte-identical outputs.

const {
  CLUSTERS, CLUSTER_IDS, PERSONALITY_DIMS, THINKING_STYLES,
  VALUE_CODES, EQ_FACETS, DECISION_STYLES, GRADE_10_STREAMS,
  CLUSTER_KEYWORDS, CRE_FLEXIBILITY_CATEGORIES, NON_POSITIVE_OPEN_TEXT_REGEX
} = require('./v2Constants');
const { parseKey, parseOpts } = require('./blueprintV2Strategy');
const { runValidityChecks } = require('./validityEngine');

function clip(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function round1(n) {
  return Math.round(Number(n) * 10) / 10;
}

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function mean(arr) {
  if (!arr || arr.length === 0) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stdDev(arr) {
  if (!arr || arr.length < 2) return 0;
  const m = mean(arr);
  const v = arr.reduce((acc, x) => acc + (x - m) ** 2, 0) / arr.length;
  return Math.sqrt(v);
}

// Normal CDF percentile approximation (Abramowitz & Stegun) for cohort N >= 500
function normPercentileFromZ(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  const cdf = z > 0 ? 1 - prob : prob;
  return round1(clip(cdf * 100, 1, 99));
}

/** Parse M1 Profile & Context without mutating scores. */
function extractM1Profile(responsesJoined) {
  const ctx = {};
  for (const r of responsesJoined) {
    if (r.module !== 1 || !r.field_name) continue;
    const opts = parseOpts(r);
    if (r.item_type === 'multi_select') {
      let keys = [];
      try { keys = JSON.parse(r.response_json || '[]'); } catch { /* ignore invalid JSON */ }
      ctx[r.field_name] = keys.map((k) => {
        const match = opts.find((o) => String(o.k) === String(k));
        return match ? { k, text: match.text } : { k, text: String(k) };
      });
    } else if (r.answer_key != null) {
      const match = opts.find((o) => String(o.k) === String(r.answer_key));
      ctx[r.field_name] = match ? { k: String(r.answer_key), text: match.text } : { k: String(r.answer_key), text: String(r.answer_key) };
    }
  }
  const supportText = ctx.learning_support?.text || '';
  const hasAccommodation = /dyslexia|adhd|extra time|slow writer|yes/i.test(supportText) && !/^none|no/i.test(supportText);
  return {
    raw: ctx,
    grade: ctx.grade?.text?.includes('12') ? 12 : 10,
    board: ctx.board?.text || null,
    marks_band: ctx.marks_band?.text || null,
    budget: ctx.budget?.text || null,
    relocate: ctx.relocate?.text || null,
    own_dream: ctx.own_dream?.text || null,
    parent_pref: ctx.parent_pref?.text || null,
    certainty: ctx.certainty?.text || null,
    fav_subjects: Array.isArray(ctx.fav_subjects) ? ctx.fav_subjects.map((x) => x.text) : [],
    accommodations: {
      extended_time_pct: hasAccommodation ? 25 : 0,
      simpler_wording: Number(ctx.english_comfort?.k || 5) <= 2
    }
  };
}

/** Deterministic keyword matcher mapping open_text evidence onto C01..C16. */
function matchOpenTextToClusters(text) {
  if (!text || typeof text !== 'string') return [];
  const lower = text.toLowerCase();
  const hits = [];
  for (const cid of CLUSTER_IDS) {
    const kws = CLUSTER_KEYWORDS[cid] || [];
    let score = 0;
    for (const kw of kws) {
      if (lower.includes(kw)) score += 1;
    }
    if (score > 0) hits.push({ cluster: cid, matches: score });
  }
  return hits.sort((a, b) => b.matches - a.matches).slice(0, 4);
}

/** Deterministic Divergent Thinking scorer for M4 CRE open_text (spec rubric). */
function scoreCreativityOpenText(text) {
  if (!text || typeof text !== 'string' || !text.trim()) {
    return { fluency: 0, flexibility: 0, elaboration: 0, score: 0, idea_count: 0 };
  }
  // Split ideas by newlines, commas, semicolons, numbered bullets
  const rawIdeas = text
    .split(/[\n,;]+|\b\d+[.)]\s*/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2);
  const uniqueIdeas = [...new Set(rawIdeas.map((s) => s.toLowerCase()))];
  const fluencyCount = uniqueIdeas.length;

  // Flexibility: how many distinct functional categories in CRE_FLEXIBILITY_CATEGORIES match
  let categoriesHit = 0;
  const joined = uniqueIdeas.join(' ');
  for (const catWords of CRE_FLEXIBILITY_CATEGORIES) {
    if (catWords.some((w) => joined.includes(w))) {
      categoriesHit += 1;
    }
  }

  // Elaboration: average words beyond bare 1-2 word label
  const avgWords = fluencyCount > 0
    ? uniqueIdeas.reduce((s, x) => s + x.split(/\s+/).length, 0) / fluencyCount
    : 0;

  const fluencyScore = clip((fluencyCount / 10) * 100, 0, 100);
  const flexScore = clip((categoriesHit / 6) * 100, 0, 100);
  const elabScore = clip(((avgWords - 1) / 4) * 100, 0, 100);
  // Originality requires N>=500 cohort freq — evenly weight deterministic rubric facets meanwhile
  const total = round1(0.4 * fluencyScore + 0.4 * flexScore + 0.2 * elabScore);

  return {
    fluency: round1(fluencyScore),
    flexibility: round1(flexScore),
    elaboration: round1(elabScore),
    idea_count: fluencyCount,
    categories_hit: categoriesHit,
    score: total
  };
}

/**
 * Full V2 Scoring Pipeline.
 * @param {Object} params
 * @param {Array}  params.responsesJoined  v2_responses joined with v2_items
 * @param {number} params.studentGrade     fallback student grade (10 or 12)
 * @param {Object} params.gradeNorms       optional { cohortCount, metrics: { key: { mean, sd } } }
 */
function scoreV2Assessment({ responsesJoined, studentGrade = 10, gradeNorms = null }) {
  if (!responsesJoined || responsesJoined.length === 0) {
    throw new Error('Cannot score V2 assessment with zero responses.');
  }

  const m1 = extractM1Profile(responsesJoined);
  const grade = Number(m1.raw.grade ? m1.grade : studentGrade) >= 11 ? 12 : 10;
  const validity = runValidityChecks(responsesJoined);

  const cohortCount = Number(gradeNorms?.cohortCount || 0);
  const normStatus = cohortCount >= 500 && !validity.is_provisional_due_to_validity ? 'final' : 'provisional';

  const toNormOrPercent = (rawVal, maxVal, metricKey) => {
    const linear = maxVal > 0 ? round1(clip((rawVal / maxVal) * 100, 0, 100)) : 50;
    const normEntry = gradeNorms?.metrics?.[metricKey];
    if (cohortCount >= 500 && normEntry && normEntry.sd > 0) {
      return normPercentileFromZ((rawVal - normEntry.mean) / normEntry.sd);
    }
    return linear;
  };

  // =========================================================================
  // 1. MODULE 2 — INTERESTS (C01..C16 + RIASEC) & PASSION + HEALTH SUBSCALES
  // =========================================================================
  const interestRaw = Object.fromEntries(CLUSTER_IDS.map((c) => [c, 0]));
  const riasecRaw = { R: 0, I: 0, A: 0, S: 0, E: 0, C: 0 };
  const passionClusterVals = Object.fromEntries(CLUSTER_IDS.map((c) => [c, []]));
  const passionOpenBonus = Object.fromEntries(CLUSTER_IDS.map((c) => [c, 0]));
  const m2Scales = { HARM: [], OBS: [], PRESSURE: [], GRIT_CI: [], GRIT_PE: [], TECH: [], ENTRE: [], SECURITY: [], RESILIENCE: [] };
  const openTextInsights = [];

  for (const r of responsesJoined) {
    if (r.module !== 2) continue;
    const k = parseKey(r);
    const opts = parseOpts(r);

    if (r.sub === 'INT' && r.item_type === 'likert5' && r.numeric_value != null) {
      const delta = Number(r.numeric_value) - 3; // -2 to +2
      if (k.cluster && k.cluster in interestRaw) interestRaw[k.cluster] += delta;
      if (k.riasec) {
        for (const [letter, w] of Object.entries(k.riasec)) {
          if (letter in riasecRaw) riasecRaw[letter] += delta * Number(w);
        }
      }
    } else if (r.sub === 'INT' && r.item_type === 'best_worst' && r.response_json) {
      let bw = {};
      try { bw = JSON.parse(r.response_json); } catch { /* ignore invalid JSON */ }
      const applyOpt = (optKey, mult) => {
        const opt = opts.find((o) => o.k === optKey);
        if (!opt) return;
        if (opt.cluster && opt.cluster in interestRaw) interestRaw[opt.cluster] += mult;
        if (opt.riasec) {
          for (const [letter, w] of Object.entries(opt.riasec)) {
            if (letter in riasecRaw) riasecRaw[letter] += mult * Number(w);
          }
        }
      };
      if (bw.most) applyOpt(bw.most, 2);
      if (bw.least) applyOpt(bw.least, -1);
    } else if (r.sub === 'INT' && r.item_type === 'forced_choice' && r.answer_key) {
      const chosen = opts.find((o) => o.k === r.answer_key);
      const other = opts.find((o) => o.k !== r.answer_key);
      const applyOpt = (opt, mult) => {
        if (!opt) return;
        if (opt.cluster && opt.cluster in interestRaw) interestRaw[opt.cluster] += mult;
        if (opt.riasec) {
          for (const [letter, w] of Object.entries(opt.riasec)) {
            if (letter in riasecRaw) riasecRaw[letter] += mult * Number(w);
          }
        }
      };
      applyOpt(chosen, 1);
      applyOpt(other, -1);
    } else if (r.sub === 'PAS' && r.item_type === 'likert5' && r.numeric_value != null) {
      const val = k.reverse ? 6 - Number(r.numeric_value) : Number(r.numeric_value);
      if ((k.scale === 'FLOW' || k.scale === 'INTRINSIC') && k.cluster && k.cluster in passionClusterVals) {
        passionClusterVals[k.cluster].push(val);
      } else if (k.scale && k.scale in m2Scales) {
        m2Scales[k.scale].push(val);
      }
    } else if (r.sub === 'PAS' && r.item_type === 'scenario' && r.answer_key) {
      const opt = opts.find((o) => o.k === r.answer_key);
      if (opt && opt.score != null && k.scale && k.scale in m2Scales) {
        // Rescale 1-4 scenario score to 1-5 scale per spec §6.4
        const scaled = 1 + ((Number(opt.score) - 1) / 3) * 4;
        m2Scales[k.scale].push(scaled);
      }
    } else if (r.sub === 'PAS' && r.item_type === 'open_text' && r.response_text) {
      if (!NON_POSITIVE_OPEN_TEXT_REGEX.test(r.stem)) {
        const matches = matchOpenTextToClusters(r.response_text);
        const w = Number(k.weight || 2);
        for (const m of matches) {
          interestRaw[m.cluster] += w;
          passionOpenBonus[m.cluster] = Math.min(20, passionOpenBonus[m.cluster] + w * 4);
        }
        openTextInsights.push({ item: r.external_id, matches });
      }
    }
  }

  // Extra M2 domain bonuses (TECH -> C01, ENTRE -> C16, SECURITY -> -C16)
  const techMean = mean(m2Scales.TECH);
  const entreMean = mean(m2Scales.ENTRE);
  const secExtraMean = mean(m2Scales.SECURITY);
  if (techMean !== null) interestRaw.C01 += (techMean - 3) * 2;
  if (entreMean !== null) interestRaw.C16 += (entreMean - 3) * 2;
  if (secExtraMean !== null) interestRaw.C16 -= (secExtraMean - 3) * 2;

  // Within-student z-score normalization on Interest_raw[C01..C16]
  const rawArr = CLUSTER_IDS.map((c) => interestRaw[c]);
  const intMean = mean(rawArr) ?? 0;
  const intSd = stdDev(rawArr);
  const interestScore = {};
  for (const cid of CLUSTER_IDS) {
    const z = intSd > 1e-6 ? (interestRaw[cid] - intMean) / intSd : 0;
    interestScore[cid] = round1(clip(50 + 15 * z, 0, 100));
  }

  // RIASEC code = top 3 letters of summed riasecRaw (deterministic tie-break R>I>A>S>E>C)
  const riasecOrder = ['R', 'I', 'A', 'S', 'E', 'C'];
  const riasecRanked = [...riasecOrder].sort((a, b) => {
    if (Math.abs(riasecRaw[b] - riasecRaw[a]) > 1e-9) return riasecRaw[b] - riasecRaw[a];
    return riasecOrder.indexOf(a) - riasecOrder.indexOf(b);
  });
  const riasecCode = riasecRanked.slice(0, 3).join('');
  // Normalize RIASEC to 0..100 for display compatibility
  const riasecMin = Math.min(...Object.values(riasecRaw));
  const riasecMax = Math.max(...Object.values(riasecRaw));
  const riasecNorm = {};
  for (const l of riasecOrder) {
    riasecNorm[l] = riasecMax > riasecMin
      ? round1(((riasecRaw[l] - riasecMin) / (riasecMax - riasecMin)) * 100)
      : 50;
  }

  // Passion per cluster (FLOW & INTRINSIC scaled 0..100 + open-text bonus)
  const passionScore = {};
  for (const cid of CLUSTER_IDS) {
    const vals = passionClusterVals[cid];
    const base = vals.length > 0 ? ((mean(vals) - 1) / 4) * 100 : interestScore[cid];
    passionScore[cid] = round1(clip(base + passionOpenBonus[cid], 0, 100));
  }

  // Passion health & Grit (spec §6.3, §6.4)
  const harmMean = mean(m2Scales.HARM) ?? 3.0;
  const obsMean = mean(m2Scales.OBS) ?? 2.0;
  const pressMean = mean(m2Scales.PRESSURE) ?? 2.0;
  const gritCiMean = mean(m2Scales.GRIT_CI) ?? 3.0;
  const gritPeMean = mean(m2Scales.GRIT_PE) ?? 3.0;
  const gritMean = round2((gritCiMean + gritPeMean) / 2);
  const gritIdx = round1(((gritMean - 1) / 4) * 100);
  const maxClusterPassion = Math.max(...Object.values(passionScore));

  let passionType = 'Balanced';
  if (pressMean >= 3.5) {
    passionType = 'Pressure-driven';
  } else if (obsMean >= 3.5) {
    passionType = 'Obsessive';
  } else if (harmMean >= 3.5 && obsMean < 3 && pressMean < 3) {
    passionType = 'Harmonious';
  } else if (gritCiMean < 2.5 && maxClusterPassion < 60) {
    passionType = 'Exploring';
  }

  // =========================================================================
  // 2. MODULE 3 — BIG FIVE PERSONALITY & THINKING STYLES
  // =========================================================================
  const m3Buckets = Object.fromEntries([...PERSONALITY_DIMS, ...THINKING_STYLES].map((s) => [s, []]));
  const m3ScenarioDelta = Object.fromEntries([...PERSONALITY_DIMS, ...THINKING_STYLES].map((s) => [s, 0]));

  for (const r of responsesJoined) {
    if (r.module !== 3 || r.sub === 'INFREQ') continue;
    const k = parseKey(r);
    const opts = parseOpts(r);
    if (r.item_type === 'likert5' && r.numeric_value != null && k.scale && k.scale in m3Buckets) {
      const val = k.reverse ? 6 - Number(r.numeric_value) : Number(r.numeric_value);
      m3Buckets[k.scale].push(val);
    } else if (r.item_type === 'scenario' && r.answer_key) {
      const opt = opts.find((o) => o.k === r.answer_key);
      if (opt && opt.sub && opt.sub in m3ScenarioDelta) {
        m3ScenarioDelta[opt.sub] += Number(opt.delta || 1);
      }
    }
  }

  const personality = {};
  for (const d of PERSONALITY_DIMS) {
    const rawM = mean(m3Buckets[d]);
    const rawPct = rawM !== null ? ((rawM - 1) / 4) * 100 : 50;
    personality[d] = toNormOrPercent(rawPct, 100, `pers_${d}`);
  }
  const thinkingStyles = {};
  for (const t of THINKING_STYLES) {
    const rawM = mean(m3Buckets[t]);
    const basePct = rawM !== null ? ((rawM - 1) / 4) * 100 : 50;
    thinkingStyles[t] = round1(clip(basePct + m3ScenarioDelta[t] * 6, 0, 100));
  }

  // =========================================================================
  // 3. MODULE 6 — EQ & SOFT SKILLS (needed for Aptitude EQ dimension)
  // =========================================================================
  const eqSjt = Object.fromEntries(EQ_FACETS.map((f) => [f, { raw: 0, max: 0 }]));
  const eqSelf = Object.fromEntries(EQ_FACETS.map((f) => [f, []]));

  for (const r of responsesJoined) {
    if (r.module !== 6) continue;
    const k = parseKey(r);
    const opts = parseOpts(r);
    const facet = r.sub;
    if (!EQ_FACETS.includes(facet)) continue;
    if (r.item_type === 'sjt' && r.answer_key) {
      const opt = opts.find((o) => o.k === r.answer_key);
      eqSjt[facet].max += 3;
      if (opt && opt.score != null) eqSjt[facet].raw += Number(opt.score);
    } else if (r.item_type === 'likert5' && r.numeric_value != null) {
      const val = k.reverse ? 6 - Number(r.numeric_value) : Number(r.numeric_value);
      eqSelf[facet].push(val);
    }
  }

  let totalSjtRaw = 0;
  let totalSjtMax = 0;
  let totalSelfVals = [];
  const eqFacetScores = {};
  for (const f of EQ_FACETS) {
    totalSjtRaw += eqSjt[f].raw;
    totalSjtMax += eqSjt[f].max;
    totalSelfVals.push(...eqSelf[f]);
    const sjtPct = eqSjt[f].max > 0 ? (eqSjt[f].raw / eqSjt[f].max) * 100 : null;
    const selfPct = eqSelf[f].length > 0 ? ((mean(eqSelf[f]) - 1) / 4) * 100 : null;
    if (sjtPct !== null && selfPct !== null) {
      eqFacetScores[f] = round1(0.7 * sjtPct + 0.3 * selfPct);
    } else {
      eqFacetScores[f] = round1(sjtPct ?? selfPct ?? 50);
    }
  }
  const sjtOverallPct = totalSjtMax > 0 ? (totalSjtRaw / totalSjtMax) * 100 : 50;
  const selfOverallPct = totalSelfVals.length > 0 ? ((mean(totalSelfVals) - 1) / 4) * 100 : 50;
  const eqCombined = toNormOrPercent(0.7 * sjtOverallPct + 0.3 * selfOverallPct, 100, 'apt_EQ');
  const eqGap = round1(selfOverallPct - sjtOverallPct);
  const eqSelfAwarenessFlag = Math.abs(eqGap) > 30
    ? (eqGap > 0 ? 'overconfident_eq' : 'underconfident_eq')
    : null;

  // =========================================================================
  // 4. MODULE 4 — APTITUDE (V, N, L, S, P) + CREATIVITY (CRE) + EQ
  // =========================================================================
  const DIFF_WEIGHT = { easy: 1.0, medium: 1.5, hard: 2.0 };
  const aptRaw = { V: 0, N: 0, L: 0, S: 0, P: 0 };
  const aptMax = { V: 0, N: 0, L: 0, S: 0, P: 0 };
  let creDetail = null;

  for (const r of responsesJoined) {
    if (r.module !== 4) continue;
    const d = r.dim;
    if (d === 'CRE' && r.item_type === 'open_text') {
      creDetail = scoreCreativityOpenText(r.response_text || '');
      continue;
    }
    if (!d || !(d in aptRaw) || r.item_type !== 'mcq') continue;
    const w = DIFF_WEIGHT[r.difficulty || 'medium'] || 1.5;
    aptMax[d] += w;
    const correct = String(r.answer_key || '') === String(r.item_answer_key || '');
    if (correct) {
      let pts = w;
      // Speed bonus ONLY for Perceptual Speed & Accuracy (P) dimension per spec §3
      if (d === 'P' && r.time_sec && r.response_time_ms > 0) {
        const limitMs = Number(r.time_sec) * 1000 * (m1.accommodations.extended_time_pct ? 1.25 : 1.0);
        if (r.response_time_ms <= limitMs * 0.6) pts += 0.2 * w;
      }
      aptRaw[d] += pts;
    }
  }

  const aptitude = {};
  for (const d of ['V', 'N', 'L', 'S', 'P']) {
    aptitude[d] = toNormOrPercent(aptRaw[d], aptMax[d] || 1, `apt_${d}`);
  }
  aptitude.CRE = creDetail ? toNormOrPercent(creDetail.score, 100, 'apt_CRE') : 50;
  aptitude.EQ = eqCombined;

  // =========================================================================
  // 5. MODULE 5 — WORK VALUES (RANK 1-8 → 100 - (rank-1)*100/7)
  // =========================================================================
  const valuePoints = Object.fromEntries(VALUE_CODES.map((v) => [v, 0]));
  for (const r of responsesJoined) {
    if (r.module !== 5) continue;
    const k = parseKey(r);
    const opts = parseOpts(r);
    if (r.item_type === 'likert5' && r.numeric_value != null && k.value in valuePoints) {
      valuePoints[k.value] += Number(r.numeric_value) - 1; // 0..4 points
    } else if (r.item_type === 'forced_choice' && r.answer_key) {
      const chosen = opts.find((o) => o.k === r.answer_key);
      if (chosen?.value in valuePoints) valuePoints[chosen.value] += 2;
    } else if (r.item_type === 'best_worst' && r.response_json) {
      let bw = {};
      try { bw = JSON.parse(r.response_json); } catch { /* ignore invalid JSON */ }
      const mOpt = opts.find((o) => o.k === bw.most);
      const lOpt = opts.find((o) => o.k === bw.least);
      if (mOpt?.value in valuePoints) valuePoints[mOpt.value] += 2;
      if (lOpt?.value in valuePoints) valuePoints[lOpt.value] -= 1;
    } else if (r.item_type === 'ranking' && r.response_json) {
      let orderArr = [];
      try { orderArr = JSON.parse(r.response_json); } catch { /* ignore invalid JSON */ }
      const ptsMap = k.points_by_rank || { 1: 3, 2: 2, 3: 1, 4: 0 };
      orderArr.forEach((optKey, idx) => {
        const opt = opts.find((o) => o.k === optKey);
        if (opt?.value in valuePoints) {
          valuePoints[opt.value] += Number(ptsMap[String(idx + 1)] ?? 0);
        }
      });
    }
  }
  if (secExtraMean !== null) valuePoints.SEC += secExtraMean - 1;

  const valuesRanked = [...VALUE_CODES].sort((a, b) => {
    if (Math.abs(valuePoints[b] - valuePoints[a]) > 1e-9) return valuePoints[b] - valuePoints[a];
    return VALUE_CODES.indexOf(a) - VALUE_CODES.indexOf(b);
  });
  const valuesScores = {};
  valuesRanked.forEach((v, idx) => {
    const rank = idx + 1;
    valuesScores[v] = round1(100 - ((rank - 1) * 100) / 7);
  });

  // =========================================================================
  // 6. MODULE 7 — SELF-EFFICACY, ANXIETY, READINESS (NEVER MODIFIES Final_c)
  // =========================================================================
  const seByCluster = Object.fromEntries(CLUSTER_IDS.map((c) => [c, []]));
  const seAcademic = [];
  const testAnx = [];
  const studyPref = {};
  const decisionBuckets = Object.fromEntries(DECISION_STYLES.map((d) => [d, []]));
  const maturityVals = [];
  let awarenessCorrect = 0;
  let awarenessTotal = 0;

  for (const r of responsesJoined) {
    if (r.module !== 7) continue;
    const k = parseKey(r);
    if (r.sub === 'SELF_EFFICACY' && r.item_type === 'likert5' && r.numeric_value != null) {
      const v = Number(r.numeric_value);
      if (k.cluster && k.cluster in seByCluster) seByCluster[k.cluster].push(v);
      else seAcademic.push(v);
    } else if (r.sub === 'ANXIETY' && r.item_type === 'likert5' && r.numeric_value != null) {
      testAnx.push(k.reverse ? 6 - Number(r.numeric_value) : Number(r.numeric_value));
    } else if (r.sub === 'STUDY_PREF' && r.item_type === 'likert5' && r.numeric_value != null) {
      (studyPref[k.scale || 'GENERAL'] ||= []).push(Number(r.numeric_value));
    } else if (r.sub === 'DECISION_STYLE' && r.item_type === 'likert5' && r.numeric_value != null) {
      if (k.scale in decisionBuckets) decisionBuckets[k.scale].push(Number(r.numeric_value));
    } else if (r.sub === 'CAREER_MATURITY' && r.item_type === 'likert5' && r.numeric_value != null) {
      maturityVals.push(k.reverse ? 6 - Number(r.numeric_value) : Number(r.numeric_value));
    } else if (r.sub === 'CAREER_AWARENESS' && r.item_type === 'mcq') {
      awarenessTotal += 1;
      if (String(r.answer_key || '') === String(r.item_answer_key || '')) awarenessCorrect += 1;
    }
  }

  const seAcademicMean = mean(seAcademic);
  const testAnxMean = mean(testAnx) ?? 2.5;
  const careerMaturityMean = mean(maturityVals) ?? 3.0;
  const awarenessPct = awarenessTotal > 0 ? round1((awarenessCorrect / awarenessTotal) * 100) : null;
  const decisionScores = {};
  for (const d of DECISION_STYLES) {
    decisionScores[d] = decisionBuckets[d].length ? round2(mean(decisionBuckets[d])) : 2.5;
  }
  const topDecisionStyle = [...DECISION_STYLES].sort((a, b) => decisionScores[b] - decisionScores[a])[0];

  // =========================================================================
  // 7. 16 CLUSTER COMPOSITE SCORES & SPECIAL FLAGS (spec §§5-6)
  // =========================================================================
  const pressureDiscount = pressMean >= 3.5 ? 0.75 : 1.0;

  const clusterRows = CLUSTER_IDS.map((cid) => {
    const def = CLUSTERS[cid];
    // Aptitude_c = weighted sum across V,N,L,S,P,CRE,EQ
    let aptC = 0;
    let wSum = 0;
    const weakAptDims = [];
    for (const [d, w] of Object.entries(def.apt)) {
      const weight = Number(w);
      aptC += weight * aptitude[d];
      wSum += weight;
      if (weight >= 0.15 && aptitude[d] < 50) {
        weakAptDims.push({ dim: d, weight, score: aptitude[d] });
      }
    }
    const aptitudeC = round1(wSum > 0 ? aptC / wSum : 50);

    // PersonalityFit_c
    const pTargets = Object.entries(def.pers || {}).map(([trait, target]) => {
      const tVal = personality[trait] ?? 50;
      return Number(target) < 0 ? 100 - tVal : tVal;
    });
    const personalityFitC = pTargets.length > 0 ? mean(pTargets) : 50;

    // ValuesFit_c
    const vTargets = (def.values || []).map((vc) => valuesScores[vc] ?? 50);
    const valuesFitC = vTargets.length > 0 ? mean(vTargets) : 50;
    const persValC = round1(0.6 * personalityFitC + 0.4 * valuesFitC);

    const intC = interestScore[cid];
    const pasC = passionScore[cid];
    const effPasC = pasC * pressureDiscount;
    const finalC = round1(0.35 * intC + 0.20 * effPasC + 0.25 * aptitudeC + 0.20 * persValC);

    // Self-efficacy (cluster-specific, or academic baseline)
    const seVals = seByCluster[cid].length > 0 ? seByCluster[cid] : seAcademic;
    const sePct = seVals.length > 0 ? round1(((mean(seVals) - 1) / 4) * 100) : null;
    const confidenceGap = sePct !== null ? round1(aptitudeC - sePct) : null;

    const flags = [];
    if (def.gem && intC >= 70 && pasC >= 70 && aptitudeC >= 50) flags.push('hidden_gem');
    if (intC >= 70 && pasC >= 70 && aptitudeC < 50) flags.push('growth_path');
    if (confidenceGap !== null && confidenceGap >= 20) flags.push('hidden_confidence_gap');
    if (confidenceGap !== null && confidenceGap <= -20) flags.push('overconfidence_gap');

    return {
      id: cid,
      name: def.name,
      stream10: def.stream10,
      riasec: def.riasec,
      interest: intC,
      passion: pasC,
      aptitude: aptitudeC,
      persval: persValC,
      final: finalC,
      confidence_se: sePct,
      confidence_gap: confidenceGap,
      weak_apt_dims: weakAptDims,
      flags,
      careers: def.careers,
      courses: def.courses,
      exams: def.exams
    };
  });

  // Sort deterministically: Final_c descending; tie within 2 pts prefers Passion, then Interest, then id
  const sortedClusters = [...clusterRows].sort((a, b) => {
    const diff = b.final - a.final;
    if (Math.abs(diff) > 2.0) return diff;
    if (Math.abs(b.final - a.final) <= 2.0) {
      if (Math.abs(b.passion - a.passion) > 0.5) return b.passion - a.passion;
      if (Math.abs(b.interest - a.interest) > 0.5) return b.interest - a.interest;
    }
    if (Math.abs(diff) > 1e-6) return diff;
    return a.id.localeCompare(b.id);
  });

  const top5 = sortedClusters.slice(0, 5).map((c) => c.id);
  const spread = sortedClusters.length >= 6 ? round1(sortedClusters[0].final - sortedClusters[5].final) : 15;
  const confidenceLevel = spread >= 15 ? 'High' : spread >= 8 ? 'Medium' : 'Low';

  const passionPick = [...clusterRows].sort((a, b) => (0.6 * b.interest + 0.4 * b.passion) - (0.6 * a.interest + 0.4 * a.passion))[0].id;
  const eligibleStrength = clusterRows.filter((c) => c.interest >= 40);
  const strengthPick = [...(eligibleStrength.length ? eligibleStrength : clusterRows)].sort((a, b) => b.aptitude - a.aptitude)[0].id;
  const balancedPick = sortedClusters[0].id;

  const hiddenGems = clusterRows.filter((c) => c.flags.includes('hidden_gem')).map((c) => ({
    id: c.id,
    name: c.name,
    interest: c.interest,
    passion: c.passion,
    aptitude: c.aptitude,
    careers: c.careers.slice(0, 4),
    courses: c.courses,
    earning_ladder: { entry: 'data pending', five_year: 'data pending', ten_year: 'data pending' }
  }));

  const growthPaths = clusterRows.filter((c) => c.flags.includes('growth_path')).map((c) => ({
    id: c.id,
    name: c.name,
    interest: c.interest,
    passion: c.passion,
    aptitude: c.aptitude,
    weak_dimensions: c.weak_apt_dims,
    needs_steady_practice: gritPeMean < 3.0,
    six_month_plan: `Focus weekly deliberate practice on ${c.weak_apt_dims.map((d) => d.dim).join(', ') || 'foundational problem-solving'} while building small hands-on projects.`
  }));

  // =========================================================================
  // 8. GRADE 10 STREAM ROLLUPS & GRADE 12 COURSES/REALITY CHECK (§7)
  // =========================================================================
  const clusterById = Object.fromEntries(clusterRows.map((c) => [c.id, c]));
  const streams10 = GRADE_10_STREAMS.map((st) => {
    const members = st.clusters.map((cid) => clusterById[cid]).filter(Boolean).sort((a, b) => b.final - a.final);
    const maxScore = members[0]?.final ?? 0;
    const nextBest = members[1]?.final ?? maxScore;
    const score = round1(0.7 * maxScore + 0.3 * nextBest);
    return {
      id: st.id,
      name: st.name,
      score,
      band: score >= 75 ? 'Strong Fit' : score >= 55 ? 'Possible Fit' : 'Explore Further',
      top_cluster: members[0]?.name || null
    };
  }).sort((a, b) => b.score - a.score);

  const courses12 = sortedClusters.slice(0, 5).map((c) => ({
    cluster_id: c.id,
    cluster_name: c.name,
    final_score: c.final,
    courses: c.courses.slice(0, 3),
    careers: c.careers.slice(0, 3),
    exams: c.exams.map((ex) => `${ex} (verify rules for the current year)`),
    earning_ladder: 'Data verification pending'
  }));

  const budgetText = m1.budget || '';
  const relocateText = m1.relocate || '';
  const lowBudget = /under|below|50,000|1 lakh|scholarship|loan/i.test(budgetText);
  const localOnly = /same city|home|no/i.test(relocateText);
  const longStudyFlag = gritMean < 2.8 && sortedClusters.slice(0, 3).some((c) => ['C02', 'C07', 'C08', 'C04'].includes(c.id));

  const realityCheck = {
    budget_fit: lowBudget
      ? 'Prioritise central/state government universities, CUET/state quota seats, and merit-cum-means scholarships.'
      : 'Both public and accredited private institutions fit the recorded budget band.',
    relocation_fit: localOnly
      ? 'Filter campus choices to local/commutable institutions and strong distance/state options.'
      : 'Open to national residential and out-of-state institutions.',
    backup_routes: sortedClusters.slice(3, 5).map((c) => ({ cluster_id: c.id, name: c.name, courses: c.courses.slice(0, 2) })),
    preparation_needed_note: longStudyFlag
      ? 'Top fields include longer competitive study paths; build consistent daily study blocks early.'
      : null,
    low_awareness_note: awarenessPct !== null && awarenessPct < 40
      ? `Career awareness scored ${awarenessPct}% — schedule career exploration activities before finalising.`
      : null
  };

  const canonical = {
    schema: 'psychometric-v2/1.0',
    grade: String(grade),
    norm_status: normStatus,
    validity,
    riasec_code: riasecCode,
    riasec: riasecNorm,
    passion_type: passionType,
    grit: gritIdx,
    grit_mean_5: gritMean,
    aptitude,
    creativity_detail: creDetail,
    personality,
    thinking_styles: thinkingStyles,
    eq_facets: eqFacetScores,
    eq_self_awareness_flag: eqSelfAwarenessFlag,
    values_rank: valuesRanked,
    values_scores: valuesScores,
    readiness: {
      test_anxiety_mean: round2(testAnxMean),
      test_anxiety_idx: round1(((testAnxMean - 1) / 4) * 100),
      se_academic_idx: seAcademicMean !== null ? round1(((seAcademicMean - 1) / 4) * 100) : null,
      decision_style: topDecisionStyle,
      decision_scores: decisionScores,
      career_maturity_mean: round2(careerMaturityMean),
      career_awareness_pct: awarenessPct,
      harm_mean: round2(harmMean),
      obs_mean: round2(obsMean),
      pressure_mean: round2(pressMean)
    },
    m1_context: {
      board: m1.board,
      marks_band: m1.marks_band,
      own_dream: m1.own_dream,
      parent_pref: m1.parent_pref,
      certainty: m1.certainty,
      fav_subjects: m1.fav_subjects,
      budget: m1.budget,
      relocate: m1.relocate,
      gender: m1.raw.gender?.text || null,
      accommodations: m1.accommodations
    },
    clusters: sortedClusters,
    top5,
    picks: { passion: passionPick, strength: strengthPick, balanced: balancedPick },
    confidence: confidenceLevel,
    confidence_spread: spread,
    hidden_gems: hiddenGems,
    growth_paths: growthPaths,
    streams_10: streams10,
    courses_12: courses12,
    reality_check: realityCheck,
    open_text_matches: openTextInsights,
    limitations: [
      normStatus === 'provisional'
        ? `Grade ${grade} norms are provisional until at least 500 students complete this version (using min-max scaling and within-person z-scores meanwhile).`
        : `Scores calibrated against Grade ${grade} cohort norms (N = ${cohortCount}).`,
      'Educational guidance tool only — does not diagnose clinical conditions or guarantee admission/career outcomes.',
      'Demographic and budget items never alter interest, passion, aptitude, or cluster scores.'
    ]
  };

  return canonical;
}

module.exports = {
  scoreV2Assessment,
  extractM1Profile,
  matchOpenTextToClusters,
  scoreCreativityOpenText
};
