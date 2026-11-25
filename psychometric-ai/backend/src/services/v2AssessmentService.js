// V2 Assessment, Parent Module 8, and Counsellor Map orchestration service.
const { db, transaction } = require('../config/db');
const assessmentRepository = require('../repositories/assessmentRepository');
const userRepository = require('../repositories/userRepository');
const v2Repository = require('../repositories/v2Repository');
const { buildStudentBlueprint, buildParentBlueprint, sanitizeV2ItemForClient, parseOpts } = require('./psychometrics/blueprintV2Strategy');
const { scoreV2Assessment } = require('./psychometrics/v2ClusterEngine');
const { summarizeParentM8, buildCounsellorMap } = require('./psychometrics/counsellorMapEngine');
const { logAudit } = require('../middleware/auditLogger');
const { badRequest, conflict, notFound } = require('../utils/helpers');

function normalizeGrade(rawGrade) {
  const g = Number(rawGrade);
  return g >= 11 ? 12 : 10;
}

// =========================================================================
// STUDENT ASSESSMENT LIFECYCLE (V2)
// =========================================================================
async function startOrResumeV2(req) {
  const student = await userRepository.findStudentByUserId(req.user.id);
  if (!student) throw notFound('Student profile not found.');

  const version = await assessmentRepository.getVersionByCode('V2');
  if (!version) throw conflict('V2 assessment bank is not initialized.');
  if (!version.is_active) {
    throw conflict('V2 assessment is currently inactive. Ask an administrator to activate V2 in the Admin Console.');
  }

  let assessment = await db.prepare(
    "SELECT * FROM assessments WHERE student_id = ? AND version_id = ? AND status = 'in_progress' ORDER BY id DESC LIMIT 1"
  ).get(student.id, version.id);

  if (!assessment) {
    const id = await assessmentRepository.createAssessment({ studentId: student.id, versionId: version.id });
    assessment = await assessmentRepository.getAssessmentById(id);
    await logAudit(req, 'START_V2_ASSESSMENT', 'ASSESSMENT', id, { version: 'V2', grade: student.grade });
  }

  let bp = await v2Repository.getBlueprint(assessment.id);
  if (!bp) {
    const grade = normalizeGrade(student.grade);
    const items = await v2Repository.getItemsForVersion(version.id, { respondent: 'student' });
    const built = buildStudentBlueprint(items, { assessmentId: assessment.id, grade });
    await v2Repository.upsertBlueprint({ assessmentId: assessment.id, grade, itemIds: built.itemIds });
    bp = await v2Repository.getBlueprint(assessment.id);
  }

  return { assessment, version, blueprint: bp };
}

async function getV2Questions(req, assessment) {
  const student = await userRepository.findStudentById(assessment.student_id);
  let bp = await v2Repository.getBlueprint(assessment.id);
  if (!bp) {
    const grade = normalizeGrade(student?.grade || 10);
    const items = await v2Repository.getItemsForVersion(assessment.version_id, { respondent: 'student' });
    const built = buildStudentBlueprint(items, { assessmentId: assessment.id, grade });
    await v2Repository.upsertBlueprint({ assessmentId: assessment.id, grade, itemIds: built.itemIds });
    bp = await v2Repository.getBlueprint(assessment.id);
  }

  const itemIds = JSON.parse(bp.item_ids_json || '[]');
  const rawItems = await v2Repository.getItemsByIds(itemIds);
  const sanitized = rawItems.map(sanitizeV2ItemForClient);

  const saved = await v2Repository.listV2ResponsesJoined(assessment.id, 'student');
  const responseMap = {};
  for (const r of saved) {
    responseMap[r.item_id] = {
      answer_key: r.answer_key,
      numeric_value: r.numeric_value,
      response_json: r.response_json ? JSON.parse(r.response_json) : null,
      response_text: r.response_text
    };
  }

  const accommodations = bp.accommodations_json ? JSON.parse(bp.accommodations_json) : { extended_time_pct: 0, simpler_wording: false };

  return {
    assessment_id: assessment.id,
    version_code: 'V2',
    strategy: 'blueprint_v2',
    grade: bp.grade,
    accommodations,
    total_questions: sanitized.length,
    answered: Object.keys(responseMap).length,
    current_step: assessment.current_step,
    questions: sanitized,
    responses: responseMap
  };
}

