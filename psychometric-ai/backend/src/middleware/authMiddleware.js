// Authentication & authorization middleware.
//
// AUTH FLOW: Bearer JWT → DB user re-check (revocation via is_active).
// OWNERSHIP (fixes audited CRITICAL F1/F4/F5): every protected endpoint goes
// through an ownership/relationship check HERE — role checks alone are never
// treated as sufficient for student data.

const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { unauthorized, forbidden, notFound } = require('../utils/helpers');
const userRepository = require('../repositories/userRepository');
const assessmentRepository = require('../repositories/assessmentRepository');

async function authenticate(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(unauthorized('Access token required.'));

  let payload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET);
  } catch {
    return next(unauthorized('Invalid or expired token.'));
  }

  const user = await userRepository.findUserById(payload.id);
  if (!user || !user.is_active) return next(unauthorized('Account is inactive or no longer exists.'));

  req.user = { id: user.id, email: user.email, phone: user.phone, role: user.role };
  return next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) {
      return next(forbidden('You do not have permission to perform this action.'));
    }
    next();
  };
}

/** Resolve an assessment id from params/body/query regardless of route shape. */
function resolveAssessmentId(req, paramName) {
  const candidates = [
    req.params?.[paramName],
    req.params?.assessmentId,
    req.body?.assessment_id,
    req.body?.assessmentId,
    req.query?.assessment_id,
    req.query?.assessmentId
  ];
  for (const c of candidates) {
    const n = Number(c);
    if (Number.isInteger(n) && n > 0) return n;
  }
  return null;
}

/** Attaches req.student (owner of the assessment) with ownership verification. */
function requireAssessmentOwnership(paramName = 'assessmentId') {
  return async (req, res, next) => {
    const assessmentId = resolveAssessmentId(req, paramName);
    if (!assessmentId) {
      return next(notFound('Assessment not found.'));
    }
    const assessment = await assessmentRepository.getAssessmentById(assessmentId);
    if (!assessment) return next(notFound('Assessment not found.'));

    if (req.user.role === 'candidate') {
      const student = await userRepository.findStudentByUserId(req.user.id);
      if (!student || student.id !== assessment.student_id) {
        return next(forbidden('This assessment belongs to another candidate.'));
      }
      req.student = student;
    } else if (req.user.role === 'parent') {
      const parent = await userRepository.findParentByUserId(req.user.id);
      if (!parent || !(await userRepository.isParentLinked(parent.id, assessment.student_id))) {
        return next(forbidden('You are not authorized to access this student\'s assessment.'));
      }
      req.parent = parent;
    } else if (req.user.role !== 'admin') {
      return next(forbidden());
    }

    req.assessment = assessment;
    next();
  };
}

/** Parent-only: verify a server-side LINKED (consented) relationship to the assessment's student. */
function requireLinkedParentForAssessment(paramName = 'assessmentId') {
  return async (req, res, next) => {
    const assessmentId = resolveAssessmentId(req, paramName);
    if (!assessmentId) {
      return next(notFound('Assessment not found.'));
    }
    const assessment = await assessmentRepository.getAssessmentById(assessmentId);
    if (!assessment) return next(notFound('Assessment not found.'));

    const parent = await userRepository.findParentByUserId(req.user.id);
    if (!parent) return next(forbidden('Parent profile not found.'));
    if (!(await userRepository.isParentLinked(parent.id, assessment.student_id))) {
      return next(forbidden('You are not linked (or not yet approved) for this student.'));
    }
    req.parent = parent;
    req.assessment = assessment;
    next();
  };
}

/** Report access: candidate sees own reports; linked parent sees candidate+parent reports; admin sees all. */
function requireReportAccess(paramName = 'assessmentId') {
  return async (req, res, next) => {
    const assessmentId = Number(req.params[paramName]);
    const assessment = await assessmentRepository.getAssessmentById(assessmentId);
    if (!assessment) return next(notFound('Assessment not found.'));

    const reportType = req.params.type || 'candidate';
    if (req.user.role === 'candidate') {
      const student = await userRepository.findStudentByUserId(req.user.id);
      if (!student || student.id !== assessment.student_id) return next(forbidden());
      if (reportType !== 'candidate') return next(forbidden('Candidates can only access their own report.'));
    } else if (req.user.role === 'parent') {
      const parent = await userRepository.findParentByUserId(req.user.id);
      if (!parent || !(await userRepository.isParentLinked(parent.id, assessment.student_id))) return next(forbidden());
      if (!['candidate', 'parent'].includes(reportType)) {
        return next(forbidden('Counselor reports are restricted to administrators.'));
      }
    } else if (req.user.role !== 'admin') {
      return next(forbidden());
    }

    req.assessment = assessment;
    next();
  };
}

module.exports = { authenticate, requireRole, requireAssessmentOwnership, requireLinkedParentForAssessment, requireReportAccess };
