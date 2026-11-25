// Route table — explicit, versioned REST surface (spec §24).
const express = require('express');
const authController = require('../controllers/authController');
const candidateController = require('../controllers/candidateController');
const parentController = require('../controllers/parentController');
const adminController = require('../controllers/adminController');
const reportController = require('../controllers/reportController');
const v2Controller = require('../controllers/v2Controller');
const { authenticate, requireRole, requireAssessmentOwnership, requireLinkedParentForAssessment, requireReportAccess } = require('../middleware/authMiddleware');
const { authLimiter, loginIpLimiter, otpLimiter, linkLimiter } = require('../middleware/rateLimiters');

const router = express.Router();

// ---------- Health (minimal public probe per F-12; full diagnostics at GET /api/admin/health) ----------
router.get('/health', async (req, res) => {
  let dbOk = false;
  try {
    const { db } = require('../config/db');
    await db.prepare('SELECT 1 AS ping').get();
    dbOk = true;
  } catch {
    dbOk = false;
  }
  res.status(dbOk ? 200 : 503).json({
    status: dbOk ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString()
  });
});

// ---------- Auth ----------
router.get('/auth/capabilities', authController.getCapabilities);
router.post('/auth/register', authLimiter, authController.register);
router.post('/auth/login', loginIpLimiter, authController.login);
router.post('/auth/send-otp', otpLimiter, authController.sendOtp);
router.post('/auth/verify-otp', otpLimiter, authController.verifyOtp);
router.post('/auth/send-verification', authenticate, otpLimiter, authController.sendVerification);
router.post('/auth/verify-email', authLimiter, authController.verifyEmail);
router.post('/auth/forgot-password', otpLimiter, authController.forgotPassword);
router.post('/auth/reset-password', authLimiter, authController.resetPassword);
router.post('/auth/request-deletion', authenticate, authController.requestDeletion);
router.post('/auth/logout', authenticate, authController.logout);
router.get('/auth/me', authenticate, authController.getMe);

// ---------- Candidate ----------
router.get('/candidate/profile', authenticate, requireRole('candidate'), candidateController.getProfile);
router.put('/candidate/profile', authenticate, requireRole('candidate'), candidateController.updateProfile);
router.get('/candidate/export', authenticate, requireRole('candidate'), candidateController.exportMyData);
router.get('/candidate/code', authenticate, requireRole('candidate'), candidateController.getMyStudentCode);

router.get('/assessments', authenticate, requireRole('candidate'), candidateController.listAssessments);
router.post('/assessments/:id/start', authenticate, requireRole('candidate'), requireAssessmentOwnership('id'), candidateController.startOrResumeAssessment);
router.get('/assessments/:id', authenticate, requireRole('candidate', 'admin'), requireAssessmentOwnership('id'), candidateController.getAssessmentQuestions);
router.post('/assessments/:id/responses', authenticate, requireRole('candidate'), requireAssessmentOwnership('id'), candidateController.saveResponse);
router.post('/assessments/:id/complete', authenticate, requireRole('candidate'), requireAssessmentOwnership('id'), candidateController.completeAssessment);
router.get('/assessments/:id/progress', authenticate, requireRole('candidate', 'admin'), requireAssessmentOwnership('id'), candidateController.getProgress);

// Legacy-compatible aliases (kept so the existing frontend contract still works)
router.post('/candidate/assessment/start', authenticate, requireRole('candidate'), candidateController.startOrResumeAssessment);
router.get('/candidate/assessment/:assessmentId/questions', authenticate, requireRole('candidate', 'admin'), requireAssessmentOwnership('assessmentId'), candidateController.getAssessmentQuestions);
router.post('/candidate/assessment/save-response', authenticate, requireRole('candidate'), requireAssessmentOwnership('assessmentId'), candidateController.saveResponse);
router.post('/candidate/assessment/complete', authenticate, requireRole('candidate'), requireAssessmentOwnership('assessmentId'), candidateController.completeAssessment);

// ---------- Results ----------
router.get('/results/:assessmentId', authenticate, requireAssessmentOwnership('assessmentId'), candidateController.getResultsById);
router.get('/results/:assessmentId/streams', authenticate, requireAssessmentOwnership('assessmentId'), candidateController.getStreamAnalysis);
router.get('/results/:assessmentId/congruence', authenticate, requireAssessmentOwnership('assessmentId'), candidateController.getCongruence);

// Candidate convenience aliases
router.get('/candidate/results', authenticate, requireRole('candidate', 'admin'), candidateController.getResults);

// ---------- Reports ----------
router.get('/reports/:assessmentId/:type', authenticate, requireReportAccess('assessmentId'), reportController.getReport);
router.post('/reports/:assessmentId/regenerate', authenticate, requireReportAccess('assessmentId'), reportController.regenerateReport);
router.post('/reports/:assessmentId/regenerate/:type', authenticate, requireReportAccess('assessmentId'), reportController.regenerateReport);
router.get('/reports/:assessmentId', authenticate, requireReportAccess('assessmentId'), reportController.getReport);
router.get('/report-versions/:assessmentId', authenticate, requireRole('admin'), reportController.listReportVersions);

