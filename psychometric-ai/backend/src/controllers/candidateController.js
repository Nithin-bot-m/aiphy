// Candidate controller — profile, assessment lifecycle, results.
const { db } = require('../config/db');
const userRepository = require('../repositories/userRepository');
const assessmentRepository = require('../repositories/assessmentRepository');
const assessmentService = require('../services/assessmentService');
const parentService = require('../services/parentService');
const { exportUserData } = require('../../scripts/retention');
const { asyncHandler, notFound, badRequest, assertSafePlainText } = require('../utils/helpers');
const { BOARDS } = require('../config/constants');
const { logAudit } = require('../middleware/auditLogger');

async function requireStudent(req) {
  const student = await userRepository.findStudentByUserId(req.user.id);
  if (!student) throw notFound('Student profile not found.');
  return student;
}

exports.getProfile = asyncHandler(async (req, res) => {
  const student = await requireStudent(req);
  const mappings = await userRepository.listMappingsForStudent(student.id);
  res.json({
    student: {
      ...student,
      email: req.user.email || null,
      phone: req.user.phone || null,
    },
    parent_links: mappings,
  });
});

exports.updateProfile = asyncHandler(async (req, res) => {
  const student = await requireStudent(req);
  const { full_name, dob, grade, school_name, board } = req.body;
  if (board && !BOARDS.includes(board)) throw badRequest('Invalid board value.');
  if (grade !== undefined && (!Number.isInteger(grade) || grade < 8 || grade > 12)) throw badRequest('Grade must be an integer 8-12.');
  if (dob && !/^\d{4}-\d{2}-\d{2}$/.test(String(dob))) throw badRequest('dob must be YYYY-MM-DD.');

  const safeName = full_name !== undefined ? assertSafePlainText(full_name, 'Full name', { required: true, maxLength: 120 }) : undefined;
  if (safeName !== undefined && safeName.length < 2) throw badRequest('Full name must be at least 2 characters.');
  const safeSchool = school_name !== undefined ? assertSafePlainText(school_name, 'School name', { maxLength: 150 }) : undefined;

  await userRepository.updateStudentProfile(student.id, { full_name: safeName, dob, grade, school_name: safeSchool, board });
  await userRepository.markStudentProfileCompleted(student.id);
  await logAudit(req, 'UPDATE_PROFILE', 'STUDENT', student.id);
  res.json({ student: await userRepository.findStudentById(student.id) });
});

exports.exportMyData = asyncHandler(async (req, res) => {
  await requireStudent(req);
  const data = await exportUserData(req.user.id);
  await logAudit(req, 'CANDIDATE_EXPORT', 'USER', req.user.id);
  res.json(data);
});

exports.getMyStudentCode = asyncHandler(async (req, res) => {
  const student = await requireStudent(req);
  res.json({ student_code: student.student_code, parent_links: await userRepository.listMappingsForStudent(student.id) });
});

// ---------- Assessment ----------
exports.startOrResumeAssessment = asyncHandler(async (req, res) => {
  const { assessment, version } = await assessmentService.startOrResume(req);
  res.json({ assessment, version: { id: version.id, version_code: version.version_code, name: version.name } });
});

exports.getAssessmentQuestions = asyncHandler(async (req, res) => {
  res.json(await assessmentService.getQuestions(req, req.assessment));
});

exports.saveResponse = asyncHandler(async (req, res) => {
  res.json(await assessmentService.saveResponse(req, req.assessment));
});

exports.completeAssessment = asyncHandler(async (req, res) => {
  res.json(await assessmentService.complete(req, req.assessment));
});

exports.getProgress = asyncHandler(async (req, res) => {
  const assessment = req.assessment;
  const answered = await assessmentRepository.countAnsweredQuestions(assessment.id, assessment.version_id, 'student');
  const total = await assessmentRepository.countActiveQuestions(assessment.version_id, assessmentService.STUDENT_MODULES || ['aptitude', 'riasec', 'grit']);
  res.json({
    assessment_id: assessment.id,
    status: assessment.status,
    answered,
    total,
    percent: total > 0 ? Math.round((answered / total) * 100) : 0
  });
});

// ---------- Results ----------
exports.listAssessments = asyncHandler(async (req, res) => {
  const student = await requireStudent(req);
  const rows = await db.prepare(`
    SELECT a.id, a.status, a.current_step, a.started_at, a.completed_at, av.version_code
    FROM assessments a
    JOIN assessment_versions av ON a.version_id = av.id
    WHERE a.student_id = ?
    ORDER BY a.id DESC LIMIT 20
  `).all(student.id);
  res.json({ assessments: rows });
});

exports.getResults = asyncHandler(async (req, res) => {
  const student = await requireStudent(req);
  const assessment = await assessmentRepository.getLatestCompletedAssessment(student.id);
  if (!assessment) throw notFound('No completed assessment found.');
  const canonical = await assessmentService.assembleResult(assessment);
  if (!canonical) throw notFound('Results are not available for this assessment.');
  res.json({ assessment_id: assessment.id, result: canonical });
});

exports.getResultsById = asyncHandler(async (req, res) => {
  const assessment = req.assessment;
  if (assessment.status !== 'completed') throw notFound('This assessment has not been completed yet.');
  const canonical = await assessmentService.assembleResult(assessment);
  if (!canonical) throw notFound('Results are not available for this assessment.');
  res.json({ assessment_id: assessment.id, result: canonical });
});

exports.getStreamAnalysis = asyncHandler(async (req, res) => {
  const student = await requireStudent(req);
  const assessment = await assessmentRepository.getLatestCompletedAssessment(student.id);
  if (!assessment) throw notFound('No completed assessment found.');
  const rows = await assessmentRepository.getStreamScores(assessment.id);
  res.json({
    assessment_id: assessment.id,
    streams: rows.map(r => {
      const rationale = JSON.parse(r.rationale_json || '{}');
      return {
        id: r.stream_id, name: r.stream_name, score: r.fit_score, band: r.fit_band, rank: r.rank_order,
        contributions: rationale.contributions || [], weights_used: rationale.weights_used || {}
      };
    })
  });
});

exports.getCongruence = asyncHandler(async (req, res) => {
  const student = await requireStudent(req);
  const assessment = await assessmentRepository.getLatestCompletedAssessment(student.id);
  if (!assessment) throw notFound('No completed assessment found.');
  const congruence = await assessmentRepository.getCongruenceScore(assessment.id);
  if (!congruence) {
    return res.json({ assessment_id: assessment.id, has_parent_data: false, message: 'No parent inventory submitted for this assessment.' });
  }
  const parsed = JSON.parse(congruence.friction_factors_json || '{}');
  res.json({
    assessment_id: assessment.id,
    has_parent_data: true,
    score: congruence.congruence_pct,
    band: congruence.alignment_status,
    stream_match_score: congruence.stream_match_score,
    perception_gap_score: congruence.perception_gap_score,
    friction_factors: parsed.friction_factors || [],
    discussion_areas: parsed.discussion_areas || []
  });
});

// ---------- Parent link approval (student side) ----------
exports.listParentRequests = asyncHandler(async (req, res) => {
  const student = await requireStudent(req);
  res.json({ pending: await userRepository.listPendingRequestsForStudent(student.id) });
});

exports.approveParentRequest = asyncHandler(async (req, res) => {
  res.json(await parentService.approveLink(req));
});

exports.revokeParentRequest = asyncHandler(async (req, res) => {
  res.json(await parentService.revokeLink(req));
});
