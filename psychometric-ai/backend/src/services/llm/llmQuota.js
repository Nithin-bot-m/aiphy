// llmQuota — LLM spend control & usage accounting.
//
// Guarantees (spec §16/§17 unchanged): the quota layer can only SKIP a
// provider call — it can never alter scores or fabricate content. When a call
// is skipped the report pipeline falls back to the deterministic offline
// template and the llm audit row records status 'fallback' with a quota reason.
//
// Budgets (env):
//   LLM_DAILY_MAX_REQUESTS    — max provider calls / UTC day (0 = unlimited)
//   LLM_MONTHLY_TOKEN_BUDGET  — max tokens (in+out) / UTC month (0 = unlimited)
//   LLM_PRICE_JSON            — optional {"model":{"input_per_1k":x,"output_per_1k":y}} USD overrides

const env = require('../../config/env');
const { db } = require('../../config/db');

const DEFAULT_PRICES = {
  'gemini-2.5-flash': { input_per_1k: 0.00015, output_per_1k: 0.0006 },
  'gemini-2.0-flash': { input_per_1k: 0.01, output_per_1k: 0.04 },
  'gpt-4o-mini': { input_per_1k: 0.00015, output_per_1k: 0.0006 },
};

function getPrices() {
  if (!env.LLM_PRICE_JSON) return DEFAULT_PRICES;
  try {
    return { ...DEFAULT_PRICES, ...JSON.parse(env.LLM_PRICE_JSON) };
  } catch {
    console.error('[llmQuota] LLM_PRICE_JSON is not valid JSON — using defaults');
    return DEFAULT_PRICES;
  }
}

function parseTokens(tokenUsageJson) {
  if (!tokenUsageJson) return { input: 0, output: 0 };
  try {
    const u = JSON.parse(tokenUsageJson);
    // Gemini: promptTokenCount/candidatesTokenCount; OpenAI: prompt_tokens/completion_tokens
    const input = Number(u.promptTokenCount ?? u.promptTokensCount ?? u.prompt_tokens ?? u.input_tokens ?? 0) || 0;
    const output = Number(u.candidatesTokenCount ?? u.completion_tokens ?? u.output_tokens ?? 0) || 0;
    return { input, output };
  } catch {
    return { input: 0, output: 0 };
  }
}

function estimateCost(model, input, output) {
  const price = getPrices()[model] || { input_per_1k: 0, output_per_1k: 0 };
  return Number(((input / 1000) * price.input_per_1k + (output / 1000) * price.output_per_1k).toFixed(6));
}

/** UTC-day / month boundaries keep accounting deterministic across timezones. */
function utcDayStart() { return new Date().toISOString().slice(0, 10); }
function utcMonthPrefix() { return new Date().toISOString().slice(0, 7); }

async function countTodayRequests() {
  const row = await db.prepare(`
    SELECT COUNT(*) AS c FROM llm_requests
    WHERE provider IN ('gemini', 'openai') AND created_at >= ?
  `).get(`${utcDayStart()} 00:00:00`);
  return Number(row?.c || 0);
}

async function tokensThisMonth() {
  const rows = await db.prepare(`
    SELECT r.token_usage_json FROM llm_responses r
    JOIN llm_requests q ON r.request_id = q.id
    WHERE q.provider IN ('gemini', 'openai') AND q.created_at >= ?
      AND r.status = 'success'
  `).all(`${utcMonthPrefix()}-01 00:00:00`);
  return rows.reduce((sum, row) => {
    const t = parseTokens(row.token_usage_json);
    return sum + t.input + t.output;
  }, 0);
}

/**
 * Fail-soft gate consulted BEFORE a provider call.
 * @returns {{ allowed: boolean, reason?: string }}
 */