// ---------- Parent ----------
router.get('/parent/children', authenticate, requireRole('parent', 'admin'), parentController.getChildren);
router.post('/parent/link-request', linkLimiter, authenticate, requireRole('parent'), parentController.linkStudent);
router.post('/parent/link-student', linkLimiter, authenticate, requireRole('parent'), parentController.linkStudent); // alias
router.post('/parent/expectations', authenticate, requireRole('parent'), requireLinkedParentForAssessment('bodyAssessment'), parentController.submitInventory);
router.post('/parent/perceptions', authenticate, requireRole('parent'), requireLinkedParentForAssessment('bodyAssessment'), parentController.submitInventory);
router.post('/parent/inventory/submit', authenticate, requireRole('parent'), requireLinkedParentForAssessment('bodyAssessment'), parentController.submitInventory);
router.get('/parent/child', authenticate, requireRole('parent'), requireLinkedParentForAssessment('queryAssessment'), parentController.getChildDashboard);
router.get('/parent/congruence/:assessmentId', authenticate, requireLinkedParentForAssessment('assessmentId'), parentController.getChildDashboard);

// Student-side link approvals
router.get('/candidate/parent-requests', authenticate, requireRole('candidate'), candidateController.listParentRequests);
router.post('/candidate/parent-requests/:mappingId/approve', authenticate, requireRole('candidate'), candidateController.approveParentRequest);
router.post('/candidate/parent-requests/:mappingId/revoke', authenticate, requireRole('candidate'), candidateController.revokeParentRequest);

// ---------- Admin ----------
router.get('/admin/dashboard', authenticate, requireRole('admin'), adminController.getDashboard);
router.get('/admin/candidates', authenticate, requireRole('admin'), adminController.getCandidates);
router.get('/admin/questions', authenticate, requireRole('admin'), adminController.getQuestions);
router.post('/admin/questions', authenticate, requireRole('admin'), adminController.createQuestion);
router.put('/admin/questions/:id', authenticate, requireRole('admin'), adminController.updateQuestion);
router.delete('/admin/questions/:id', authenticate, requireRole('admin'), adminController.toggleQuestion);
router.get('/admin/scoring-rules', authenticate, requireRole('admin'), adminController.getStreamRules);
router.put('/admin/scoring-rules/:streamId', authenticate, requireRole('admin'), adminController.updateStreamRule);
router.get('/admin/scoring-config', authenticate, requireRole('admin'), adminController.getScoringConfig);
router.put('/admin/scoring-config', authenticate, requireRole('admin'), adminController.updateScoringConfig);
router.get('/admin/prompts', authenticate, requireRole('admin'), adminController.getPrompts);
router.get('/admin/prompts/:id', authenticate, requireRole('admin'), adminController.getPromptDetail);
router.put('/admin/prompts/:id', authenticate, requireRole('admin'), adminController.updatePrompt);
router.get('/admin/health', authenticate, requireRole('admin'), adminController.getSystemHealth);
router.get('/admin/audit-logs', authenticate, requireRole('admin'), adminController.getAuditLogs);
router.post('/admin/versions/:id/toggle', authenticate, requireRole('admin'), adminController.toggleVersion);
router.get('/admin/export/:type', authenticate, requireRole('admin'), adminController.exportData);
router.get('/admin/llm/usage', authenticate, requireRole('admin'), adminController.getLlmUsage);
router.post('/admin/retention/run', authenticate, requireRole('admin'), adminController.runRetention);
router.get('/admin/users/:id/export', authenticate, requireRole('admin'), adminController.exportUserData);
router.post('/admin/users/:id/erase', authenticate, requireRole('admin'), adminController.eraseUserData);
router.post('/admin/users/:id/reset-password', authenticate, requireRole('admin'), adminController.resetUserPassword);
router.post('/admin/users/:id/verify-email', authenticate, requireRole('admin'), adminController.verifyUserEmail);

// ---------- V2 Assessment, Parent Module 8 & Counsellor Mapping Console ----------
router.get('/v2/status', authenticate, v2Controller.getStatus);
router.post('/v2/assessments/start', authenticate, requireRole('candidate'), v2Controller.startAssessment);
router.get('/v2/assessments/:assessmentId', authenticate, requireAssessmentOwnership('assessmentId'), v2Controller.getQuestions);
router.post('/v2/assessments/:assessmentId/responses', authenticate, requireRole('candidate'), requireAssessmentOwnership('assessmentId'), v2Controller.saveResponse);
router.post('/v2/assessments/:assessmentId/complete', authenticate, requireRole('candidate'), requireAssessmentOwnership('assessmentId'), v2Controller.completeAssessment);
router.post('/v2/assessments/:assessmentId/parent-consent', authenticate, requireRole('candidate'), requireAssessmentOwnership('assessmentId'), v2Controller.setParentConsentSensitive);
router.get('/v2/results', authenticate, requireRole('candidate'), v2Controller.getMyLatestResult);
router.get('/v2/results/:assessmentId', authenticate, requireAssessmentOwnership('assessmentId'), v2Controller.getResultByAssessment);

router.get('/v2/parent/m8/:assessmentId', authenticate, requireRole('parent'), requireLinkedParentForAssessment('assessmentId'), v2Controller.getParentM8);
router.post('/v2/parent/m8/:assessmentId/responses', authenticate, requireRole('parent'), requireLinkedParentForAssessment('assessmentId'), v2Controller.saveParentM8Response);
router.post('/v2/parent/m8/:assessmentId/complete', authenticate, requireRole('parent'), requireLinkedParentForAssessment('assessmentId'), v2Controller.completeParentM8);
router.get('/v2/parent/summary/:assessmentId', authenticate, requireRole('parent'), requireLinkedParentForAssessment('assessmentId'), v2Controller.getParentSummary);

router.get('/v2/admin/counsellor-map/:assessmentId', authenticate, requireRole('admin'), v2Controller.getCounsellorMap);
router.post('/v2/admin/counsellor-map/:assessmentId/generate', authenticate, requireRole('admin'), v2Controller.generateCounsellorMap);
router.get('/v2/admin/fairness-audit', authenticate, requireRole('admin'), v2Controller.getFairnessAudit);

module.exports = router;
