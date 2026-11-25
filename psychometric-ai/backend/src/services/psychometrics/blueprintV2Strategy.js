// Deterministic, stratified V2 Blueprint selector.
// Draws a balanced ~105-item student battery (from 2,704 student items) and a
// ~52-item parent M8 battery (from 746 parent items), seeded by assessmentId so
// page refreshes, resumes, and parallel forms stay 100% reproducible.

const { CLUSTER_IDS, APTITUDE_DIMS_V2, PERSONALITY_DIMS, THINKING_STYLES, EQ_FACETS, DECISION_STYLES } = require('./v2Constants');

function mulberry32(seed) {
  let a = Number(seed) || 1;
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededPick(list, count, rng) {
  if (!list || list.length === 0) return [];
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, Math.min(count, copy.length));
}

function parseKey(item) {
  if (!item.key_json) return {};
  try { return JSON.parse(item.key_json); } catch { return {}; }
}

function parseOpts(item) {
  if (!item.options_json) return [];
  try { return JSON.parse(item.options_json); } catch { return []; }
}

function gradeMatches(itemGrade, targetGrade) {
  const g = String(itemGrade || 'both').toLowerCase();
  if (g === 'both') return true;
  const is12 = Number(targetGrade) >= 11;
  if (is12) return g === '12' || g === '12th';
  return g === '10' || g === '10th';
}

/**
 * Build a balanced deterministic student assessment blueprint (~108 items).
 * @param {Array} allItems  rows from v2_items where respondent='student' and is_active=1
 * @param {Object} opts     { assessmentId, grade }
 */