function validateAndNormalizePayload(item, body) {
  const opts = parseOpts(item);
  const validKeys = new Set(opts.map((o) => String(o.k)));
  const type = item.item_type;

  let answerKey = null;
  let numericValue = null;
  let responseJson = null;
  let responseText = null;

  if (type === 'likert5') {
    const num = Number(body.numeric_value ?? body.answer_key);
    if (!Number.isInteger(num) || num < 1 || num > 5) {
      throw badRequest('Likert response must be an integer from 1 to 5.');
    }
    numericValue = num;
    answerKey = String(num);
  } else if (['single_select', 'mcq', 'forced_choice', 'scenario', 'sjt'].includes(type)) {
    const key = body.answer_key != null ? String(body.answer_key) : null;
    if (!key || !validKeys.has(key)) {
      throw badRequest('Selected answer key does not belong to this item.');
    }
    answerKey = key;
  } else if (type === 'best_worst') {
    const val = body.response_json || {};
    const most = val.most != null ? String(val.most) : null;
    const least = val.least != null ? String(val.least) : null;
    if (!most || !least || !validKeys.has(most) || !validKeys.has(least) || most === least) {
      throw badRequest('best_worst requires distinct valid "most" and "least" option keys.');
    }
    responseJson = JSON.stringify({ most, least });
  } else if (type === 'ranking') {
    const order = Array.isArray(body.response_json) ? body.response_json.map(String) : null;
    if (!order || order.length !== opts.length || new Set(order).size !== opts.length || order.some((k) => !validKeys.has(k))) {
      throw badRequest(`ranking requires a complete ordering of all ${opts.length} options.`);
    }
    responseJson = JSON.stringify(order);
  } else if (type === 'multi_select') {
    const picks = Array.isArray(body.response_json) ? body.response_json.map(String) : null;
    if (!picks || picks.length === 0 || picks.length > Math.min(4, opts.length) || picks.some((k) => !validKeys.has(k))) {
      throw badRequest(`multi_select requires 1 to ${Math.min(4, opts.length)} valid selections.`);
    }
    responseJson = JSON.stringify([...new Set(picks)]);
  } else if (type === 'open_text') {
    const txt = typeof body.response_text === 'string' ? body.response_text.trim() : '';
    if (txt.length < 2) {
      throw badRequest('Please enter a short written response.');
    }
    responseText = txt.slice(0, 4000);
  } else {
    throw badRequest(`Unsupported item type: ${type}`);
  }

  return { answerKey, numericValue, responseJson, responseText };
}

