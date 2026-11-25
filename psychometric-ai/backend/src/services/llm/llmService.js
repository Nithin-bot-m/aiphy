// llmService — orchestrates provider calls with hard boundaries.
//
// SECURITY INVARIANTS (spec §16, §17):
//   - Receives ONLY: system prompt (DB-versioned) + canonical structured JSON.
//   - Never sees DB credentials, SQL, admin endpoints, or internal identifiers.
//   - Output is validated & sanitized downstream (reportService); it can NEVER
//     write scores, rankings, or any DB row outside reports.narrative_html.
//   - Every request/response pair is persisted to llm_requests/llm_responses.
//   - Provider failures fall back to the deterministic template narrative and
//     are recorded with status 'fallback' — the caller always gets a usable,
//     honest report whose numbers come from the structured JSON only.

const env = require('../../config/env');
const { db } = require('../../config/db');
const { geminiComplete, openaiComplete } = require('./providers/httpProviders');
const llmQuota = require('./llmQuota');

/**
 * Persist request + response audit rows. Never throws — audit must not break
 * the response path, but failures are logged for ops.
 */
async function auditLlmCall({ assessmentId, userId, reportType, promptVersionId, provider, model, requestPayload, outcome }) {
  try {
    const reqInfo = await db.prepare(`
      INSERT INTO llm_requests (assessment_id, user_id, report_type, prompt_version_id, provider, model_name, request_payload_json, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      assessmentId ?? null, userId ?? null, reportType, promptVersionId ?? null,
      provider, model, JSON.stringify(requestPayload).slice(0, 100_000), outcome.status
    );
    const requestId = Number(reqInfo.lastInsertRowid);
    await db.prepare(`
      INSERT INTO llm_responses (request_id, raw_response, token_usage_json, latency_ms, status, error_message)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      requestId,
      outcome.text ? String(outcome.text).slice(0, 500_000) : null,
      outcome.tokenUsage ? JSON.stringify(outcome.tokenUsage) : null,
      outcome.latencyMs ?? 0,
      outcome.status,
      outcome.error ?? null
    );
  } catch (err) {
    console.error('[llmService] audit write failed:', err.message);
  }
}

function buildOfflineV2Narrative(reportType, result) {
  const { escapeHtml } = require('../../utils/htmlSanitizer');
  const esc = escapeHtml;
  const clusters = (result.clusters || []).slice(0, 5);
  const clusterList = clusters.length > 0
    ? clusters.map(c => `<li><strong>${esc(c.name)}</strong> (${esc(c.id)}) — fit ${esc(String(c.final))}%, interest ${esc(String(c.interest))}%, aptitude ${esc(String(c.aptitude))}%.</li>`).join('')
    : '<li>Cluster summary not available yet.</li>';

  if (reportType === 'parent') {
    return `
      <h3>Understanding This Profile</h3>
      <p>This educational guidance summary brings together your child's measured aptitude patterns, interests (RIASEC code <strong>${esc(result.riasec_code || 'N/A')}</strong>), and everyday learning style across 16 career clusters.</p>
      <h3>Top Career Clusters</h3>
      <ul>${clusterList}</ul>
      <h3>Supportive Next Steps</h3>
      <ul>
        <li>Ask what felt engaging across reasoning and problem-solving tasks.</li>
        <li>Discuss day-to-day school subjects and curiosity rather than job labels.</li>
      </ul>
      <p><em>Norms status: ${esc(result.norm_status || 'provisional')}. Educational guidance only.</em></p>`;
  }

  return `
    <h3>Career Cluster Profile</h3>
    <p>Holland Interest Code: <strong>${esc(result.riasec_code || 'N/A')}</strong> · Grade <strong>${esc(String(result.grade || 10))}</strong> · Norms: <strong>${esc(result.norm_status || 'provisional')}</strong>.</p>
    <h3>Top 5 Career Clusters</h3>
    <ul>${clusterList}</ul>
    <h3>Next Exploration Steps</h3>
    <ol>
      <li>Review your Passion Pick, Strength Pick, and Balanced Pick in Results.</li>
      <li>Inspect course options and entrance details carefully (verify rules for the current year).</li>
    </ol>`;
}

/**
 * Deterministic offline narrative (fallback / no-API-key mode).
 * IMPORTANT: renders ONLY values present in the canonical JSON — no defaults,
 * no invented percentiles, no fabricated claims. Missing optional data renders
 * explicit "not available" text.
 */