function buildStudentBlueprint(allItems, { assessmentId, grade = 10 }) {
  const rng = mulberry32(Number(assessmentId) * 7919 + Number(grade) * 31);
  const byMod = {};
  for (const it of allItems) {
    if (!gradeMatches(it.grade_scope, grade)) continue;
    (byMod[it.module] ||= []).push({ ...it, _key: parseKey(it), _opts: parseOpts(it) });
  }

  const pickedIds = [];
  const addItems = (arr) => {
    for (const x of arr) {
      if (x && !pickedIds.includes(x.id)) pickedIds.push(x.id);
    }
  };

  // ---- M1: All applicable grade context/accommodation/routing items (~27 items) ----
  const m1 = (byMod[1] || []).sort((a, b) => a.display_order - b.display_order);
  // Skip M1-001 if grade is already set on profile, or include it so student confirms class
  addItems(m1);

  // ---- M2: Interests (16 clusters) + Passion + Consistency pairs ----
  const m2 = byMod[2] || [];
  const intLikerts = m2.filter((x) => x.sub === 'INT' && x.item_type === 'likert5');
  const pickedIntLikert = [];
  for (const cid of CLUSTER_IDS) {
    const match = intLikerts.filter((x) => x._key.cluster === cid);
    const chosen = seededPick(match, 1, rng);
    pickedIntLikert.push(...chosen);
  }
  addItems(pickedIntLikert);

  // Best-worst (4) & Forced-choice (8) covering paired clusters for Section 8 consistency check
  const bwM2 = seededPick(m2.filter((x) => x.sub === 'INT' && x.item_type === 'best_worst'), 4, rng);
  const fcM2 = seededPick(m2.filter((x) => x.sub === 'INT' && x.item_type === 'forced_choice'), 8, rng);
  addItems([...bwM2, ...fcM2]);

  // Passion FLOW + INTRINSIC: 1 item per cluster across C01..C16
  const pasLikerts = m2.filter((x) => x.sub === 'PAS' && x.item_type === 'likert5');
  for (let i = 0; i < CLUSTER_IDS.length; i++) {
    const cid = CLUSTER_IDS[i];
    const wantScale = i % 2 === 0 ? 'FLOW' : 'INTRINSIC';
    const match = pasLikerts.filter((x) => x._key.cluster === cid && x._key.scale === wantScale);
    const fallback = pasLikerts.filter((x) => x._key.cluster === cid);
    addItems(seededPick(match.length ? match : fallback, 1, rng));
  }

  // Passion health & orientation subscales (HARM, OBS, PRESSURE, GRIT_PE, GRIT_CI, TECH, ENTRE, SECURITY)
  for (const scale of ['HARM', 'OBS', 'PRESSURE', 'GRIT_PE', 'GRIT_CI', 'TECH', 'ENTRE']) {
    addItems(seededPick(pasLikerts.filter((x) => x._key.scale === scale), 2, rng));
  }
  addItems(seededPick(pasLikerts.filter((x) => x._key.scale === 'SECURITY'), 1, rng));
  addItems(seededPick(m2.filter((x) => x.sub === 'PAS' && x.item_type === 'scenario'), 2, rng));
  // 1 open-text passion reflection
  addItems(seededPick(m2.filter((x) => x.sub === 'PAS' && x.item_type === 'open_text'), 1, rng));

  // ---- M3: Big Five (10) + Thinking Styles (7) + Scenario (1) + INFREQ validity (2) ----
  const m3 = byMod[3] || [];
  for (const trait of PERSONALITY_DIMS) {
    const pool = m3.filter((x) => x.sub === trait && x.item_type === 'likert5');
    const pos = seededPick(pool.filter((x) => !x._key.reverse), 1, rng);
    const rev = seededPick(pool.filter((x) => x._key.reverse), 1, rng);
    addItems(pos);
    addItems(rev.length ? rev : seededPick(pool.filter((x) => !pos.includes(x)), 1, rng));
  }
  for (const style of THINKING_STYLES) {
    addItems(seededPick(m3.filter((x) => x.sub === style && x.item_type === 'likert5'), 1, rng));
  }
  addItems(seededPick(m3.filter((x) => x.item_type === 'scenario'), 1, rng));
  addItems(seededPick(m3.filter((x) => x.sub === 'INFREQ'), 2, rng));

  // ---- M4: Aptitude (3 MCQs per dim V,N,L,S,P mixed difficulty + 1 CRE open_text) ----
  const m4 = byMod[4] || [];
  for (const dim of APTITUDE_DIMS_V2) {
    if (dim === 'EQ') continue; // EQ is in M6
    if (dim === 'CRE') {
      addItems(seededPick(m4.filter((x) => x.dim === 'CRE' && x.item_type === 'open_text'), 1, rng));
      continue;
    }
    const dimPool = m4.filter((x) => x.dim === dim && x.item_type === 'mcq');
    const is12 = Number(grade) >= 11;
    const primaryDiff = is12 ? 'hard' : 'easy';
    const sharedDiff = 'medium';
    const pItems = seededPick(dimPool.filter((x) => x.difficulty === primaryDiff), 1, rng);
    const mItems = seededPick(dimPool.filter((x) => x.difficulty === sharedDiff), 2, rng);
    const selected = [...pItems, ...mItems];
    if (selected.length < 3) {
      addItems(seededPick(dimPool.filter((x) => !selected.includes(x)), 3 - selected.length, rng));
    }
    addItems(selected);
  }

  // ---- M5: Work Values (4 likert5 + 4 forced_choice + 2 best_worst + 2 ranking) ----
  const m5 = byMod[5] || [];
  addItems(seededPick(m5.filter((x) => x.item_type === 'likert5'), 4, rng));
  addItems(seededPick(m5.filter((x) => x.item_type === 'forced_choice'), 4, rng));
  addItems(seededPick(m5.filter((x) => x.item_type === 'best_worst'), 2, rng));
  addItems(seededPick(m5.filter((x) => x.item_type === 'ranking'), 2, rng));

  // ---- M6: EQ (6 SJTs + 6 Self-Report Likert across all 6 facets) ----
  const m6 = byMod[6] || [];
  for (const facet of EQ_FACETS) {
    addItems(seededPick(m6.filter((x) => x.sub === facet && x.item_type === 'sjt'), 1, rng));
  }
  for (const facet of EQ_FACETS) {
    addItems(seededPick(m6.filter((x) => x.sub === facet && x.item_type === 'likert5'), 1, rng));
  }

  // ---- M7: Academic Confidence & Career Readiness (~24 items) ----
  const m7 = byMod[7] || [];
  // 8 cluster Self-Efficacy items (covering diverse career clusters cleanly) + 2 academic SE items
  const seClusterSample = [];
  for (let i = 0; i < CLUSTER_IDS.length; i += 2) {
    const cid = CLUSTER_IDS[i];
    const match = m7.filter((x) => x.sub === 'SELF_EFFICACY' && x._key.cluster === cid);
    seClusterSample.push(...seededPick(match, 1, rng));
  }
  addItems(seClusterSample);
  addItems(seededPick(m7.filter((x) => x.sub === 'SELF_EFFICACY' && x._key.scale === 'SE_ACADEMIC'), 2, rng));
  addItems(seededPick(m7.filter((x) => x.sub === 'ANXIETY' && x.item_type === 'likert5'), 3, rng));
  addItems(seededPick(m7.filter((x) => x.sub === 'STUDY_PREF' && x.item_type === 'likert5'), 2, rng));
  for (const ds of DECISION_STYLES) {
    addItems(seededPick(m7.filter((x) => x.sub === 'DECISION_STYLE' && x._key.scale === ds), 1, rng));
  }
  addItems(seededPick(m7.filter((x) => x.sub === 'CAREER_MATURITY' && x.item_type === 'likert5'), 2, rng));
  addItems(seededPick(m7.filter((x) => x.sub === 'CAREER_AWARENESS' && x.item_type === 'mcq'), 4, rng));
  addItems(seededPick(m7.filter((x) => x.item_type === 'scenario'), 1, rng));

  return {
    itemIds: pickedIds,
    totalCount: pickedIds.length
  };
}

/**
 * Build deterministic Module 8 blueprint (~48 items) for one parent.
 * Ensures direct coverage of mirror constructs matching the student's form.
 */
