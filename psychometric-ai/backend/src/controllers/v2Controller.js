// V2 API controller: student assessment, scoring results, Parent Module 8, and Counsellor Map.
const { asyncHandler, badRequest, forbidden, notFound } = require('../utils/helpers');
const assessmentRepository = require('../repositories/assessmentRepository');
const userRepository = require('../repositories/userRepository');
const v2Repository = require('../repositories/v2Repository');
const v2Service = require('../services/v2AssessmentService');
const { logAudit } = require('../middleware/auditLogger');

async function ensureV2Assessment(assessment) {
  const version = await assessmentRepository.getVersionByCode('V2');
  if (!version || assessment.version_id !== version.id) {
    throw badRequest('This endpoint requires a V2 assessment.');
  }
}

// ---------- Candidate Endpoints ----------
exports.getStatus = asyncHandler(async (req, res) => {
  const version = await assessmentRepository.getVersionByCode('V2');
  res.json({
    version_code: 'V2',
    v2_active: Boolean(version?.is_active)
  });
});

exports.startAssessment = asyncHandler(async (req, res) => {
  const data = await v2Service.startOrResumeV2(req);
  res.json({
    assessment_id: data.assessment.id,
    status: data.assessment.status,
    version_code: data.version.version_code,
    current_step: data.assessment.current_step,
    grade: data.blueprint.grade
  });
});

exports.getQuestions = asyncHandler(async (req, res) => {
  await ensureV2Assessment(req.assessment);
  const payload = await v2Service.getV2Questions(req, req.assessment);
  res.json(payload);
});

exports.saveResponse = asyncHandler(async (req, res) => {
  await ensureV2Assessment(req.assessment);
  const out = await v2Service.saveV2Response(req, req.assessment);
  res.json(out);
});

exports.completeAssessment = asyncHandler(async (req, res) => {
  await ensureV2Assessment(req.assessment);
  const out = await v2Service.completeV2(req, req.assessment);
  res.json(out);
});

exports.getResultByAssessment = asyncHandler(async (req, res) => {
  if (req.user.role === 'parent') {
    throw forbidden('Parents must use the parent summary endpoint.');
  }
  await ensureV2Assessment(req.assessment);
  const data = await v2Service.getV2Result(req.assessment);
  if (!data) throw notFound('V2 scoring results are not available for this assessment yet.');
  res.json(data);
});

exports.getMyLatestResult = asyncHandler(async (req, res) => {
  const student = await userRepository.findStudentByUserId(req.user.id);
  if (!student) throw notFound('Student profile not found.');
  const data = await v2Service.getLatestV2ResultForStudent(student.id);
  if (!data) {
    return res.json({ available: false, result: null });
  }
  res.json({ available: true, ...data });
});

exports.setParentConsentSensitive = asyncHandler(async (req, res) => {
  await ensureV2Assessment(req.assessment);
  const allowed = Boolean(req.body?.parent_consent_sensitive ?? req.body?.allowed);
  const out = await v2Service.updateParentConsentSensitive(req, req.assessment, allowed);
  res.json(out);
});

// ---------- Parent Module 8 Endpoints ----------
exports.getParentM8 = asyncHandler(async (req, res) => {
  await ensureV2Assessment(req.assessment);
  const data = await v2Service.getOrStartParentM8Questions(req, req.parent, req.assessment);
  res.json(data);
});

exports.saveParentM8Response = asyncHandler(async (req, res) => {
  await ensureV2Assessment(req.assessment);
  const out = await v2Service.saveParentM8Response(req, req.parent, req.assessment);
  res.json(out);
});

exports.completeParentM8 = asyncHandler(async (req, res) => {
  await ensureV2Assessment(req.assessment);
  const out = await v2Service.completeParentM8(req, req.parent, req.assessment);
  res.json(out);
});

exports.getParentSummary = asyncHandler(async (req, res) => {
  await ensureV2Assessment(req.assessment);
  const data = await v2Service.getParentSafeV2Summary(req.assessment, req.parent);
  res.json(data);
});

// ---------- Admin / Counsellor Console Endpoints ----------
exports.getCounsellorMap = asyncHandler(async (req, res) => {
  const assessmentId = Number(req.params.assessmentId);
  const assessment = await assessmentRepository.getAssessmentById(assessmentId);
  if (!assessment) throw notFound('Assessment not found.');
  await ensureV2Assessment(assessment);

  let record = await v2Repository.getCounsellorMap(assessmentId);
  if (!record && assessment.status === 'completed') {
    const generated = await v2Service.rebuildCounsellorMap(assessmentId);
    if (generated) record = await v2Repository.getCounsellorMap(assessmentId);
  }
  if (!record) {
    throw notFound('Counsellor map is not ready yet. Complete the V2 assessment first.');
  }

  const student = await userRepository.findStudentById(assessment.student_id);
  const studentResult = await v2Repository.getV2ScoringResult(assessmentId);
  const parentSessions = await v2Repository.listParentSessionsForAssessment(assessmentId);

  await logAudit(req, 'VIEW_COUNSELLOR_MAP', 'ASSESSMENT', assessmentId, {});
  res.json({
    assessment_id: assessmentId,
    student: student
      ? { id: student.id, full_name: student.full_name, grade: student.grade, school_name: student.school_name, board: student.board, student_code: student.student_code }
      : null,
    status: record.status,
    schema_version: record.schema_version,
    model: record.model,
    generated_at: record.generated_at,
    parent_sessions: parentSessions.map((ps) => ({
      parent_slot: ps.parent_slot,
      status: ps.status,
      completed_at: ps.completed_at,
      student_consent_sensitive: Boolean(ps.student_consent_sensitive)
    })),
    scoring: studentResult,
    map: record.map
  });
});

exports.generateCounsellorMap = asyncHandler(async (req, res) => {
  const assessmentId = Number(req.params.assessmentId);
  const assessment = await assessmentRepository.getAssessmentById(assessmentId);
  if (!assessment) throw notFound('Assessment not found.');
  await ensureV2Assessment(assessment);

  const mapObj = await v2Service.rebuildCounsellorMap(assessmentId);
  if (!mapObj) {
    throw badRequest('Cannot build counsellor map until student V2 assessment is completed.');
  }
  await logAudit(req, 'REGENERATE_COUNSELLOR_MAP', 'ASSESSMENT', assessmentId, {});
  res.json({ success: true, assessment_id: assessmentId, map: mapObj });
});

exports.getFairnessAudit = asyncHandler(async (req, res) => {
  const audit = await v2Service.runV2FairnessAudit();
  res.json(audit);
});