async function checkQuota() {
  if (env.LLM_DAILY_MAX_REQUESTS > 0) {
    const used = await countTodayRequests();
    if (used >= env.LLM_DAILY_MAX_REQUESTS) {
      return { allowed: false, reason: `daily request limit reached (${used}/${env.LLM_DAILY_MAX_REQUESTS})` };
    }
  }
  if (env.LLM_MONTHLY_TOKEN_BUDGET > 0) {
    const used = await tokensThisMonth();
    if (used >= env.LLM_MONTHLY_TOKEN_BUDGET) {
      return { allowed: false, reason: `monthly token budget reached (${used}/${env.LLM_MONTHLY_TOKEN_BUDGET})` };
    }
  }
  return { allowed: true };
}

/** Admin usage summary: today / this month / 14-day series / limits. */
async function getUsageSummary() {
  const todayRow = await db.prepare(`
    SELECT COUNT(*) AS requests,
           COALESCE(SUM(CASE WHEN r.status = 'success' THEN 1 ELSE 0 END), 0) AS successes,
           COALESCE(SUM(r.latency_ms), 0) AS latency_ms
    FROM llm_requests q LEFT JOIN llm_responses r ON r.request_id = q.id
    WHERE q.provider IN ('gemini','openai') AND q.created_at >= ?
  `).get(`${utcDayStart()} 00:00:00`);

  const monthRows = await db.prepare(`
    SELECT q.model_name, q.created_at, r.token_usage_json, r.status
    FROM llm_requests q LEFT JOIN llm_responses r ON r.request_id = q.id
    WHERE q.provider IN ('gemini','openai') AND q.created_at >= ?
  `).all(`${utcMonthPrefix()}-01 00:00:00`);

  let monthTokens = { input: 0, output: 0 };
  let monthCost = 0;
  for (const row of monthRows) {
    const t = parseTokens(row.token_usage_json);
    monthTokens.input += t.input;
    monthTokens.output += t.output;
    monthCost += estimateCost(row.model_name, t.input, t.output);
  }

  const byDayRows = await db.prepare(`
    SELECT substr(q.created_at, 1, 10) AS day, COUNT(*) AS requests,
           COALESCE(SUM(CASE WHEN r.status = 'success' THEN 1 ELSE 0 END), 0) AS successes
    FROM llm_requests q LEFT JOIN llm_responses r ON r.request_id = q.id
    WHERE q.provider IN ('gemini','openai') AND q.created_at >= ?
    GROUP BY day ORDER BY day DESC LIMIT 14
  `).all(new Date(Date.now() - 13 * 86400_000).toISOString().slice(0, 10) + ' 00:00:00');

  const recentFailureRows = await db.prepare(`
    SELECT q.model_name, q.report_type, q.created_at, r.status, r.error_message
    FROM llm_requests q LEFT JOIN llm_responses r ON r.request_id = q.id
    WHERE q.provider IN ('gemini', 'openai') AND r.status != 'success'
    ORDER BY q.id DESC LIMIT 5
  `).all();

  return {
    today: {
      requests: Number(todayRow?.requests || 0),
      successes: Number(todayRow?.successes || 0),
      avg_latency_ms: Number(todayRow?.requests) > 0 ? Math.round(Number(todayRow?.latency_ms || 0) / Number(todayRow.requests)) : 0,
      daily_request_limit: env.LLM_DAILY_MAX_REQUESTS || null
    },
    month: {
      requests: monthRows.length,
      tokens_input: monthTokens.input,
      tokens_output: monthTokens.output,
      estimated_cost_usd: Number(monthCost.toFixed(4)),
      monthly_token_budget: env.LLM_MONTHLY_TOKEN_BUDGET || null
    },
    by_day: byDayRows.map(r => ({ day: r.day, requests: Number(r.requests), successes: Number(r.successes) })),
    recent_failures: recentFailureRows,
    provider: env.LLM_PROVIDER,
    model: env.LLM_MODEL
  };
}

module.exports = { checkQuota, getUsageSummary, parseTokens, estimateCost, getPrices };