function buildOfflineNarrative(reportType, result) {
  if (Array.isArray(result?.clusters)) {
    return buildOfflineV2Narrative(reportType, result);
  }
  const { escapeHtml } = require('../../utils/htmlSanitizer');
  const esc = escapeHtml;
  const studentName = esc(result.student.first_name || 'the student');
  const fmt = (v, suffix = '') => (v === null || v === undefined) ? 'not available' : `${esc(String(v))}${suffix}`;

  const topStreams = (result.streams || []).slice(0, 3);
  const streamList = topStreams.length > 0
    ? topStreams.map(s => `<li><strong>${esc(s.name)}</strong> — fit index ${fmt(s.score)} (${esc(s.band)}), rank #${fmt(s.rank)}.</li>`).join('')
    : '<li>Stream analysis is not available for this assessment.</li>';

  const congruenceBlock = result.congruence
    ? `<h4>Parent-Student Alignment</h4>
       <p>Alignment index: <strong>${fmt(result.congruence.score)}</strong> (${esc(result.congruence.band || 'band not available')}).
       There are differences between the student's measured profile and the parent's expectations to discuss openly;
       use the discussion areas in this report as neutral conversation starters.</p>`
    : '<h4>Parent-Student Alignment</h4><p>Parent inventory data is not available for this assessment, so no alignment analysis is included.</p>';

  if (reportType === 'parent') {
    return `
      <h3>Understanding This Assessment</h3>
      <p>This report summarises <strong>${studentName}</strong>'s educational guidance assessment: normalized indices for reasoning skills, interest profile (RIASEC), and work-style indicators. These are <strong>assessment scores</strong>, not clinical or psychological evaluations of any person.</p>
      <h3>Student Strengths &amp; Interests</h3>
      <p>Holland interest code: <strong>${fmt(result.riasec.holland_code)}</strong>. Overall reasoning index: <strong>${fmt(result.aptitude.overall)}</strong> (normalized 0-100 index). Work-style composite: <strong>${fmt(result.grit.composite)} / 5</strong>.</p>
      <h3>Stream Directions to Consider</h3>
      <ul>${streamList}</ul>
      ${congruenceBlock}
      <h3>Constructive Discussion Guidance</h3>
      <ul>
        <li>Ask which subjects felt most engaging during the assessment and why.</li>
        <li>Review the top streams together; compare daily subjects rather than career labels.</li>
        <li>Agree on one exploration step for the coming month (e.g., talk to a senior student or counsellor).</li>
      </ul>
      <p><em>Interpretation note: fit bands are product interpretation bands, not scientifically validated categories. This report is educational guidance, not a diagnosis or a guarantee of outcomes.</em></p>`;
  }

  if (reportType === 'counselor') {
    return `
      <h3>Assessment Overview</h3>
      <p>Student: <strong>${studentName}</strong> (Grade ${fmt(result.student.grade)}, ${esc(result.student.board)}). Assessment version: <strong>${esc(result.assessment.version_code)}</strong>. Scoring is deterministic; this narrative was produced by the offline template engine.</p>
      <h3>Score Breakdown</h3>
      <ul>
        <li>Aptitude (normalized index 0-100): overall <strong>${fmt(result.aptitude.overall)}</strong>; dimensions ${Object.entries(result.aptitude).filter(([k]) => !['overall', 'scale'].includes(k)).map(([k, v]) => `${esc(k)} ${fmt(v)}`).join(', ')}.</li>
        <li>RIASEC indices: R ${fmt(result.riasec.R)}, I ${fmt(result.riasec.I)}, A ${fmt(result.riasec.A)}, S ${fmt(result.riasec.S)}, E ${fmt(result.riasec.E)}, C ${fmt(result.riasec.C)}; Holland code <strong>${fmt(result.riasec.holland_code)}</strong>${result.riasec.tie_break_applied ? ' (tie-break rule applied)' : ''}.</li>
        <li>Work style composite: <strong>${fmt(result.grit.composite)} / 5</strong> (normalized index ${fmt(result.grit.normalized_index)}).</li>
      </ul>
      <h3>Stream Fit &amp; Contributions</h3>
      <ul>${streamList}</ul>
      ${congruenceBlock}
      <h3>Limitations</h3>
      <ul>${(result.limitations || []).map(l => `<li>${esc(l)}</li>`).join('')}</ul>
      <h3>Discussion Prompts</h3>
      <ul>
        <li>Explore discrepancies between interest profile and current subject preferences.</li>
        <li>If parent data exists, mediate around the listed friction factors without assigning blame.</li>
      </ul>`;
  }

  // candidate (default)
  return `
    <h3>Executive Summary</h3>
    <p><strong>${studentName}</strong>, this report summarises your educational guidance assessment. Your overall reasoning index is <strong>${fmt(result.aptitude.overall)}</strong> (0-100 normalized index), your strongest interest theme is <strong>${fmt(result.riasec.holland_code?.[0])}</strong> (Holland code ${fmt(result.riasec.holland_code)}), and your work-style composite is <strong>${fmt(result.grit.composite)} / 5</strong>.</p>
    <h3>Aptitude Profile</h3>
    <p>Normalized indices (0-100): numerical ${fmt(result.aptitude.numerical)}, abstract ${fmt(result.aptitude.abstract)}, verbal ${fmt(result.aptitude.verbal)}, spatial ${fmt(result.aptitude.spatial)}, logical ${fmt(result.aptitude.logical)}, data ${fmt(result.aptitude.data)}. These are assessment scores, not percentiles.</p>
    <h3>Interest Profile (RIASEC)</h3>
    <p>Your Holland code is <strong>${fmt(result.riasec.holland_code)}</strong>. Explore what your top themes say about work environments you may enjoy.</p>
    <h3>Work Style</h3>
    <p>Composite: <strong>${fmt(result.grit.composite)} / 5</strong>. Strengths and growth areas here describe study habits — they are not character judgements.</p>
    <h3>Stream Directions to Consider</h3>
    <ul>${streamList}</ul>
    ${congruenceBlock}
    <h3>Next Steps</h3>
    <ol>
      <li>Read the full stream analysis and the contribution breakdown for your top stream.</li>
      <li>Discuss the results with your family or school counsellor.</li>
      <li>Choose one exploration activity for this month related to your top stream.</li>
    </ol>
    <p><em>This is educational guidance, not a diagnosis, not a guarantee, and not a replacement for a qualified counsellor.</em></p>`;
}

