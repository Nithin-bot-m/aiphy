// Report controller — access-controlled report retrieval & regeneration.
const assessmentService = require('../services/assessmentService');
const { generateReport } = require('../services/reports/reportService');
const { asyncHandler, notFound, forbidden } = require('../utils/helpers');
const { logAudit } = require('../middleware/auditLogger');
const { db } = require('../config/db');

exports.getReport = asyncHandler(async (req, res) => {
  const { assessment, } = req;
  const reportType = req.params.type || 'candidate';
  const report = await db.prepare(
    'SELECT id, assessment_id, report_type, title, structured_data_json, structured_input_hash, narrative_html, status, prompt_version_id, model, generated_at FROM reports WHERE assessment_id = ? AND report_type = ?'
  ).get(assessment.id, reportType);

  if (!report) throw notFound('Report not generated yet for this assessment.');
  await logAudit(req, 'REPORT_VIEWED', 'REPORT', report.id, { type: reportType });

  let structured = {};
  try { structured = JSON.parse(report.structured_data_json || '{}'); } catch { /* keep {} */ }

  res.json({
    report: {
      id: report.id,
      assessment_id: report.assessment_id,
      report_type: report.report_type,
      title: report.title,
      status: report.status,
      model: report.model,
      generated_at: report.generated_at,
      structured_input_hash: report.structured_input_hash,
      structured_data: structured,
      narrative_html: report.narrative_html
    }
  });
});

exports.regenerateReport = asyncHandler(async (req, res) => {
  const { assessment } = req;
  const reportType = req.params.type || 'candidate';

  if (req.user.role === 'candidate' && reportType !== 'candidate') {
    throw forbidden('Candidates can only regenerate their own report.');
  }
  if (req.user.role === 'parent' && !['candidate', 'parent'].includes(reportType)) {
    throw forbidden('Counselor reports are restricted to administrators.');
  }

  const canonical = await assessmentService.assembleResult(assessment);
  if (!canonical) throw notFound('Completed assessment scores are required before generating reports.');

  const result = await generateReport({
    assessmentId: assessment.id, reportType, canonicalResult: canonical, userId: req.user.id
  });
  await logAudit(req, 'REPORT_REGENERATED', 'REPORT', result.reportId, { type: reportType, model: result.model, status: result.status });

  res.json({ report_id: result.reportId, model: result.model, generation_status: result.status });
});

exports.listReportVersions = asyncHandler(async (req, res) => {
  const rows = await db.prepare(`
    SELECT rv.id, rv.report_id, rv.version_number, rv.model, rv.structured_input_hash, rv.created_at, r.report_type, r.assessment_id
    FROM report_versions rv JOIN reports r ON rv.report_id = r.id
    WHERE r.assessment_id = ? ORDER BY rv.report_id, rv.version_number
  `).all(Number(req.params.assessmentId));
  res.json({ versions: rows });
});