async function saveV2Response(req, assessment) {
  if (assessment.status === 'completed') throw conflict('Assessment is already completed.');
  const itemId = Number(req.body.item_id ?? req.body.question_id);
  const item = await v2Repository.getItemById(itemId);
  if (!item || item.version_id !== assessment.version_id || !item.is_active || item.respondent !== 'student') {
    throw badRequest('Item does not belong to this V2 assessment.');
  }

  const bp = await v2Repository.getBlueprint(assessment.id);
  const pinnedIds = new Set(JSON.parse(bp?.item_ids_json || '[]'));
  if (!pinnedIds.has(item.id)) {
    throw badRequest('Item is not part of this student’s pinned blueprint.');
  }

  const normalized = validateAndNormalizePayload(item, req.body);
  const rt = Number.isFinite(Number(req.body.response_time_ms))
    ? Math.min(Math.max(Math.round(Number(req.body.response_time_ms)), 0), 3_600_000)
    : 0;

  await v2Repository.upsertV2Response({
    assessmentId: assessment.id,
    itemId: item.id,
    respondentType: 'student',
    parentId: null,
    ...normalized,
    responseTimeMs: rt
  });

  // Dynamic M1 routing/accommodations updates:
  // If student answers M1-001 (grade) cleanly before M4 and grade differs, refresh M2-M7 blueprint cleanly!
  // If student answers M1-028 (learning_support) or M1-004 (english_comfort), persist accommodations immediately.
  let gradeChanged = false;
  let activeGrade = bp ? bp.grade : 10;
  let activeAcc = bp?.accommodations_json ? JSON.parse(bp.accommodations_json) : { extended_time_pct: 0, simpler_wording: false };

  if (item.module === 1 && bp) {
    let nextIds = JSON.parse(bp.item_ids_json || '[]');

    if (item.field_name === 'grade' && normalized.answerKey) {
      const targetG = normalized.answerKey === '2' ? 12 : 10;
      if (targetG !== bp.grade) {
        const allItems = await v2Repository.getItemsForVersion(assessment.version_id, { respondent: 'student' });
        const rebuilt = buildStudentBlueprint(allItems, { assessmentId: assessment.id, grade: targetG });
        activeGrade = targetG;
        nextIds = rebuilt.itemIds;
        gradeChanged = true;
        await userRepository.updateStudentProfile(assessment.student_id, { grade: targetG });
      }
    } else if (item.field_name === 'learning_support' && normalized.answerKey) {
      const optText = (parseOpts(item).find((o) => String(o.k) === normalized.answerKey)?.text || '');
      activeAcc.extended_time_pct = /dyslexia|adhd|extra time|slow writer|yes/i.test(optText) && !/^none|no/i.test(optText) ? 25 : 0;
    } else if (item.field_name === 'english_comfort' && normalized.answerKey) {
      activeAcc.simpler_wording = Number(normalized.answerKey) <= 2;
    }

    await v2Repository.upsertBlueprint({
      assessmentId: assessment.id,
      grade: activeGrade,
      itemIds: nextIds,
      accommodations: activeAcc
    });
  }

  if (req.body.current_step !== undefined) {
    const step = Number(req.body.current_step);
    if (Number.isInteger(step) && step >= 1) {
      await assessmentRepository.updateAssessmentStep(assessment.id, step);
    }
  }

  return {
    success: true,
    blueprint_updated: gradeChanged,
    grade: activeGrade,
    accommodations: activeAcc
  };
}

async function completeV2(req, assessment) {
  if (assessment.status === 'completed') throw conflict('Assessment is already completed.');

  const bp = await v2Repository.getBlueprint(assessment.id);
  if (!bp) throw conflict('Assessment blueprint not found.');
  const expectedIds = JSON.parse(bp.item_ids_json || '[]');
  const responses = await v2Repository.listV2ResponsesJoined(assessment.id, 'student');
  const answeredSet = new Set(responses.map((r) => r.item_id));
  const missingCount = expectedIds.filter((id) => !answeredSet.has(id)).length;

  if (missingCount > 0) {
    throw badRequest(
      `Assessment is incomplete: ${responses.length}/${expectedIds.length} items answered.`,
      'ASSESSMENT_INCOMPLETE'
    );
  }

  const gradeNorms = await v2Repository.getGradeNorms(bp.grade);
  const result = scoreV2Assessment({
    responsesJoined: responses,
    studentGrade: bp.grade,
    gradeNorms
  });

  await transaction(async () => {
    await v2Repository.upsertV2ScoringResult({ assessmentId: assessment.id, result });
    await assessmentRepository.completeAssessmentRow(assessment.id);
    await userRepository.markStudentProfileCompleted(assessment.student_id);
    // Record per-grade cohort observations ONLY when validity checks did not flag low effort
    if (!result.validity.is_provisional_due_to_validity) {
      for (const dim of ['V', 'N', 'L', 'S', 'P', 'CRE', 'EQ']) {
        await v2Repository.recordGradeNormObservation(result.grade, `apt_${dim}`, result.aptitude[dim]);
      }
      for (const t of ['O', 'C', 'E', 'A', 'N']) {
        await v2Repository.recordGradeNormObservation(result.grade, `pers_${t}`, result.personality[t]);
      }
    }
  });

  // Build baseline counsellor map right away (parent M8 can enrich later when submitted)
  const mapObj = await rebuildCounsellorMap(assessment.id);
  await logAudit(req, 'COMPLETE_V2_ASSESSMENT', 'ASSESSMENT', assessment.id, {
    grade: result.grade,
    top_cluster: result.top5?.[0]
  });

  return {
    assessment_id: assessment.id,
    result,
    counsellor_map_ready: Boolean(mapObj)
  };
}

