-- Backfill historical mislabelled fallback reports and LLM audit rows from
-- deprecated/non-existent model strings to honest offline-template-v1 provenance.

UPDATE reports
SET model = 'offline-template-v1'
WHERE model IN ('gemini-3.8-flash', 'gemini-2.0-flash');

UPDATE report_versions
SET model = 'offline-template-v1'
WHERE model IN ('gemini-3.8-flash', 'gemini-2.0-flash');

UPDATE llm_requests
SET model_name = 'offline-template-v1'
WHERE model_name = 'gemini-3.8-flash'
  AND status IN ('fallback', 'failed');

