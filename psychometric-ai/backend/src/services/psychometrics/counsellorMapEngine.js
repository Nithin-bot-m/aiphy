// Deterministic Parent M8 Summarizer & Counsellor Mapping Engine (counsellor_map_v1).
// Implements PROMPT_Counsellor_Mapping_Agent.md & parent_student_crosswalk.json.
//
// HARD RULES:
//   - Parent answers NEVER alter student scores.
//   - Every insight cites concrete item IDs / construct IDs (or "No direct evidence").
//   - Clinical labels / diagnoses are strictly avoided.
//   - Distress keywords trigger red_flags and suppress career advice in P11.
//   - Unsupplied earning figures always read "data pending".

const { CLUSTERS, CLUSTER_IDS, CROSSWALK, detectDistress, NON_POSITIVE_OPEN_TEXT_REGEX } = require('./v2Constants');
const { matchOpenTextToClusters } = require('./v2ClusterEngine');
const { parseKey, parseOpts } = require('./blueprintV2Strategy');

const MI_TO_CLUSTERS = {
  LINGUISTIC: ['C14', 'C04', 'C06'],
  LOGICAL_MATH: ['C01', 'C03', 'C08'],
  SPATIAL: ['C05', 'C01'],
  BODILY: ['C13', 'C07', 'C05'],
  MUSICAL: ['C05'],
  INTERPERSONAL: ['C06', 'C12', 'C15', 'C02'],
  INTRAPERSONAL: ['C06', 'C16'],
  NATURALIST: ['C09', 'C10', 'C11', 'C08']
};

const PATTERN_PRIORITY = [
  'P11', 'P06', 'P04', 'P10', 'P05', 'P03', 'P02', 'P08', 'P07', 'P09', 'P12', 'P13', 'P14', 'P01', 'P15'
];

function mean(arr) {
  if (!arr || !arr.length) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stdDev(arr) {
  if (!arr || arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, x) => s + (x - m) ** 2, 0) / arr.length);
}

