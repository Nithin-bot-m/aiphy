// reportService — end-to-end report generation pipeline (spec §18-20).
//
//   canonical result JSON ──► prompt (versioned, DB) ──► LLM provider
//        │                                                     │
//        │                                     validate + sanitize HTML
//        ▼                                                     ▼
//   sha256(structured_input_hash) ──────────────► reports + report_versions
//
// Reports are reproducible: the hash of the canonical input, prompt version id
// and model are stored; every generation appends a report_versions row.

const { db } = require('../../config/db');
const { sha256Hex } = require('../../utils/helpers');
const { sanitizeNarrativeHtml } = require('../../utils/htmlSanitizer');
const { getActivePrompt, buildUserPrompt } = require('../llm/promptService');
const { generateNarrative } = require('../llm/llmService');

const REPORT_TYPES = ['candidate', 'parent', 'counselor'];

function validateNarrative(text) {
  if (typeof text !== 'string' || text.trim().length < 40) {
    return { ok: false, reason: 'Narrative missing or too short' };
  }
  const openTags = (text.match(/<h3/gi) || []).length;
  if (openTags < 1) {
    return { ok: false, reason: 'Narrative lacks expected section structure' };
  }
  return { ok: true };
}

async function upsertReport({ assessmentId, reportType, title, structuredData, hash, narrativeHtml, promptVersionId, model, status }) {
  const existing = await db.prepare('SELECT id FROM reports WHERE assessment_id = ? AND report_type = ?')
    .get(assessmentId, reportType);

  let reportId;
  if (existing) {
    await db.prepare(`
      UPDATE reports
      SET title = ?, structured_data_json = ?, structured_input_hash = ?, narrative_html = ?,
          status = ?, prompt_version_id = ?, model = ?, generated_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
    `).run(title, JSON.stringify(structuredData), hash, narrativeHtml, status, promptVersionId, model, existing.id);
    reportId = existing.id;
  } else {
    const info = await db.prepare(`
      INSERT INTO reports (assessment_id, report_type, title, structured_data_json, structured_input_hash,
                           narrative_html, status, prompt_version_id, model)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(assessmentId, reportType, title, JSON.stringify(structuredData), hash, narrativeHtml, status, promptVersionId, model);
    reportId = Number(info.lastInsertRowid);
  }

  // Version history (fixes D11 — report_versions was dead schema).
  const versionRow = await db.prepare('SELECT COUNT(*) AS cnt FROM report_versions WHERE report_id = ?').get(reportId);
  const versionCount = Number(versionRow?.cnt || 0);
  await db.prepare(`
    INSERT INTO report_versions (report_id, version_number, narrative_json, structured_input_hash, prompt_version_id, model, generated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(reportId, versionCount + 1, JSON.stringify({ narrative_html: narrativeHtml }), hash, promptVersionId, model, 'system');

  return reportId;
}

/**
 * Generate (or regenerate) a single report type for an assessment.
 * @param {Object} params
 * @param {number} params.assessmentId
 * @param {'candidate'|'parent'|'counselor'} params.reportType
 * @param {Object} params.canonicalResult   output of resultService.buildCanonicalResult
 * @param {number} params.userId            acting user (for LLM audit rows)
 * @returns {{ reportId, model, provider, status, inputHash }}
 */
async function generateReport({ assessmentId, reportType, canonicalResult, userId }) {
  if (!REPORT_TYPES.includes(reportType)) {
    throw new Error(`Unknown report type: ${reportType}`);
  }

  const promptRow = await getActivePrompt(`${reportType}_report`);
  const userPrompt = await buildUserPrompt(promptRow, canonicalResult);
  const inputHash = sha256Hex(JSON.stringify(canonicalResult));

  const generation = await generateNarrative({
    reportType,
    promptRow,
    userPrompt,
    structuredResult: canonicalResult,
    assessmentId,
    userId
  });

  const validation = validateNarrative(generation.text);
  const titles = {
    candidate: 'Grade 10 Stream & Career Guidance Report',
    parent: 'Parent Guidance & Alignment Report',
    counselor: 'Counselor Assessment Briefing'
  };

  if (!validation.ok) {
    // Do not persist a broken narrative; record failure state.
    await upsertReport({
      assessmentId, reportType,
      title: titles[reportType],
      structuredData: canonicalResult,
      hash: inputHash,
      narrativeHtml: '<p>Report generation failed. Please regenerate. No partial or fabricated content was stored.</p>',
      promptVersionId: promptRow.id,
      model: generation.model,
      status: 'failed'
    });
    throw new Error(`Report narrative failed validation: ${validation.reason}`);
  }

  const safeHtml = sanitizeNarrativeHtml(generation.text);
  const reportId = await upsertReport({
    assessmentId, reportType,
    title: titles[reportType],
    structuredData: canonicalResult,
    hash: inputHash,
    narrativeHtml: safeHtml,
    promptVersionId: promptRow.id,
    model: generation.model,
    status: 'ready'
  });

  return { reportId, model: generation.model, provider: generation.provider, status: generation.status, inputHash };
}

module.exports = { generateReport, validateNarrative, REPORT_TYPES };