function buildParentBlueprint(parentItems, { assessmentId, parentId }) {
  const rng = mulberry32(Number(assessmentId) * 3571 + Number(parentId) * 97);
  const m8 = parentItems.map((it) => ({ ...it, _key: parseKey(it), _opts: parseOpts(it) }));
  const pickedIds = [];
  const addItems = (arr) => {
    for (const x of arr) {
      if (x && !pickedIds.includes(x.id)) pickedIds.push(x.id);
    }
  };

  // Batch 1: Parent Observation
  // 8 Early Behaviour + 8 Current Behaviour spread cleanly across cluster groups
  const early = m8.filter((x) => x.sub === 'EARLY_BEHAVIOUR');
  const current = m8.filter((x) => x.sub === 'CURRENT_BEHAVIOUR');
  for (let i = 0; i < CLUSTER_IDS.length; i += 2) {
    const cid = CLUSTER_IDS[i];
    addItems(seededPick(early.filter((x) => x._key.cluster_hint === cid), 1, rng));
    addItems(seededPick(current.filter((x) => x._key.cluster_hint === cid), 1, rng));
  }
  // 8 Multiple Intelligence (1 per MI type)
  for (const mi of ['LINGUISTIC', 'LOGICAL_MATH', 'SPATIAL', 'BODILY', 'MUSICAL', 'INTERPERSONAL', 'INTRAPERSONAL', 'NATURALIST']) {
    addItems(seededPick(m8.filter((x) => x.sub === 'MULTIPLE_INTELLIGENCE' && x._key.intelligence === mi), 1, rng));
  }
  addItems(seededPick(m8.filter((x) => x.sub === 'TEACHER_FEEDBACK'), 4, rng));
  addItems(seededPick(m8.filter((x) => x.sub === 'STRENGTH_STRUGGLE'), 3, rng));

  // Expectations: must include PARENT_PREF single_select + key support & income worry
  const exp = m8.filter((x) => x.sub === 'EXPECTATION');
  addItems(exp.filter((x) => x._key.scale === 'PARENT_PREF'));
  addItems(seededPick(exp.filter((x) => x._key.scale === 'PARENT_SUPPORT'), 4, rng));
  addItems(seededPick(exp.filter((x) => x._key.scale === 'PARENT_INCOME_WORRY'), 4, rng));

  // 1-2 Open observation prompts
  addItems(seededPick(m8.filter((x) => x.sub === 'OPEN' && x.item_type === 'open_text'), 2, rng));

  // Batch 2: Mirror items covering constructs in crosswalk
  addItems(seededPick(m8.filter((x) => x.sub === 'MIRROR_B5'), 5, rng));
  addItems(seededPick(m8.filter((x) => x.sub === 'MIRROR_THINK'), 4, rng));
  addItems(seededPick(m8.filter((x) => x.sub === 'MIRROR_EQ'), 3, rng));
  addItems(seededPick(m8.filter((x) => x.sub === 'MIRROR_PASSION_GRIT'), 4, rng));
  addItems(seededPick(m8.filter((x) => x.sub === 'MIRROR_VALUES'), 4, rng));
  // Ensure at least one TEST_ANX mirror item + SE_ACADEMIC mirror item for wellbeing flag
  const mirrorAcad = m8.filter((x) => x.sub === 'MIRROR_ACADEMIC');
  addItems(seededPick(mirrorAcad.filter((x) => x._key.scale === 'TEST_ANX'), 2, rng));
  addItems(seededPick(mirrorAcad.filter((x) => x._key.scale !== 'TEST_ANX'), 2, rng));
  // Perceived aptitudes (one per core dim where available)
  addItems(seededPick(m8.filter((x) => x.sub === 'APT_PERCEIVED'), 5, rng));
  // Fact checks (marks_band, own_dream, fav_subjects)
  const facts = m8.filter((x) => x.sub === 'FACT_CHECK');
  addItems(facts.filter((x) => ['marks_band', 'own_dream', 'fav_subjects', 'budget'].includes(x._key.field)).slice(0, 4));

  return { itemIds: pickedIds, totalCount: pickedIds.length };
}

/** Sanitize item before sending to client (anti-cheat: never leak answers, scores, keys). */
function sanitizeV2ItemForClient(item) {
  const opts = parseOpts(item).map((o) => ({
    k: o.k,
    text: o.text
  }));
  const key = parseKey(item);
  return {
    id: item.id,
    external_id: item.external_id,
    module: item.module,
    respondent: item.respondent,
    sub: item.sub,
    dim: item.dim,
    field_name: item.field_name,
    item_type: item.item_type,
    grade_scope: item.grade_scope,
    difficulty: item.difficulty,
    time_sec: item.time_sec,
    scale_name: item.scale_name,
    stem: item.stem,
    options: opts,
    max_select: item.item_type === 'multi_select' ? 2 : undefined,
    min_words: item.item_type === 'open_text' ? (key.min_words || 8) : undefined
  };
}

module.exports = {
  buildStudentBlueprint,
  buildParentBlueprint,
  sanitizeV2ItemForClient,
  parseKey,
  parseOpts
};

