# Architecture

## 1. System diagram

```
┌────────────────────────────────────────────────────────────────┐
│                       INPUT INSTRUMENTS                        │
│  Student: fixed-form Aptitude + RIASEC + Work-Style battery    │
│  Parent:  Expectation & Perception Inventory (separate item    │
│           bank — never the student psychometric test)          │
└──────────────────────────┬─────────────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────────────┐
│                     REST API (Express 5)                       │
│  helmet CSP · CORS allowlist · rate limits · JSON validation   │
│  authenticate (JWT) → requireRole → OWNERSHIP MIDDLEWARE       │
└──────────────────────────┬─────────────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────────────┐
│              DETERMINISTIC PSYCHOMETRIC ENGINES                │
│  aptitudeEngine · riasecEngine · gritEngine · streamEngine     │
│  congruenceEngine                                              │
│  - config from admin_settings (versioned, auditable)           │
│  - zero fabricated defaults: missing ⇒ null / explicit error   │
│  - explicit, documented tie-breaks                             │
└──────────────────────────┬─────────────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────────────┐
│        STRUCTURED RESULT JSON (canonical, spec §15)            │
│  schema: psychometric-result/1.0 — the ONLY object handed      │
│  to the LLM; persisted with reports; sha256 input hash         │
└──────────────────────────┬─────────────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────────────┐
│                 LLM EXPLANATION LAYER (only)                   │
│  versioned system prompt (prompt_versions) + fenced JSON block │
│  providers: gemini | openai | offline-template (fallback)      │
│  AbortController timeout · output validation · HTML allowlist  │
│  llm_requests / llm_responses audit rows                       │
└──────────────────────────┬─────────────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────────────┐
│             REPORT ENGINE + DATABASE + FRONTEND                │
│  reports (latest pointer) + report_versions (full history)     │
│  SQLite (dev) / PostgreSQL (production path) · audit_logs      │
└────────────────────────────────────────────────────────────────┘
```

## 2. Layer responsibilities

| Layer | Owns | Forbidden |
|---|---|---|
| Frontend | presentation, UX, autosave | computing/altering scores; trusting any client data |
| Controllers | HTTP shape, auth wiring | business logic (thin adapters) |
| Services | orchestration, transactions, canonical JSON | raw SQL duplication |
| Repositories | all SQL (parameterized) | policy decisions |
| Engines | all math, bands, tie-breaks | DB writes, HTTP, LLM calls |
| LLM service | narrative generation | score math, DB writes beyond reports/llm audit |
| Report engine | validation, sanitization, versioning | changing canonical scores |

## 3. Assessment lifecycle

1. **start** — creates/reuses the student's `in_progress` assessment pinned to the ACTIVE
   `assessment_version` (V1). The version is stored permanently; old reports stay reproducible.
2. **questions** — fixed-form strategy returns all active questions (44 student items in V1) in
   canonical order; options carry NO score values to the client.
3. **responses** — one upsert per (assessment, question, respondent); server derives
   `numeric_value` from the chosen option; cross-version or foreign option IDs are rejected.
4. **complete** — completeness gate (422 unless every active item answered) → engines run →
   atomic persistence (BEGIN/COMMIT with savepoint nesting) → status `completed`.
5. **results/reports** — canonical JSON assembled from persisted scores; three reports generated
   via the LLM layer; `report_versions` records every generation.

## 4. Data model (24 tables)

Identity & consent: `users`, `students`, `parents`, `student_parent_mapping`
Battery: `assessment_versions`, `questions`, `question_options`, `assessments`, `responses`
Scores: `aptitude_scores`, `riasec_scores`, `grit_scores`, `stream_scores`, `scoring_rules`,
        `congruence_scores`, `parent_expectations`, `parent_perceptions`
Language/LLM: `prompt_versions`, `llm_requests`, `llm_responses`
Output: `reports`, `report_versions`
Governance: `audit_logs`, `admin_settings`, `schema_migrations`

Key integrity rules:
- `responses` unique per (assessment, question, respondent[, parent]) via COALESCE index.
- All score tables carry `items_answered` / `items_expected` / `complete` for auditability.
- `reports` is the "latest" pointer; `report_versions` is append-only history.
- `student_parent_mapping.status`: `pending_student_approval` → `linked` → `revoked`, with
  `student_consented_at` required for any parental data access.

## 5. Frontend architecture

Vanilla JS SPA (hash routing) served by Express — preserved per the reuse mandate, hardened:
- `secureRender.js` — `esc()` for every dynamic string; `renderNarrative()` second-pass sanitizer.
- `api.js` — typed client matching the REST surface.
- Views: candidate (one-question-at-a-time runner, keyboard accessible, autosave, results with
  contribution breakdown), parent (consent-aware linking, inventory, alignment dashboard),
  admin (analytics, question bank, scoring config, prompt versioning, audit logs).
- No score values ever travel to the client during an assessment.

## 6. Failure semantics

| Situation | Behaviour |
|---|---|
| Incomplete assessment submitted | HTTP 422 `ASSESSMENT_INCOMPLETE` — never auto-scored |
| Engine invoked with no data for a module | `ScoringError` — explicit failure |
| Unmeasured dimension in otherwise complete data | `null` index + `measured: false`; excluded from composites |
| Parent data absent | `has_parent_data: false`, congruence `null` |
| LLM provider down/slow | hard timeout → offline deterministic narrative (`status: fallback`) |
| LLM output invalid | report status `failed`, honest placeholder persisted, error surfaced |