// =========================================================================
// PARENT MODULE 8 LIFECYCLE (MULTI-PARENT SAFE)
// =========================================================================
async function getOrStartParentM8Questions(req, parent, assessment) {
  let session = await v2Repository.getParentSession(assessment.id, parent.id);
  if (!session) {
    const existingAll = await v2Repository.listParentSessionsForAssessment(assessment.id);
    const slot = existingAll.some((s) => s.parent_slot === 'parent_1') ? 'parent_2' : 'parent_1';
    const parentItems = await v2Repository.getItemsForVersion(assessment.version_id, { respondent: 'parent' });
    const built = buildParentBlueprint(parentItems, { assessmentId: assessment.id, parentId: parent.id });
    await v2Repository.upsertParentSession({
      assessmentId: assessment.id,
      parentId: parent.id,
      parentSlot: slot,
      itemIds: built.itemIds
    });
    session = await v2Repository.getParentSession(assessment.id, parent.id);
  }

  const itemIds = JSON.parse(session.item_ids_json || '[]');
  const rawItems = await v2Repository.getItemsByIds(itemIds);
  const sanitized = rawItems.map(sanitizeV2ItemForClient);
  const saved = await v2Repository.listV2ResponsesJoined(assessment.id, 'parent', parent.id);
  const responseMap = {};
  for (const r of saved) {
    responseMap[r.item_id] = {
      answer_key: r.answer_key,
      numeric_value: r.numeric_value,
      response_json: r.response_json ? JSON.parse(r.response_json) : null,
      response_text: r.response_text
    };
  }

  return {
    assessment_id: assessment.id,
    parent_slot: session.parent_slot,
    status: session.status,
    total_questions: sanitized.length,
    answered: Object.keys(responseMap).length,
    questions: sanitized,
    responses: responseMap
  };
}

async function saveParentM8Response(req, parent, assessment) {
  const session = await v2Repository.getParentSession(assessment.id, parent.id);
  if (!session) throw notFound('Parent assessment session not started.');
  const itemId = Number(req.body.item_id ?? req.body.question_id);
  const item = await v2Repository.getItemById(itemId);
  if (!item || item.version_id !== assessment.version_id || !item.is_active || item.respondent !== 'parent') {
    throw badRequest('Item does not belong to Parent Module 8.');
  }
  const pinned = new Set(JSON.parse(session.item_ids_json || '[]'));
  if (!pinned.has(item.id)) throw badRequest('Item is not in this parent’s pinned session.');

  const normalized = validateAndNormalizePayload(item, req.body);
  await v2Repository.upsertV2Response({
    assessmentId: assessment.id,
    itemId: item.id,
    respondentType: 'parent',
    parentId: parent.id,
    ...normalized,
    responseTimeMs: Number(req.body.response_time_ms) || 0
  });
  return { success: true };
}

async function completeParentM8(req, parent, assessment) {
  const session = await v2Repository.getParentSession(assessment.id, parent.id);
  if (!session) throw notFound('Parent assessment session not started.');
  const expectedIds = JSON.parse(session.item_ids_json || '[]');
  const saved = await v2Repository.listV2ResponsesJoined(assessment.id, 'parent', parent.id);

  // Require >= 70% completion threshold per PROMPT_Counsellor_Mapping_Agent §3 Step 1
  if (saved.length < Math.ceil(expectedIds.length * 0.7)) {
    throw badRequest(`Please answer at least ${Math.ceil(expectedIds.length * 0.7)} of ${expectedIds.length} items before finishing (${saved.length} answered).`);
  }

  const summary = summarizeParentM8(saved);
  await v2Repository.upsertParentSession({
    assessmentId: assessment.id,
    parentId: parent.id,
    parentSlot: session.parent_slot,
    itemIds: expectedIds,
    status: 'completed',
    summary
  });

  const mapObj = await rebuildCounsellorMap(assessment.id);
  await logAudit(req, 'COMPLETE_M8_PARENT', 'ASSESSMENT', assessment.id, { parent_slot: session.parent_slot });

  return {
    assessment_id: assessment.id,
    parent_slot: session.parent_slot,
    status: 'completed',
    counsellor_map_updated: Boolean(mapObj)
  };
}

