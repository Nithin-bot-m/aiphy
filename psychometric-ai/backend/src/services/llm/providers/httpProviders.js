// LLM provider abstraction. Providers receive ONLY:
//   - a hardened system prompt (from versioned prompt_versions)
//   - a user prompt containing the canonical structured psychometric JSON
// Providers NEVER receive DB credentials, SQL, admin instructions, or raw PII
// beyond the minimum fields included by resultService (first name, grade, board).

const { fetchWithTimeout } = require('../../../utils/fetchWithTimeout');

class ProviderError extends Error {
  constructor(message, { provider, cause } = {}) {
    super(message);
    this.name = 'ProviderError';
    this.provider = provider;
    this.cause = cause;
  }
}

/** Gemini generateContent provider. */
async function geminiComplete({ systemPrompt, userPrompt, model, apiKey, timeoutMs, maxOutputTokens, baseUrl }) {
  const base = (baseUrl || 'https://generativelanguage.googleapis.com').replace(/\/$/, '');
  const url = `${base}/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const payload = {
    systemInstruction: { parts: [{ text: systemPrompt }] }, // system role kept separate (injection defense)
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    generationConfig: { temperature: 0.3, maxOutputTokens }
  };
  let json;
  try {
    const res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(payload)
    }, timeoutMs);
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new ProviderError(`Gemini API ${res.status}`, { provider: 'gemini', cause: body.slice(0, 300) });
    }
    json = await res.json();
  } catch (err) {
    if (err instanceof ProviderError) throw err;
    throw new ProviderError(`Gemini request failed: ${err.message}`, { provider: 'gemini', cause: err });
  }
  const text = json?.candidates?.[0]?.content?.parts?.map(p => p.text).filter(Boolean).join('\n') || '';
  if (!text) throw new ProviderError('Gemini returned an empty completion', { provider: 'gemini' });
  return {
    text,
    model,
    tokenUsage: json?.usageMetadata || null,
    finishReason: json?.candidates?.[0]?.finishReason || null
  };
}

/** OpenAI chat completions provider. */
async function openaiComplete({ systemPrompt, userPrompt, model, apiKey, timeoutMs, maxOutputTokens }) {
  let json;
  try {
    const res = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.3,
        max_tokens: maxOutputTokens
      })
    }, timeoutMs);
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new ProviderError(`OpenAI API ${res.status}`, { provider: 'openai', cause: body.slice(0, 300) });
    }
    json = await res.json();
  } catch (err) {
    if (err instanceof ProviderError) throw err;
    throw new ProviderError(`OpenAI request failed: ${err.message}`, { provider: 'openai', cause: err });
  }
  const text = json?.choices?.[0]?.message?.content || '';
  if (!text) throw new ProviderError('OpenAI returned an empty completion', { provider: 'openai' });
  return { text, model, tokenUsage: json?.usage || null, finishReason: json?.choices?.[0]?.finish_reason || null };
}

module.exports = { geminiComplete, openaiComplete, ProviderError };