function clip(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function round1(v) {
  return Math.round(Number(v) * 10) / 10;
}

function scale1to5To100(m) {
  return round1(clip(((m - 1) / 4) * 100, 0, 100));
}

/**
 * Summarize a single parent's completed Module 8 responses.
 * @param {Array} responsesJoined  v2_responses joined with v2_items for one parent
 */
function summarizeParentM8(responsesJoined) {
  const clusterObs = Object.fromEntries(CLUSTER_IDS.map((c) => [c, { vals: [], items: [] }]));
  const supportByCluster = Object.fromEntries(CLUSTER_IDS.map((c) => [c, []]));
  const worryByCluster = Object.fromEntries(CLUSTER_IDS.map((c) => [c, []]));
  const constructs = {}; // constructKey => { vals: [], items: [] }
  const factChecks = {}; // field => { answer, text, items }
  const distressItems = [];
  const openThemes = [];
  let parentPref = null;
  let parentPrefItems = [];
  let answeredCount = 0;

  for (const r of responsesJoined) {
    if (r.module !== 8) continue;
    answeredCount += 1;
    const k = parseKey(r);
    const opts = parseOpts(r);
    const itemId = r.external_id || `M8-${r.item_id}`;

    // Batch 1 Observations -> Cluster evidence
    if (['EARLY_BEHAVIOUR', 'CURRENT_BEHAVIOUR', 'TEACHER_FEEDBACK'].includes(r.sub) && r.numeric_value != null) {
      const val = k.reverse ? 6 - Number(r.numeric_value) : Number(r.numeric_value);
      const targets = Array.isArray(k.cluster_hint) ? k.cluster_hint : k.cluster_hint ? [k.cluster_hint] : [];
      for (const cid of targets) {
        if (cid in clusterObs) {
          clusterObs[cid].vals.push(val);
          clusterObs[cid].items.push(itemId);
        }
      }
    } else if (r.sub === 'MULTIPLE_INTELLIGENCE' && r.numeric_value != null) {
      const val = Number(r.numeric_value);
      const targets = k.intelligence && MI_TO_CLUSTERS[k.intelligence]
        ? MI_TO_CLUSTERS[k.intelligence]
        : (Array.isArray(k.cluster_hint) ? k.cluster_hint : []);
      for (const cid of targets) {
        if (cid in clusterObs) {
          clusterObs[cid].vals.push(val);
          clusterObs[cid].items.push(itemId);
        }
      }
    } else if (r.sub === 'STRENGTH_STRUGGLE' && r.numeric_value != null) {
      const val = Number(r.numeric_value);
      if (k.tag) {
        (constructs[`STRENGTH_${k.tag}`] ||= { vals: [], items: [] }).vals.push(val);
        constructs[`STRENGTH_${k.tag}`].items.push(itemId);
      }
    } else if (r.sub === 'EXPECTATION') {
      if (k.scale === 'PARENT_PREF' && r.answer_key && r.answer_key !== 'X1') {
        parentPref = r.answer_key;
        parentPrefItems.push(itemId);
      } else if (k.scale === 'PARENT_SUPPORT' && k.cluster && r.numeric_value != null) {
        if (k.cluster in supportByCluster) supportByCluster[k.cluster].push(Number(r.numeric_value));
      } else if (k.scale === 'PARENT_INCOME_WORRY' && k.cluster && r.numeric_value != null) {
        if (k.cluster in worryByCluster) worryByCluster[k.cluster].push(Number(r.numeric_value));
      }
    } else if (r.sub === 'OPEN' && r.item_type === 'open_text' && r.response_text) {
      if (detectDistress(r.response_text)) distressItems.push(itemId);
      if (!NON_POSITIVE_OPEN_TEXT_REGEX.test(r.stem)) {
        const matches = matchOpenTextToClusters(r.response_text);
        openThemes.push({ item: itemId, matches });
        for (const m of matches) {
          if (m.cluster in clusterObs) {
            clusterObs[m.cluster].vals.push(4.5);
            clusterObs[m.cluster].items.push(itemId);
          }
        }
      }
    }

    // Batch 2 Mirror Items mapped to Crosswalk construct IDs
    if (r.sub === 'MIRROR_VALUES' && k.value && r.numeric_value != null) {
      const cid = `VAL_${k.value}`;
      (constructs[cid] ||= { vals: [], items: [] }).vals.push(Number(r.numeric_value));
      constructs[cid].items.push(itemId);
    } else if (r.sub === 'APT_PERCEIVED' && k.dim && r.numeric_value != null) {
      const cid = `APT_${k.dim}`;
      (constructs[cid] ||= { vals: [], items: [] }).vals.push(Number(r.numeric_value));
      constructs[cid].items.push(itemId);
    } else if (['MIRROR_B5', 'MIRROR_THINK', 'MIRROR_EQ', 'MIRROR_PASSION_GRIT', 'MIRROR_ACADEMIC'].includes(r.sub) && r.numeric_value != null) {
      const val = k.reverse ? 6 - Number(r.numeric_value) : Number(r.numeric_value);
      let cid = k.scale;
      if (r.sub === 'MIRROR_EQ' && k.scale && !k.scale.startsWith('EQ_')) cid = `EQ_${k.scale}`;
      if (cid) {
        (constructs[cid] ||= { vals: [], items: [] }).vals.push(val);
        constructs[cid].items.push(itemId);
      }
    } else if (r.sub === 'FACT_CHECK' && k.field) {
      let textVal = r.answer_key;
      if (r.item_type === 'multi_select' && r.response_json) {
        try {
          const arr = JSON.parse(r.response_json);
          textVal = arr.map((ak) => opts.find((o) => String(o.k) === String(ak))?.text || ak).join(', ');
        } catch { /* ignore invalid JSON */ }
      } else if (r.answer_key != null) {
        textVal = opts.find((o) => String(o.k) === String(r.answer_key))?.text || r.answer_key;
      }
      factChecks[k.field] = { value: textVal, items: [itemId] };
    }
  }

  const clusterObservedScore = {};
  const clusterObsItems = {};
  const clusterSupport = {};
  const clusterIncomeWorry = {};
  for (const cid of CLUSTER_IDS) {
    const m = mean(clusterObs[cid].vals);
    clusterObservedScore[cid] = m !== null ? scale1to5To100(m) : null;
    clusterObsItems[cid] = [...new Set(clusterObs[cid].items)].slice(0, 6);
    const sm = mean(supportByCluster[cid]);
    clusterSupport[cid] = sm !== null ? round1(sm) : null;
    const wm = mean(worryByCluster[cid]);
    clusterIncomeWorry[cid] = wm !== null ? round1(wm) : null;
  }

  const constructScores = {};
  for (const [cid, data] of Object.entries(constructs)) {
    const m = mean(data.vals);
    if (m !== null) {
      constructScores[cid] = {
        raw_mean: round1(m),
        scaled_100: scale1to5To100(m),
        items: [...new Set(data.items)].slice(0, 6)
      };
    }
  }

  return {
    answered_count: answeredCount,
    parent_pref: parentPref,
    parent_pref_items: parentPrefItems,
    cluster_observed: clusterObservedScore,
    cluster_obs_items: clusterObsItems,
    cluster_support: clusterSupport,
    cluster_income_worry: clusterIncomeWorry,
    constructs: constructScores,
    fact_checks: factChecks,
    distress_items: distressItems,
    open_themes: openThemes
  };
}

/** Extract student value on 0-100 scale for each crosswalk construct ID. */
function studentConstructScoreMap(studentResult) {
  const map = {};
  for (const d of ['O', 'C', 'E', 'A', 'N']) {
    if (studentResult.personality?.[d] != null) map[d] = studentResult.personality[d];
  }
  for (const [k, v] of Object.entries(studentResult.thinking_styles || {})) {
    map[k] = v;
  }
  for (const [f, v] of Object.entries(studentResult.eq_facets || {})) {
    map[`EQ_${f}`] = v;
  }
  for (const d of ['V', 'N', 'L', 'S', 'P', 'CRE', 'EQ']) {
    if (studentResult.aptitude?.[d] != null) map[`APT_${d}`] = studentResult.aptitude[d];
  }
  for (const [vc, v] of Object.entries(studentResult.values_scores || {})) {
    map[`VAL_${vc}`] = v;
  }
  const r = studentResult.readiness || {};
  if (r.test_anxiety_idx != null) map.TEST_ANX = r.test_anxiety_idx;
  if (r.se_academic_idx != null) map.SE_ACADEMIC = r.se_academic_idx;
  if (r.harm_mean != null) map.HARM = scale1to5To100(r.harm_mean);
  if (r.obs_mean != null) map.OBS = scale1to5To100(r.obs_mean);
  if (r.pressure_mean != null) map.PRESSURE = scale1to5To100(r.pressure_mean);
  if (studentResult.grit != null) map.GRIT_PE = studentResult.grit;
  for (const [ds, mv] of Object.entries(r.decision_scores || {})) {
    map[ds] = scale1to5To100(mv);
  }
  return map;
}

/** Apply within-person z-score transformation on groups with >= 4 constructs. */
function normalizeByGroup(constructDefs, rawValueMap) {
  const byGroup = {};
  for (const def of constructDefs) {
    if (rawValueMap[def.id] == null) continue;
    (byGroup[def.group] ||= []).push({ id: def.id, val: rawValueMap[def.id] });
  }
  const normalized = {};
  const RAW_ONLY_IDS = new Set(['TEST_ANX', 'PRESSURE']);
  for (const [group, list] of Object.entries(byGroup)) {
    if (group === 'Values' || list.length < 4) {
      for (const item of list) normalized[item.id] = { score: round1(item.val), usedZ: false };
      continue;
    }
    const zEligible = list.filter((x) => !RAW_ONLY_IDS.has(x.id));
    const vals = zEligible.map((x) => x.val);
    const m = mean(vals) ?? 50;
    const sd = stdDev(vals);
    for (const item of list) {
      if (RAW_ONLY_IDS.has(item.id)) {
        normalized[item.id] = { score: round1(item.val), usedZ: false };
      } else {
        const z = sd > 1e-6 ? (item.val - m) / sd : 0;
        normalized[item.id] = { score: round1(clip(50 + 15 * z, 0, 100)), usedZ: true };
      }
    }
  }
  return normalized;
}

/**
 * Assemble complete counsellor_map_v1 JSON per PROMPT_Counsellor_Mapping_Agent §6.
 */
function buildCounsellorMap({
  studentId,
  studentResult,
  parentSummaries = [], // [{ parent_slot: 'parent_1'|'parent_2', summary }]
  consent = { student_consent_parent_view: false, counsellor_view_both_parents: true },
  earningLadder = null
}) {
  const dataGaps = [];
  if (!earningLadder) dataGaps.push('Verified earning ladder not supplied (data pending).');
  if (studentResult.norm_status === 'provisional') {
    dataGaps.push(`Grade ${studentResult.grade} norms are provisional (fewer than 500 completed assessments).`);
  }
  if (studentResult.validity?.flags?.length > 0) {
    dataGaps.push('Student validity flags raised; treat fit indices as provisional.');
  }
  if (parentSummaries.length === 0) {
    dataGaps.push('No parent Module 8 inventory submitted yet.');
  }

  const p1 = parentSummaries.find((p) => p.parent_slot === 'parent_1')?.summary || null;
  const p2 = parentSummaries.find((p) => p.parent_slot === 'parent_2')?.summary || null;
  const bothParents = Boolean(p1 && p2);
  const showParentLabels = Boolean(consent.counsellor_view_both_parents);

  const labelParent = (slot, txt) => (showParentLabels || !bothParents ? `${slot}: ${txt}` : `Parent summary: ${txt}`);

  // Merge cluster-level parent metrics
  const clusterMap = (studentResult.clusters || []).map((c) => {
    const obs1 = p1?.cluster_observed?.[c.id] ?? null;
    const obs2 = p2?.cluster_observed?.[c.id] ?? null;
    const obsVals = [obs1, obs2].filter((x) => x !== null);
    const parentObs = obsVals.length ? round1(mean(obsVals)) : null;

    const supVals = [p1?.cluster_support?.[c.id], p2?.cluster_support?.[c.id]].filter((x) => x != null);
    const parentSup = supVals.length ? round1(mean(supVals)) : null;

    const worVals = [p1?.cluster_income_worry?.[c.id], p2?.cluster_income_worry?.[c.id]].filter((x) => x != null);
    const parentWorry = worVals.length ? round1(mean(worVals)) : null;

    const prefs = [];
    if (p1?.parent_pref === c.id) prefs.push('parent_1');
    if (p2?.parent_pref === c.id) prefs.push('parent_2');

    const ownDream = (studentResult.m1_context?.own_dream || '').toLowerCase();
    const isDream = Boolean(ownDream && (c.name.toLowerCase().includes(ownDream.slice(0, 6)) || ownDream.includes(c.id.toLowerCase())));

    return {
      id: c.id,
      name: c.name,
      interest: c.interest,
      passion: c.passion,
      aptitude: c.aptitude,
      final: c.final,
      confidence: c.confidence_se ?? 50,
      parent_observed: parentObs,
      parent_support: parentSup,
      parent_income_worry: parentWorry,
      parent_pref: prefs,
      student_dream: isDream,
      _obs_diff: obs1 !== null && obs2 !== null ? Math.abs(obs1 - obs2) : 0
    };
  });

  // Perception gap (crosswalk Step 2)
  const studentRawMap = studentConstructScoreMap(studentResult);
  const parentRawMap = {};
  const parentConstructItems = {};
  for (const def of CROSSWALK.constructs) {
    const v1 = p1?.constructs?.[def.id]?.scaled_100 ?? null;
    const v2 = p2?.constructs?.[def.id]?.scaled_100 ?? null;
    const vals = [v1, v2].filter((x) => x !== null);
    if (vals.length > 0) {
      parentRawMap[def.id] = round1(mean(vals));
      parentConstructItems[def.id] = [
        ...(p1?.constructs?.[def.id]?.items || []),
        ...(p2?.constructs?.[def.id]?.items || [])
      ];
    }
  }

  const sNorm = normalizeByGroup(CROSSWALK.constructs, studentRawMap);
  const pNorm = normalizeByGroup(CROSSWALK.constructs, parentRawMap);

  const perceptionGap = [];
  for (const def of CROSSWALK.constructs) {
    if (sNorm[def.id] == null || pNorm[def.id] == null) continue;
    const sVal = sNorm[def.id].score;
    const pVal = pNorm[def.id].score;
    const gap = round1(pVal - sVal);
    const absGap = Math.abs(gap);
    const flag = absGap >= 35 ? 'high' : absGap >= 20 ? 'medium' : 'none';
    perceptionGap.push({
      id: def.id,
      label: def.label,
      group: def.group,
      student: sVal,
      parent: pVal,
      gap,
      flag,
      parent_items: parentConstructItems[def.id] || []
    });
  }

  // ---- Pattern Detectors (Step 5: P01..P15) ----
  const insights = [];
  const redFlags = [];
  let insightSeq = 1;
  const pushInsight = (data) => {
    insights.push({ id: `I${insightSeq++}`, ...data });
  };

  const top5Set = new Set(studentResult.top5 || []);
  const clusterById = Object.fromEntries(clusterMap.map((c) => [c.id, c]));

  // P11 WELLBEING_FLAG & Distress escalation
  const studentDistress = Boolean(studentResult.validity?.distress_detected);
  const parentDistress = Boolean(p1?.distress_items?.length || p2?.distress_items?.length);
  const anxStudentMean = studentResult.readiness?.test_anxiety_mean ?? 0;
  const pAnxVals = [p1?.constructs?.TEST_ANX?.raw_mean, p2?.constructs?.TEST_ANX?.raw_mean].filter((x) => x != null);
  const anxParentMean = pAnxVals.length ? mean(pAnxVals) : null;

  if (studentDistress || parentDistress) {
    redFlags.push('Distress indicators detected in free-text response. Follow school escalation protocol and speak with the student privately first.');
    pushInsight({
      pattern: 'P11 WELLBEING_FLAG',
      severity: 'high',
      title: 'Safety check required before career discussion',
      cluster: null,
      student_said: studentDistress ? [{ summary: 'Open-text response contains distress indicators.', items: studentResult.validity.distress_item_ids }] : [],
      parent_said: parentDistress ? [{ summary: 'Parent open-text raised a wellbeing concern.', items: [...(p1?.distress_items || []), ...(p2?.distress_items || [])] }] : [],
      meaning: 'Student wellbeing takes immediate precedence over academic or career planning.',
      suggestions: ['Follow the school escalation protocol and speak to the student privately before discussing career options.'],
      talking_points: ['Checking in on how things feel day to day comes first.'],
      avoid: 'Do not diagnose; do not conduct career counselling before safety triage.'
    });
  } else if (anxStudentMean >= 3.5 && (anxParentMean === null || anxParentMean < 3.0)) {
    redFlags.push('Elevated test anxiety reported by student; parents may not be aware.');
    pushInsight({
      pattern: 'P11 WELLBEING_FLAG',
      severity: 'high',
      title: 'Exam stress reported by student that parents may not see',
      cluster: null,
      student_said: [{ summary: `Reported elevated test anxiety (mean ${anxStudentMean}/5).`, items: ['M7-ANXIETY'] }],
      parent_said: pAnxVals.length
        ? [{ summary: `Parents rated exam anxiety lower (mean ${round1(anxParentMean)}/5).`, items: parentConstructItems.TEST_ANX || [] }]
        : [],
      meaning: 'The student experiences noticeable exam pressure that is not visible at home. Context for support, not a diagnosis.',
      suggestions: [
        'Open the session with the student privately and ask how tests feel.',
        'Agree on a calm revision routine and follow-up check.'
      ],
      talking_points: consent.student_consent_parent_view
        ? ['Many students experience more exam pressure than shows at home; calm routines help more than extra hours.']
        : ['Focus on healthy study pacing and reassurance before mentioning score specifics.'],
      avoid: 'Never share test-anxiety responses with parents without student consent; never use medical labels.'
    });
  }

  // P06 PRESSURE_DRIVEN
  if (studentResult.passion_type === 'Pressure-driven') {
    pushInsight({
      pattern: 'P06 PRESSURE_DRIVEN',
      severity: 'high',
      title: 'Career motivation shows external pressure indicators',
      cluster: studentResult.top5?.[0] || null,
      student_said: [{ summary: `Pressure-driven passion subscale elevated (${studentResult.readiness?.pressure_mean}/5); stated passion weighted conservatively.`, items: ['M2-PAS-PRESSURE'] }],
      parent_said: p1?.parent_pref || p2?.parent_pref
        ? [{ summary: `Parent preferences recorded (${[p1?.parent_pref, p2?.parent_pref].filter(Boolean).join(', ')}).`, items: [...(p1?.parent_pref_items || []), ...(p2?.parent_pref_items || [])] }]
        : [],
      meaning: 'The student may be factoring perceived expectations heavily into career goals.',
      suggestions: [
        'Hold a brief student-only segment asking what activities excite them without outside expectations.',
        'Explore high-interest clusters side by side with family expectations.'
      ],
      talking_points: ['Let us explore what energises you day-to-day alongside family priorities.'],
      avoid: 'Never accuse parents of forcing the child.'
    });
  }

  // P04 EXPECTATION_GAP
  const seenPrefGaps = new Set();
  for (const [slot, pObj] of [['parent_1', p1], ['parent_2', p2]]) {
    if (!pObj?.parent_pref || seenPrefGaps.has(pObj.parent_pref)) continue;
    if (!top5Set.has(pObj.parent_pref)) {
      seenPrefGaps.add(pObj.parent_pref);
      const targetCluster = clusterById[pObj.parent_pref];
      const topCluster = clusterById[studentResult.top5[0]];
      pushInsight({
        pattern: 'P04 EXPECTATION_GAP',
        severity: 'high',
        title: `Parent expectation (${targetCluster?.name || pObj.parent_pref}) differs from student Top 5`,
        cluster: pObj.parent_pref,
        student_said: [{ summary: `Top measured clusters: ${topCluster?.name} (${topCluster?.final}), with ${targetCluster?.name} at fit ${targetCluster?.final}.`, items: ['M2-INT', 'M4-APT'] }],
        parent_said: [{ summary: labelParent(slot, `Selected ${targetCluster?.name} as primary field preference.`), items: pObj.parent_pref_items }],
        meaning: 'Parent and student have different career fields in focus; bridge options or shared subjects can create common ground.',
        suggestions: [
          'Compare both clusters fit profiles side by side.',
          'Identify overlapping courses or entrance routes (verify the current year’s rules).',
          'Ask parents which outcome matters most (stability, growth, income).'
        ],
        talking_points: [`${topCluster?.name} reflects strong measured fit, and transferable skills can bridge shared priorities.`],
        avoid: 'Do not declare either side wrong.'
      });
    }
  }

  // P10 PARENT_DISAGREEMENT
  if (bothParents) {
    const prefDiffer = p1.parent_pref && p2.parent_pref && p1.parent_pref !== p2.parent_pref;
    const obsDiffCluster = clusterMap.find((c) => top5Set.has(c.id) && c._obs_diff >= 25);
    if (prefDiffer || obsDiffCluster) {
      pushInsight({
        pattern: 'P10 PARENT_DISAGREEMENT',
        severity: (obsDiffCluster?._obs_diff >= 40 || prefDiffer) ? 'high' : 'medium',
        title: prefDiffer ? 'The two parents recorded different career preferences' : 'Parents hold noticeably different views of a key strength',
        cluster: obsDiffCluster?.id || null,
        student_said: [],
        parent_said: showParentLabels
          ? [
              { summary: `parent_1 prefers ${CLUSTERS[p1.parent_pref]?.name || 'unspecified'}.`, items: p1.parent_pref_items || [] },
              { summary: `parent_2 prefers ${CLUSTERS[p2.parent_pref]?.name || 'unspecified'}.`, items: p2.parent_pref_items || [] }
            ]
          : [{ summary: 'Two parent inputs show divergent expectations across fields.', items: [] }],
        meaning: 'Mixed expectations at home can leave a student unsure which direction has support.',
        suggestions: ['Agree criteria together first (interest, aptitude, budget, location) before comparing specific courses.'],
        talking_points: ['Let us first agree on what a positive outcome looks like for your child.'],
        avoid: 'Never take sides between parents or share one parent’s raw item answers.'
      });
    }
  }

  // P05 INCOME_WORRY
  const incomeWorryCluster = clusterMap.find((c) => (top5Set.has(c.id) || c.flags?.includes('hidden_gem')) && c.parent_income_worry >= 4);
  if (incomeWorryCluster) {
    pushInsight({
      pattern: 'P05 INCOME_WORRY',
      severity: 'medium',
      title: `High earning concern around ${incomeWorryCluster.name}`,
      cluster: incomeWorryCluster.id,
      student_said: [{ summary: `Ranked values with ${studentResult.values_rank?.slice(0, 2).join(' & ')} on top.`, items: ['M5-VALUES'] }],
      parent_said: [{ summary: `Recorded elevated income concern (${incomeWorryCluster.parent_income_worry}/5) for ${incomeWorryCluster.name}.`, items: ['M8-EXPECTATION'] }],
      meaning: 'Parental hesitation stems from financial uncertainty rather than student capability.',
      suggestions: [
        'Share verified career progression data (earning ladder data pending — use accredited placement statistics).',
        'Discuss specialisation tracks and public university fee structures.'
      ],
      talking_points: ['The concern is financial stability, not ability — let us map concrete career paths in this field.'],
      avoid: 'Never quote unverified salary figures.'
    });
  }

  // P03 PARENT_BLIND_SPOT
  for (const c of clusterMap) {
    if (c.interest >= 70 && c.passion >= 60 && c.parent_observed !== null && c.parent_observed < 45) {
      pushInsight({
        pattern: 'P03 PARENT_BLIND_SPOT',
        severity: 'medium',
        title: `Strong student interest in ${c.name} is less visible at home`,
        cluster: c.id,
        student_said: [{ summary: `High interest (${c.interest}) and passion (${c.passion}) in ${c.name}.`, items: ['M2-INT', 'M2-PAS'] }],
        parent_said: [{ summary: `Low observed home evidence (${c.parent_observed}).`, items: [...(p1?.cluster_obs_items?.[c.id] || []), ...(p2?.cluster_obs_items?.[c.id] || [])] }],
        meaning: 'The student explores this area independently outside family routines.',
        suggestions: [
          'Invite the student to share concrete projects or hobbies with parents.',
          'Suggest a low-cost short project or school club trial.'
        ],
        talking_points: ['Your child invests independent time here, which is a strong signal of curiosity.'],
        avoid: 'Do not frame parents as uninvolved.'
      });
      break;
    }
  }

  // P02 HIDDEN_TALENT
  for (const c of clusterMap) {
    if (c.parent_observed !== null && c.parent_observed >= 70 && c.interest < 50) {
      pushInsight({
        pattern: 'P02 HIDDEN_TALENT',
        severity: 'medium',
        title: `Parent observes high capability in ${c.name} that student ranked lower`,
        cluster: c.id,
        student_said: [{ summary: `Interest score for ${c.name} is ${c.interest}.`, items: ['M2-INT'] }],
        parent_said: [{ summary: `Strong observed behaviours and feedback (${c.parent_observed}).`, items: [...(p1?.cluster_obs_items?.[c.id] || []), ...(p2?.cluster_obs_items?.[c.id] || [])] }],
        meaning: 'A genuine behavioural skill that can support other preferred career tracks.',
        suggestions: ['Position this capability as a transferable strength rather than forcing a switch of field.'],
        talking_points: ['This is a valuable strength your child can carry into their preferred career.'],
        avoid: 'Do not push it over the student’s core interest.'
      });
      break;
    }
  }

  // P08 APTITUDE_EXPECTATION_MISMATCH
  for (const dim of ['N', 'L', 'V', 'S', 'P']) {
    const gapRow = perceptionGap.find((g) => g.id === `APT_${dim}` && g.gap >= 20);
    if (gapRow) {
      pushInsight({
        pattern: 'P08 APTITUDE_EXPECTATION_MISMATCH',
        severity: 'medium',
        title: `Parent perceives ${gapRow.label} higher than timed score shows`,
        cluster: null,
        student_said: [{ summary: `${gapRow.label} normalized score: ${gapRow.student}.`, items: [`M4-${dim}`] }],
        parent_said: [{ summary: `Parent comparison score: ${gapRow.parent}.`, items: gapRow.parent_items }],
        meaning: 'Measured strengths lie elsewhere or skill speed needs targeted practice.',
        suggestions: ['Review strongest measured aptitude areas and pair any target exam with a structured 6-month practice plan.'],
        talking_points: ['Timed reasoning speed can be trained with focused practice alongside current strengths.'],
        avoid: 'Do not compare the student with siblings or peers.'
      });
      break;
    }
  }

  // P09 CONFIDENCE_GAP
  const confGapCluster = clusterMap.find((c) => top5Set.has(c.id) && c.confidence != null && Math.abs(c.aptitude - c.confidence) >= 20);
  if (confGapCluster) {
    const gap = round1(confGapCluster.aptitude - confGapCluster.confidence);
    pushInsight({
      pattern: 'P09 CONFIDENCE_GAP',
      severity: 'medium',
      title: gap > 0 ? `Under-confidence in ${confGapCluster.name}` : `Over-estimation vs. measured aptitude in ${confGapCluster.name}`,
      cluster: confGapCluster.id,
      student_said: [{ summary: `Aptitude fit ${confGapCluster.aptitude} vs. self-efficacy ${confGapCluster.confidence}.`, items: ['M4-APT', 'M7-SE'] }],
      parent_said: [],
      meaning: gap > 0 ? 'Student performs better objectively than they believe.' : 'Self-confidence outpaces current measured readiness.',
      suggestions: [gap > 0 ? 'Walk through concrete assessment wins to build confidence.' : 'Benchmark entrance fundamentals early and set realistic practice goals.'],
      talking_points: [gap > 0 ? 'Your measured ability here is stronger than you give yourself credit for.' : 'Confidence is great; pairing it with basics keeps preparation solid.'],
      avoid: 'Do not deflate enthusiasm.'
    });
  }

  // P12 READINESS_LOW
  if (studentResult.readiness?.career_maturity_mean < 2.5 || (studentResult.readiness?.career_awareness_pct ?? 100) < 40) {
    pushInsight({
      pattern: 'P12 READINESS_LOW',
      severity: 'medium',
      title: 'Career awareness indicates need for guided exploration',
      cluster: null,
      student_said: [{ summary: `Career awareness: ${studentResult.readiness?.career_awareness_pct ?? 'N/A'}%; decision style: ${studentResult.readiness?.decision_style}.`, items: ['M7-AWARENESS', 'M7-DECISION'] }],
      parent_said: [],
      meaning: 'The student would benefit from learning what careers involve day-to-day before locking a path.',
      suggestions: ['Agree on a 30-day exploration checklist (informational chats, curriculum review) before setting a firm choice date.'],
      talking_points: ['Taking a few weeks to explore what real jobs involve leads to better choices.'],
      avoid: 'Do not rush an irreversible decision.'
    });
  }

  // P01 ALIGNED_STRENGTH
  const alignedCluster = clusterMap.find((c) => top5Set.has(c.id) && c.interest >= 65 && c.parent_observed !== null && c.parent_observed >= 65);
  if (alignedCluster) {
    pushInsight({
      pattern: 'P01 ALIGNED_STRENGTH',
      severity: 'info',
      title: `Both student and parents recognize strength in ${alignedCluster.name}`,
      cluster: alignedCluster.id,
      student_said: [{ summary: `Top-5 fit (${alignedCluster.final}) with interest ${alignedCluster.interest}.`, items: ['M2-INT'] }],
      parent_said: [{ summary: `High parent observation score (${alignedCluster.parent_observed}).`, items: [...(p1?.cluster_obs_items?.[alignedCluster.id] || []), ...(p2?.cluster_obs_items?.[alignedCluster.id] || [])] }],
      meaning: 'Strong mutual agreement gives a supportive foundation to build concrete next steps.',
      suggestions: ['Confirm subject/course prerequisites and verify entrance exam rules for the current year.'],
      talking_points: ['You and your child see the same natural strength here.'],
      avoid: 'Do not skip reviewing aptitude fit.'
    });
  }

  // Sort insights by PATTERN_PRIORITY & cap at 10 (retaining all high)
  insights.sort((a, b) => {
    const pa = PATTERN_PRIORITY.indexOf(a.pattern.split(' ')[0]);
    const pb = PATTERN_PRIORITY.indexOf(b.pattern.split(' ')[0]);
    return pa - pb;
  });
  const highInsights = insights.filter((i) => i.severity === 'high');
  const restInsights = insights.filter((i) => i.severity !== 'high').slice(0, Math.max(0, 10 - highInsights.length));
  const finalInsights = [...highInsights, ...restInsights];

  // Build Evidence Flow (3 columns: student_nodes -> cluster_nodes -> parent_nodes)
  const topClusterIds = [...new Set([
    ...(studentResult.top5 || []).slice(0, 4),
    ...(p1?.parent_pref ? [p1.parent_pref] : []),
    ...(p2?.parent_pref ? [p2.parent_pref] : [])
  ])].slice(0, 5);

  const studentNodes = [
    { id: 'S1', label: `M2 Interests: ${studentResult.riasec_code}` },
    { id: 'S2', label: `M2 Passion: ${studentResult.passion_type}` },
    { id: 'S3', label: `M4 Aptitude: Logic ${studentResult.aptitude?.L ?? 0}` },
    { id: 'S4', label: `M5 Values: ${studentResult.values_rank?.[0] || 'Core'} top` },
    { id: 'S5', label: `M6 EQ: ${studentResult.aptitude?.EQ ?? 0}` }
  ];
  const clusterNodes = topClusterIds.map((cid) => ({
    id: cid,
    label: CLUSTERS[cid]?.name || cid
  }));
  const parentNodes = [];
  const links = [];

  for (const cid of topClusterIds) {
    const c = clusterById[cid];
    if (!c) continue;
    links.push({ from: 'S1', to: cid, w: Math.max(1, Math.min(10, Math.round(c.interest / 12))) });
    links.push({ from: 'S2', to: cid, w: Math.max(1, Math.min(10, Math.round(c.passion / 14))) });
    links.push({ from: 'S3', to: cid, w: Math.max(1, Math.min(10, Math.round(c.aptitude / 14))) });
  }
  if (p1 || p2) {
    parentNodes.push({ id: 'P1', label: 'Parent: observed traits' });
    for (const cid of topClusterIds) {
      const obs = clusterById[cid]?.parent_observed;
      if (obs != null && obs >= 45) links.push({ from: cid, to: 'P1', w: Math.max(1, Math.min(10, Math.round(obs / 12))) });
    }
    if (p1?.parent_pref && topClusterIds.includes(p1.parent_pref)) {
      parentNodes.push({ id: 'P2', label: `Parent 1 prefers ${CLUSTERS[p1.parent_pref]?.name?.split(',')[0]}` });
      links.push({ from: p1.parent_pref, to: 'P2', w: 6 });
    }
    if (p2?.parent_pref && topClusterIds.includes(p2.parent_pref)) {
      parentNodes.push({ id: 'P3', label: `Parent 2 prefers ${CLUSTERS[p2.parent_pref]?.name?.split(',')[0]}` });
      links.push({ from: p2.parent_pref, to: 'P3', w: 6 });
    }
  } else {
    parentNodes.push({ id: 'P0', label: 'Parent inventory pending' });
  }

  // Tailored 60-minute Session Plan
  const hasWellbeing = redFlags.length > 0 || anxStudentMean >= 3.5;
  const sessionPlan = hasWellbeing
    ? [
        { min: 15, step: 'Student alone (Wellbeing check first)', goal: 'Check test stress gently and confirm safety before reviewing career paths.' },
        { min: 5, step: 'Open together', goal: 'Frame results as conversation starters, not verdicts.' },
        { min: 10, step: 'Parents alone', goal: 'Hear priorities (stability, growth, location, income).' },
        { min: 20, step: 'Joint: evidence walkthrough', goal: 'Review top clusters, strengths, and bridge routes calmly.' },
        { min: 10, step: 'Next steps', goal: 'Agree one exploration step, study rhythm, and follow-up date.' }
      ]
    : [
        { min: 5, step: 'Open together', goal: 'Set a supportive, strength-first tone.' },
        { min: 10, step: 'Student alone', goal: 'Validate interests, own goals, and any unspoken hesitations.' },
        { min: 10, step: 'Parents alone', goal: 'Clarify key hopes, budget bounds, and practical questions.' },
        { min: 20, step: 'Joint: evidence walkthrough', goal: 'Compare top clusters, aptitudes, and alignment points.' },
        { min: 15, step: 'Next steps', goal: 'Confirm subject/course action plan and verify current-year exam rules.' }
      ];

  const parentsResponded = parentSummaries.map((p) => p.parent_slot);
  const topNames = (studentResult.top5 || []).slice(0, 2).map((id) => CLUSTERS[id]?.name).join(' and ');

  return {
    schema: 'counsellor_map_v1',
    meta: {
      student_id: String(studentId),
      grade: String(studentResult.grade || '10'),
      generated_at: new Date().toISOString(),
      norm_status: studentResult.norm_status || 'provisional',
      validity_flags: (studentResult.validity?.flags || []).map((f) => f.code),
      parents_responded: parentsResponded,
      demo: false
    },
    student_summary: {
      riasec_code: studentResult.riasec_code,
      passion_type: studentResult.passion_type,
      grit: studentResult.grit,
      picks: studentResult.picks,
      top5: studentResult.top5
    },
    cluster_map: clusterMap.map(({ _obs_diff, ...clean }) => clean),
    perception_gap: perceptionGap,
    evidence_flow: { student_nodes: studentNodes, cluster_nodes: clusterNodes, parent_nodes: parentNodes, links },
    insights: finalInsights,
    red_flags: redFlags,
    session_plan: sessionPlan,
    data_gaps: dataGaps,
    counsellor_summary: `Student’s highest composite fits are ${topNames} (RIASEC ${studentResult.riasec_code}, ${studentResult.passion_type} passion). ${
      parentsResponded.length > 0
        ? `${parentsResponded.length} parent response(s) mapped with ${finalInsights.length} insight pattern(s) identified for session planning.`
        : 'Parent Module 8 observations are not yet submitted; alignment patterns will activate once completed.'
    }`
  };
}

module.exports = {
  summarizeParentM8,
  buildCounsellorMap,
  studentConstructScoreMap
};