// =========================================================================
// COUNSELLOR MAP BUILDER & ADMIN FAIRNESS AUDIT
// =========================================================================
async function rebuildCounsellorMap(assessmentId) {
  const assessment = await assessmentRepository.getAssessmentById(assessmentId);
  if (!assessment || assessment.status !== 'completed') return null;

  const studentResult = await v2Repository.getV2ScoringResult(assessmentId);
  if (!studentResult) return null;

  const sessions = await v2Repository.listParentSessionsForAssessment(assessmentId);
  const completedParents = sessions
    .filter((s) => s.status === 'completed' && s.summary_json)
    .map((s) => ({
      parent_slot: s.parent_slot,
      summary: JSON.parse(s.summary_json)
    }));

  const anySensitiveConsent = sessions.some((s) => Boolean(s.student_consent_sensitive));
  const student = await userRepository.findStudentById(assessment.student_id);

  const mapObj = buildCounsellorMap({
    studentId: student?.student_code || assessment.student_id,
    studentResult,
    parentSummaries: completedParents,
    consent: {
      student_consent_parent_view: anySensitiveConsent,
      counsellor_view_both_parents: true
    },
    earningLadder: null
  });

  await v2Repository.upsertCounsellorMap({
    assessmentId,
    mapObj,
    model: 'deterministic-v2',
    status: 'ready'
  });

  return mapObj;
}

/** Generate privacy-safe parent view (blocks other parent's raw answers & sensitive items without consent). */
async function getParentSafeV2Summary(assessment, parent) {
  const studentResult = await v2Repository.getV2ScoringResult(assessment.id);
  if (!studentResult) return { available: false, reason: 'Assessment has not been scored with V2 yet.' };

  const mySession = await v2Repository.getParentSession(assessment.id, parent.id);
  const mapRecord = await v2Repository.getCounsellorMap(assessment.id);
  const consentSensitive = Boolean(mySession?.student_consent_sensitive);

  // Strip counselor-private items & other parent's raw summary
  const safeInsights = (mapRecord?.map?.insights || [])
    .filter((i) => !i.pattern.startsWith('P11') || consentSensitive)
    .filter((i) => !i.pattern.startsWith('P10')) // never expose inter-parent disagreement inside parent portal
    .map((i) => ({
      id: i.id,
      title: i.title,
      severity: i.severity,
      meaning: i.meaning,
      talking_points: i.talking_points
    }));

  return {
    available: true,
    grade: studentResult.grade,
    norm_status: studentResult.norm_status,
    riasec_code: studentResult.riasec_code,
    top_clusters: (studentResult.clusters || []).slice(0, 5).map((c) => ({
      id: c.id,
      name: c.name,
      final: c.final,
      interest: c.interest,
      aptitude: c.aptitude,
      stream10: c.stream10
    })),
    streams_10: studentResult.streams_10,
    courses_12: studentResult.courses_12,
    my_m8_status: mySession?.status || 'not_started',
    my_m8_pref: mySession?.summary_json ? JSON.parse(mySession.summary_json).parent_pref : null,
    shared_talking_points: safeInsights
  };
}

