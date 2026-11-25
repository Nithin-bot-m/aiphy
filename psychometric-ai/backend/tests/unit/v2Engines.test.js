// Unit tests for V2 Blueprint selector, Validity engine, 16-Cluster engine, and Counsellor Map engine.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { V2_SEEDS_DIR } = require('../../src/services/psychometrics/v2Constants');
const { buildStudentBlueprint, buildParentBlueprint, sanitizeV2ItemForClient } = require('../../src/services/psychometrics/blueprintV2Strategy');
const { runValidityChecks } = require('../../src/services/psychometrics/validityEngine');
const { scoreV2Assessment, scoreCreativityOpenText } = require('../../src/services/psychometrics/v2ClusterEngine');
const { summarizeParentM8, buildCounsellorMap } = require('../../src/services/psychometrics/counsellorMapEngine');

function loadBankItems() {
  const files = [
    'M1_Profile_Batch01.jsonl',
    'M2_Interests_Passion_Batch01.jsonl',
    'M3_Personality_Thinking_Batch01.jsonl',
    'M4_Aptitude_Batch01.jsonl',
    'M5_Values_Batch01.jsonl',
    'M6_EQ_SoftSkills_Batch01.jsonl',
    'M7_Academic_Confidence_Readiness_Batch01.jsonl',
    'M8_Parent_Observation_Batch01.jsonl',
    'M8_Parent_Mirror_Items_Batch02.jsonl'
  ];
  let id = 1;
  const rows = [];
  for (const fname of files) {
    const raw = fs.readFileSync(path.join(V2_SEEDS_DIR, fname), 'utf8').trim();
    if (!raw) continue;
    for (const line of raw.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const obj = JSON.parse(line);
      if (obj._meta) continue;
      const order = id++;
      rows.push({
        id: order,
        external_id: obj.id,
        module: Number(obj.module),
        respondent: obj.respondent === 'parent' ? 'parent' : 'student',
        sub: obj.sub || null,
        dim: obj.dim || null,
        field_name: obj.field || null,
        item_type: obj.type,
        grade_scope: String(obj.grade || 'both'),
        difficulty: obj.difficulty || null,
        time_sec: obj.time_sec != null ? Number(obj.time_sec) : null,
        scale_name: obj.scale || null,
        stem: obj.stem || '',
        options_json: obj.options ? JSON.stringify(obj.options) : null,
        answer_key: obj.answer != null ? String(obj.answer) : null,
        key_json: obj.key ? JSON.stringify(obj.key) : null,
        display_order: order
      });
    }
  }
  return rows;
}

function mockStudentAnswerForItem(item, { targetCluster = 'C01', genderKey = '1', budgetKey = '2', fastMs = 4500, distressText = null } = {}) {
  const opts = JSON.parse(item.options_json || '[]');
  const key = JSON.parse(item.key_json || '{}');
  const base = {
    item_id: item.id,
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
    options_json: item.options_json,
    item_answer_key: item.answer_key,
    key_json: item.key_json,
    display_order: item.display_order,
    response_time_ms: fastMs,
    answer_key: null,
    numeric_value: null,
    response_json: null,
    response_text: null
  };

  if (item.field_name === 'gender') return { ...base, answer_key: genderKey };
  if (item.field_name === 'budget') return { ...base, answer_key: budgetKey };

  switch (item.item_type) {
    case 'likert5': {
      let val = 3;
      if (item.sub === 'INFREQ') val = 2;
      else if (key.cluster === targetCluster) val = 5;
      return { ...base, numeric_value: val, answer_key: String(val) };
    }
    case 'single_select':
    case 'mcq':
    case 'forced_choice':
    case 'scenario':
    case 'sjt': {
      const k = opts[0]?.k ? String(opts[0].k) : '1';
      return { ...base, answer_key: k };
    }
    case 'best_worst': {
      return { ...base, response_json: JSON.stringify({ most: String(opts[0].k), least: String(opts[opts.length - 1].k) }) };
    }
    case 'ranking': {
      return { ...base, response_json: JSON.stringify(opts.map((o) => String(o.k))) };
    }
    case 'multi_select': {
      return { ...base, response_json: JSON.stringify([String(opts[0].k)]) };
    }
    case 'open_text': {
      if (distressText && (item.module === 1 || item.module === 2)) return { ...base, response_text: distressText };
      return {
        ...base,
        response_text: 'I enjoy coding software apps, designing digital tools, helping friends learn physics, and sketching hardware prototypes.'
      };
    }
    default:
      return base;
  }
}

test('blueprint: deterministic grade segregation & client sanitization', () => {
  const bank = loadBankItems();
  const studentBank = bank.filter((i) => i.respondent === 'student');
  const bp10A = buildStudentBlueprint(studentBank, { assessmentId: 42, grade: 10 });
  const bp10B = buildStudentBlueprint(studentBank, { assessmentId: 42, grade: 10 });
  const bp12 = buildStudentBlueprint(studentBank, { assessmentId: 42, grade: 12 });

  assert.deepEqual(bp10A.itemIds, bp10B.itemIds, 'same seed produces identical blueprint');
  assert.ok(bp10A.itemIds.length >= 120 && bp10A.itemIds.length <= 210, `unexpected blueprint length: ${bp10A.itemIds.length}`);
  assert.notDeepEqual(bp10A.itemIds, bp12.itemIds, 'Grade 10 and Grade 12 blueprints must diverge cleanly');

  const sampleApt = studentBank.find((x) => x.module === 4 && x.item_type === 'mcq');
  const clean = sanitizeV2ItemForClient(sampleApt);
  assert.equal(clean.key_json, undefined);
  assert.equal(clean.answer_key, undefined);
  assert.ok(!clean.options.some((o) => 'correct' in o || 'best' in o), 'client item must never expose scoring keys');

  const parentBank = bank.filter((i) => i.respondent === 'parent');
  const pbp = buildParentBlueprint(parentBank, { assessmentId: 42, parentId: 99 });
  assert.ok(pbp.itemIds.length >= 40, `parent M8 blueprint length=${pbp.itemIds.length}`);
});