/**
 * Generate a report narrative.
 * @returns {{ text, model, provider, status, latencyMs, tokenUsage }}
 */
async function generateNarrative({ reportType, promptRow, userPrompt, structuredResult, assessmentId, userId }) {
  const started = Date.now();
  const provider = env.LLM_PROVIDER;
  const model = env.LLM_MODEL;
  const requestPayload = { systemPrompt: promptRow.system_prompt, userPrompt, reportType };

  let outcome = { text: null, status: 'failed', tokenUsage: null, error: null };

  if (provider === 'gemini' || provider === 'openai') {
    // Spend control: fail-soft quota gate — skipping the provider can never
    // change scores; the offline template guarantees a usable narrative.
    const quota = await llmQuota.checkQuota();
    if (!quota.allowed) {
      outcome = { text: null, status: 'fallback', tokenUsage: null, error: `quota: ${quota.reason}` };
    } else {
      try {
        const args = {
          systemPrompt: promptRow.system_prompt,
          userPrompt,
          model,
          timeoutMs: env.LLM_TIMEOUT_MS,
          maxOutputTokens: env.LLM_MAX_OUTPUT_TOKENS,
          ...(provider === 'gemini'
            ? { apiKey: env.GEMINI_API_KEY, baseUrl: env.GEMINI_BASE_URL }
            : { apiKey: env.OPENAI_API_KEY })
        };
        const completion = provider === 'gemini' ? await geminiComplete(args) : await openaiComplete(args);
        outcome = { text: completion.text, status: 'success', tokenUsage: completion.tokenUsage, error: null };
      } catch (err) {
        outcome = { text: null, status: 'failed', tokenUsage: null, error: err.message };
      }
    }
  }

  if (!outcome.text) {
    outcome.text = buildOfflineNarrative(reportType, structuredResult);
    outcome.status = provider === 'offline' ? 'success' : 'fallback';
  }

  const latencyMs = Date.now() - started;
  auditLlmCall({
    assessmentId, userId, reportType,
    promptVersionId: promptRow.id,
    provider, model,
    requestPayload,
    outcome: { ...outcome, latencyMs }
  });

  return { text: outcome.text, model: provider === 'offline' ? 'offline-template-v1' : model, provider, status: outcome.status, latencyMs, tokenUsage: outcome.tokenUsage };
}

module.exports = { generateNarrative, buildOfflineNarrative };