/** Spec §6.6 Post-release Fairness Audit by Gender (flags > 0.3 SD disparity). */
async function runV2FairnessAudit() {
  const rows = await db.prepare('SELECT assessment_id, grade, canonical_json FROM v2_scoring_results').all();
  const byGender = {};
  const allFinals = Object.fromEntries(Array.from({ length: 16 }, (_, i) => [`C${String(i + 1).padStart(2, '0')}`, []]));

  for (const r of rows) {
    const c = JSON.parse(r.canonical_json);
    const gender = c.m1_context?.gender || 'Unspecified';
    byGender[gender] ||= { count: 0, clusters: {} };
    byGender[gender].count += 1;
    for (const cl of c.clusters || []) {
      (allFinals[cl.id] ||= []).push(cl.final);
      (byGender[gender].clusters[cl.id] ||= []).push(cl.final);
    }
  }

  const flaggedClusters = [];
  const genders = Object.keys(byGender).filter((g) => byGender[g].count > 0);
  if (genders.length >= 2) {
    for (const cid of Object.keys(allFinals)) {
      const vals = allFinals[cid];
      if (vals.length < 4) continue;
      const globalMean = vals.reduce((a, b) => a + b, 0) / vals.length;
      const globalSd = Math.sqrt(vals.reduce((s, x) => s + (x - globalMean) ** 2, 0) / vals.length);
      if (globalSd < 1e-6) continue;
      const meansByG = genders.map((g) => {
        const gv = byGender[g].clusters[cid] || [];
        return { gender: g, n: gv.length, mean: gv.length ? gv.reduce((a, b) => a + b, 0) / gv.length : null };
      }).filter((x) => x.mean !== null);
      if (meansByG.length >= 2) {
        const maxM = Math.max(...meansByG.map((x) => x.mean));
        const minM = Math.min(...meansByG.map((x) => x.mean));
        const gapSd = (maxM - minM) / globalSd;
        if (gapSd > 0.3) {
          flaggedClusters.push({ cluster_id: cid, gap_sd: Number(gapSd.toFixed(2)), breakdown: meansByG });
        }
      }
    }
  }

  const norm10 = await v2Repository.getGradeNorms(10);
  const norm12 = await v2Repository.getGradeNorms(12);

  return {
    total_v2_completed: rows.length,
    grade_norms: {
      grade_10: { completed_n: norm10.cohortCount, norm_status: norm10.cohortCount >= 500 ? 'final' : 'provisional', threshold: 500 },
      grade_12: { completed_n: norm12.cohortCount, norm_status: norm12.cohortCount >= 500 ? 'final' : 'provisional', threshold: 500 }
    },
    gender_counts: Object.fromEntries(Object.entries(byGender).map(([k, v]) => [k, v.count])),
    fairness_disparity_flags: flaggedClusters
  };
}

async function getV2Result(assessment) {
  const result = await v2Repository.getV2ScoringResult(assessment.id);
  if (!result) return null;
  const sessions = await v2Repository.listParentSessionsForAssessment(assessment.id);
  return {
    assessment_id: assessment.id,
    completed_at: assessment.completed_at,
    version_code: 'V2',
    parent_consent_sensitive: sessions.some((s) => Boolean(s.student_consent_sensitive)),
    result
  };
}

async function getLatestV2ResultForStudent(studentId) {
  const row = await db.prepare(`
    SELECT a.* FROM assessments a
    JOIN assessment_versions av ON a.version_id = av.id
    WHERE a.student_id = ? AND av.version_code = 'V2' AND a.status = 'completed'
    ORDER BY a.id DESC LIMIT 1
  `).get(studentId);
  if (!row) return null;
  return await getV2Result(row);
}

async function updateParentConsentSensitive(req, assessment, allowed) {
  const flag = Boolean(allowed);
  await v2Repository.setParentSensitiveConsent(assessment.id, flag);
  if (assessment.status === 'completed') {
    await rebuildCounsellorMap(assessment.id);
  }
  await logAudit(req, 'UPDATE_V2_PARENT_CONSENT', 'ASSESSMENT', assessment.id, { parent_consent_sensitive: flag });
  return { assessment_id: assessment.id, parent_consent_sensitive: flag };
}

module.exports = {
  startOrResumeV2,
  getV2Questions,
  saveV2Response,
  completeV2,
  getV2Result,
  getLatestV2ResultForStudent,
  updateParentConsentSensitive,
  getOrStartParentM8Questions,
  saveParentM8Response,
  completeParentM8,
  rebuildCounsellorMap,
  getParentSafeV2Summary,
  runV2FairnessAudit
};