test('scoring: creativity rubric measures fluency and category flexibility', () => {
  const low = scoreCreativityOpenText('brick');
  const high = scoreCreativityOpenText('paperweight, garden border, crushed chalk, bookend, workout weight, art sculpture, doorstop, heat retain, paint stamp, percussion click');
  assert.ok(high.score > low.score + 20, `expected high=${high.score} > low=${low.score}`);
  assert.ok(high.flexibility >= 4);
});

test('scoring: fairness invariance across gender and budget demographic answers', () => {
  const bank = loadBankItems();
  const studentBank = bank.filter((i) => i.respondent === 'student');
  const bp = buildStudentBlueprint(studentBank, { assessmentId: 101, grade: 10 });
  const items = bp.itemIds.map((id) => studentBank.find((x) => x.id === id));

  const resMaleRich = scoreV2Assessment({
    responsesJoined: items.map((it) => mockStudentAnswerForItem(it, { targetCluster: 'C01', genderKey: '1', budgetKey: '1' })),
    studentGrade: 10
  });
  const resFemaleModest = scoreV2Assessment({
    responsesJoined: items.map((it) => mockStudentAnswerForItem(it, { targetCluster: 'C01', genderKey: '2', budgetKey: '4' })),
    studentGrade: 10
  });

  assert.equal(resMaleRich.riasec_code, resFemaleModest.riasec_code);
  assert.deepEqual(resMaleRich.aptitude, resFemaleModest.aptitude);
  assert.deepEqual(
    resMaleRich.clusters.map((c) => [c.id, c.final]),
    resFemaleModest.clusters.map((c) => [c.id, c.final]),
    'demographics & budget must NEVER alter cluster scores'
  );
  assert.equal(resMaleRich.norm_status, 'provisional');
  assert.equal(resMaleRich.streams_10.length, 5);
});

test('validity: flags speeding, straight-lining, and distress disclosure', () => {
  const bank = loadBankItems();
  const studentBank = bank.filter((i) => i.respondent === 'student');
  const bp = buildStudentBlueprint(studentBank, { assessmentId: 77, grade: 12 });
  const items = bp.itemIds.map((id) => studentBank.find((x) => x.id === id));

  // Force straight-lining + fast times + distress wording
  const responses = items.map((it) => {
    const r = mockStudentAnswerForItem(it, { fastMs: 700, distressText: 'I feel hopeless and want to give up' });
    if (r.item_type === 'likert5' && r.module >= 2) {
      return { ...r, numeric_value: 3, answer_key: '3' };
    }
    return r;
  });

  const v = runValidityChecks(responses);
  const codes = new Set(v.flags.map((f) => f.code));
  assert.ok(codes.has('speeding_likert'), 'expected speeding_likert flag');
  assert.ok(codes.has('speeding_aptitude'), 'expected speeding_aptitude flag');
  assert.ok(codes.has('straight_lining'), 'expected straight_lining flag');
  assert.equal(v.distress_detected, true, 'expected distress_detected flag');
  assert.equal(v.is_provisional_due_to_validity, true);
});

test('counsellor map: perception gap, P10 inter-parent conflict, P11 distress escalation', () => {
  const bank = loadBankItems();
  const studentBank = bank.filter((i) => i.respondent === 'student');
  const bp = buildStudentBlueprint(studentBank, { assessmentId: 505, grade: 10 });
  const items = bp.itemIds.map((id) => studentBank.find((x) => x.id === id));
  const studentResult = scoreV2Assessment({
    responsesJoined: items.map((it) => mockStudentAnswerForItem(it, { targetCluster: 'C08', distressText: 'I want to hurt myself' })),
    studentGrade: 10
  });

  const p1 = {
    parent_pref: 'C01',
    constructs: {
      TEST_ANX: { raw_mean: 4.6, scaled_100: 90, items: ['M8-ANX-1'] },
      CONSC_DISCIP: { raw_mean: 4.5, scaled_100: 88, items: ['M8-CON-1'] }
    },
    cluster_observed: { C08: 88, C01: 72 },
    cluster_support: { C01: 90, C08: 35 },
    cluster_income_worry: { C08: 85 },
    distress_items: ['M8-WELL-1']
  };
  const p2 = {
    parent_pref: 'C08',
    constructs: {
      TEST_ANX: { raw_mean: 3.0, scaled_100: 50, items: [] }
    },
    cluster_observed: { C08: 90, C01: 45 },
    cluster_support: { C08: 85 },
    cluster_income_worry: { C08: 25 },
    distress_items: []
  };

  const map = buildCounsellorMap({
    studentId: 'PC-TEST505',
    studentResult,
    parentSummaries: [
      { parent_slot: 'parent_1', summary: p1 },
      { parent_slot: 'parent_2', summary: p2 }
    ]
  });

  assert.equal(map.schema, 'counsellor_map_v1');
  assert.ok(map.cluster_map.length === 16);
  assert.ok(map.red_flags.length >= 1, 'P11 red flag should trigger');
  assert.ok(map.insights.some((i) => i.pattern.startsWith('P10')), 'inter-parent disagreement P10 should trigger');
  assert.equal(map.session_plan[0].min, 15, 'wellbeing-first session plan starts with 15 min student alone check');
  assert.equal(typeof summarizeParentM8, 'function');
});
