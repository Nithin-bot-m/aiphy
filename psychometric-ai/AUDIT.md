# AUDIT — Psychometric AI (Phase 1)

> Audit date: 2026-09-20 · Auditor: Phase 1 review · Scope: full codebase (backend, frontend, schema, engines, prompts, tests, seeds)
> Method: full source read + runtime probes. Every security finding marked **CONFIRMED** was reproduced with a live exploit script (`scripts/security-audit-verify.js`), not assumed from reading code.

---

## A. Existing Architecture

```
Frontend (vanilla JS SPA, hash routing, served statically by Express)
      ↓ fetch (JWT in localStorage, Authorization: Bearer)
Backend (Node.js + Express 5, CommonJS, single server.js with inline route table)
      ↓ controllers (auth, candidate, parent, admin, report) — contain business logic inline
DB (SQLite via node:sqlite DatabaseSync, schema.sql executed at boot, auto-seed at boot)
      ↓ engines (aptitude / riasec / grit / stream / congruence — deterministic, pure functions)
LLM (llmService: Gemini → OpenAI → hardcoded offline HTML fallback; promptService: hardcoded templates)
```

- **Runtime**: Node 24 (node:sqlite requires ≥22.5 — available). Express 5, JWT auth, bcryptjs hashing.
- **Modules**: `aptitudeEngine`, `riasecEngine`, `gritEngine`, `streamEngine`, `congruenceEngine`, `catIrtStub`, `llmService`, `promptService`, 5 controllers, 3 middleware, 23-table schema, seed script, 2 test files.
- **Frontend**: 7 JS modules + 6 CSS files + index.html. Views: landing / candidate / parent / admin / report.
- The claimed data flow (engine → structured JSON → LLM → report) **exists** but is undercut by fallback fabrication at every layer (see E/F).

## B. Existing Functionality (works today)

1. Password register/login for 3 roles; JWT; bcrypt(10); `GET /auth/me`.
2. OTP login flow (dev-grade, insecure — see F).
3. Candidate: profile CRUD, assessment start/resume, questions fetch (score fields withheld from client), per-item autosave, complete → scores + streams + congruence + 3 reports generated in-request.
4. Deterministic engines produce: weighted aptitude %, RIASEC means + Holland code + Prediger axes, grit composite + "percentile", 7 stream fits with contribution rationales, parent congruence with friction factors.
5. Parent: link by student code, inventory save, congruence recalculation, parent report regeneration.
6. Admin: dashboard analytics, candidate list, question CRUD (soft toggle), scoring-rule weight edit, prompt view/edit, audit log view (100), JSON export.
7. Frontend: assessment runner with keyboard shortcuts + autosave + progress, results dashboard with canvas radar chart, report viewer with print CSS, admin tables.
8. Two test files currently pass **against the seeded demo DB only**.

## C. Reusable Code (keep, with hardening)

| Asset | Verdict | Notes |
|---|---|---|
| `riasecEngine` math core (means, 0-100 scaling, Prediger) | **Keep** | Add explicit deterministic tie-break; remove `|| 3` fallbacks |
| `aptitudeEngine` weighted scoring concept | **Keep** | Remove 50-fallbacks; configurable difficulty weights |
| `gritEngine` dimension means | **Keep** | Remove fake `percentile`; rename to normalized index |
| `streamEngine` contribution-rationale structure | **Keep** | Weights already DB-overridable; move career/curriculum data to DB; remove 50-fallbacks |
| `congruenceEngine` structure (stream match + perception gap + friction) | **Keep** | Make weights/thresholds configurable; remove fabricated defaults (75/25) |
| `catIrtStub` 3PL probability/information functions | **Keep as clearly-labeled lab module** | `updateAbilityEstimate` is NOT MLE/EAP (it's an ad-hoc step rule) — delete or relabel; nothing calls it in production paths |
| `authMiddleware` (JWT + DB user re-check) | **Keep** | Add token revocation hooks later |
| `roleMiddleware` | **Keep** | Error message leaks current role (minor) |
| `schema.sql` 23-table design | **Keep, extend** | Good normalization; needs new columns/constraints (see G) |
| seed script structure | **Keep** | Must label all demo data; stop fabricating score rows |
| Frontend CSS design tokens + layout | **Keep** | Good SaaS-quality styling |
| Frontend assessment runner UX (keyboard, autosave, progress) | **Keep** | Fix XSS, fix score_value handling |
| charts.js canvas radar | **Keep** | No dependency, fine |

## D. Bugs (defects regardless of security)

| # | Location | Bug |
|---|---|---|
| D1 | `candidateController.saveResponse` | No check that `question_id` belongs to the assessment's version → cross-version response injection |
| D2 | `candidateController` (questions/save/complete) | No ownership check on `assessment_id` (see F1) |
| D3 | `getAssessmentQuestions` | `question_id IN (${qIds.join(',')})` string interpolation (safe today only because qIds are ints — pattern is fragile; must be parameterized) |
| D4 | `parentController.getChildren/getCandidates/exportData` | LEFT JOIN assessments produces duplicate child rows per assessment; no GROUP BY / latest-selection |
| D5 | `llmService` | No `AbortController` timeout on external fetch → hung LLM blocks the complete-assessment request indefinitely |
| D6 | `llmService` | `status` always `'success'` even when falling back; model name hardcoded, ignores `LLM_MODEL` |
| D7 | `completeAssessment` | No transaction: scores/streams/reports written across many statements; partial failure corrupts state |
| D8 | `completeAssessment` | No completeness validation — unfinished assessments silently scored with fabricated 50s/3.0s |
| D9 | `adminController.updateScoringRule` | Updates rules for ALL versions of a stream (no `version_id` filter); no JSON shape validation |
| D10 | Admin prompt editor | Edits `prompt_versions` rows but report generation uses hardcoded `PROMPT_TEMPLATES` — admin edits have **no effect** (dead feature) |
| D11 | `report_versions` table | Never written; `regenerate` overwrites narrative — report versioning is dead schema |
| D12 | `llm_requests` / `llm_responses` tables | Never written by llmService — LLM audit trail is dead schema |
| D13 | `api.js regenerateReport` | Client sends no body/type; server reads `req.params.type` from a path that doesn't include type (`/reports/:assessmentId/regenerate`) → always regenerates `candidate` default |
| D14 | `candidateView.selectOption` | Reads `opt.score_value` which the API intentionally withholds → always `undefined`; works only because server re-derives score — fragile contract |
| D15 | `authController.verifyOtp` | New-user path never validates OTP at all (auto-register with any OTP) |
| D16 | `sendOtp` | Reveals whether a phone is registered + returns the OTP in the response (`dev_otp`) unconditionally |
| D17 | `schema` responses | No `UNIQUE(assessment_id, question_id)` → duplicate responses possible per question under races |
| D18 | `server.js` | `cors()` wide open; no helmet; no rate limiting; JSON limit 10mb (DoS surface) |
| D19 | `package.json` | `npm test` runs only psychometrics tests; `api.test.js` orphaned |
| D20 | Worklog/audit `logAudit` | IP hardcoded `'127.0.0.1'` — audit trail has no real IP |

## E. Incorrect Psychometric Assumptions

| # | Finding | Requirement violated |
|---|---|---|
| E1 | **Fake percentiles everywhere.** Grit engine: `percentile = composite/5*100` (a 0-100 linear transform labelled "percentile") and persisted in `grit_scores.percentile`. UI displays "84th Percentile". Aptitude columns named `*_pct` and reported as "Percentile Mastery". No normative dataset exists. | #8, #10, #27 |
| E2 | **Silent fabricated defaults**: missing dimension → aptitude 50, RIASEC mean 3.0, grit 3.0, stream value 50, parent perception 3, congruence 75/25/75, offline-report 75/80/85/4.0/'IRC'. A missing answer silently becomes an average score. | #26 |
| E3 | **RIASEC tie handling is accidental**: `Array.sort` on equal scores relies on V8 stable-sort insertion order (R,I,A,S,E,C seeding order) — undocumented, untested, not a designed rule. | #9 |
| E4 | **Stream sort tie handling** likewise accidental; `rank_order` for equal fits is arbitrary. | #9, #11 |
| E5 | **1 item per dimension** in seed (6 aptitude, 6 RIASEC, 7 grit). Single-item "scales" — a 0/1 correct answer becomes 0% or 100% "mastery". Psychometrically indefensible; must be documented as demo-depth or expanded. | #27 |
| E6 | **LLM/offline fallback makes unsupported clinical claims**: "Reliability indices indicate high internal consistency", "outstanding analytical curiosity", "80th percentile" — all fabricated regardless of scores. Prompt instructs LLM to emit a "Reliability Index" that does not exist. | #19, #27 |
| E7 | **Congruence magic numbers** (0.6/0.4 blend, 0.8 gap multiplier, floor 20, threshold 25) hardcoded, unversioned, undocumented. Stream-match ladder (100/80/65/70/30/25) arbitrary. | #11, #31 |
| E8 | Difficulty weights (1.0/1.5/2.0) hardcoded in engine rather than configuration; `scoring_rules` table exists but difficulty config has nowhere to live. | #8 |
| E9 | Offline fallback labels output "Strong Fit" for streams regardless of actual band, and "top stream" defaults to 'Science / PCM' when list is empty. | #19, #26 |
| E10 | `assessment_version` in payload hardcoded `'v1.0.0'`; report generation passes hardcoded `promptVersionId` 1/2/3. | #7 |

## F. Security Issues

| # | Severity | Finding | Status |
|---|---|---|---|
| F1 | **CRITICAL** | IDOR on entire candidate flow: `getAssessmentQuestions`, `saveResponse`, `completeAssessment` trust `assessment_id` from body/params with **zero ownership check**. Any candidate can read/write/complete any other candidate's assessment. | **CONFIRMED (V1–V3)** |
| F2 | **CRITICAL** | OTP backdoor: `verifyOtp` accepts static `'123456'` for **any** account → full account takeover of every phone-registered user incl. seed admin. | **CONFIRMED (V4)** |
| F3 | **CRITICAL** | OTP self-registration with attacker-chosen `role` (incl. `admin`) and no OTP verification on the new-user path → privilege escalation. | **CONFIRMED (V5)** |
| F4 | **CRITICAL** | Parent IDOR: `getInventory`, `submitInventory`, `getCongruenceAndReport` never verify the parent is linked to the assessment's student → any parent reads/writes any child's data incl. full candidate report. | **CONFIRMED (V6)** |
| F5 | **CRITICAL** | `reportController.getReport/regenerateReport` have no ownership/role check → any authenticated user reads any student's report (incl. counselor dossier) by enumerating assessment IDs. | **CONFIRMED (V6 via child_report; same handler)** |
| F6 | HIGH | Student code link is a 4-digit space (`STU-####`), case-insensitive match, no rate limit → parent-link brute force; linking is instant with `consent_given=1` and **no student-side consent step**. | code-verified |
| F7 | HIGH | Stored XSS chain: user/LLM text → `narrative_html` → `reportView` injects raw HTML via `innerHTML`. Offline fallback interpolates `full_name` unescaped. Same for names/question text across views. | code-verified |
| F8 | HIGH | No rate limiting on auth/OTP/login/link endpoints; OTP response leaks `dev_otp` and registration status. | code-verified |
| F9 | MEDIUM | No logout/token revocation; JWT 7d; no `helmet` secure headers; CORS `*`; no input validation library (hand-rolled, inconsistent). | code-verified |
| F10 | MEDIUM | `.env.example` ships a real-looking JWT secret default also hardcoded in `env.js` fallback. | code-verified |
| F11 | MEDIUM | Audit IP hardcoded; no audit events for report access/regeneration, result access, admin exports. | code-verified |
| F12 | LOW | `roleMiddleware` error discloses current role; demo credentials hardwired into client bundle with one-click login buttons on landing page. | code-verified |
| F13 | LOW | LLM prompt/user data concatenated into single user message for Gemini (no system role separation); no response validation/sanitization before storage. | code-verified |

## G. Database Problems

1. `grit_scores.percentile` column stores fabricated percentiles (E1) — must be replaced by `normalized_index` (+ optional `estimated_percentile` semantics documented).
2. `responses` lacks `UNIQUE(assessment_id, question_id)` (D17) and lacks version pinning beyond question's own version.
3. Missing `updated_at` on most tables (users, students, assessments, responses, etc.) despite requirement.
4. Missing indexes: `assessments(status)`, `responses(assessment_id, question_id)`, `questions(version_id, module)`, `stream_scores(assessment_id, rank_order)`, `audit_logs(created_at)`, FK indexes on mappings.
5. No `admin_settings` table (required); no `user Consent` / privacy fields (consent flow, deletion tracking).
6. `reports` UNIQUE(assessment_id, report_type) blocks reproducible versioning (D11); no `report_versions` writes, no `structured_input_hash`, no `model`/`prompt_version` columns on reports.
7. No migrations system — `schema.sql` executed wholesale at boot; schema evolution undefined.
8. `parent_perceptions` hardcodes 4 perception columns — parent question bank rows exist but are never used by the API (duplicate parallel systems, see H3).
9. No explicit `QUESTION versioning link` on responses beyond question row; old reports reproducibility relies on soft-deleting questions only (`is_active` toggles mutate shared rows — editing a question rewrites history for existing assessments).
10. SQLite demo DB committed into zip (`backend/psychometric.db`, 268KB) — binary artifact + demo PII in repo.

## H. Missing Requirements

1. **Server-side ownership/relationship authorization everywhere** (F1/F4/F5) — biggest gap.
2. Consent flow for parent linking (student approval), parental consent records, privacy notice, data export/deletion endpoints.
3. Parent inventory: question-bank items exist but API ignores them (ad-hoc body fields) → two parallel systems; responses not stored in `responses` with respondent_type='parent' as schema intends.
4. `LLM_PROVIDER` env (spec #4) not implemented; provider selection is hardcoded Gemini→OpenAI→offline.
5. Structured LLM output + validation (spec #16): current pipeline stores raw HTML with no schema validation.
6. `GET /api/assessments`, `/api/assessments/:id`, `/progress`, `/results/:id/streams`, `/results/:id/congruence`, `/reports/:id/download`, `/auth/logout` endpoints (spec #24) missing.
7. Admin: question analytics (attempts/correct%/dimension performance), RIASEC distribution, assessment version management UI, pagination on audit logs.
8. Assessment version lifecycle management (create new version, switch active) — only v1.0.0 auto-seeded.
9. Three report templates per spec #18 — current fallbacks roughly match candidate/parent; counselor misses limitations + discussion prompts; no "download" (print CSS exists — acceptable MVP path).
10. Tests: no security tests, no LLM-layer tests, no missing-data tests, no tie-break tests, no runner integration.
11. Docs: README/ARCHITECTURE/SCORING/SECURITY/PRIVACY/API/PSYCHOMETRIC_LIMITATIONS all absent.
12. Demo data not labelled `DEMO`; seed fabricates score rows directly instead of through engines.

## I. Refactoring Plan (Phase 2–20)

**Decision: preserve and harden the existing Express + vanilla-JS stack** (spec permits "preserve the existing frontend if it can be cleanly improved"). A React rewrite would invalidate working, tested UX for zero psychometric gain; effort is concentrated on the deterministic core, security, and integrity, which is where this project is broken.

| Phase | Scope | Key files |
|---|---|---|
| 2 | Schema v2: fix G1–G9, add admin_settings, consent fields, report versioning columns, migrations runner; seeds labelled DEMO and computed via engines | `backend/src/models/schema.sql`, `migrations/`, `seed/` |
| 3 | Auth rewrite: kill OTP backdoor (F2/F3), rate limiting, helmet, CORS allowlist, validation lib, logout, stronger student codes (8-char), RBAC preserved | `authController`, `middleware/*`, `server.js` |
| 4–6 | Ownership middleware for every assessment/report/parent route (F1/F4/F5); completeness validation before scoring (D8); transactional completion (D7); version-pinned response validation (D1) | `candidateController`, `parentController`, `middleware/ownership.js` |
| 7–8 | Engines: remove ALL fabricated defaults (E2); explicit deterministic tie-breaks (E3/E4); configurable difficulty weights (E8); normalized indices not percentiles (E1); versioned scoring config from DB (E7/E10) | `psychometrics/*` |
| 9–10 | Parent inventory unified through question bank + responses table; congruence config externalized; no-data state returns "no parent data" instead of 75 (E2) | `parentController`, `congruenceEngine` |
| 11 | Single canonical `buildResultJson` service (spec #15 shape) — the only object handed to LLM | `services/resultService.js` (new) |
| 12 | LLM provider abstraction (LLM_PROVIDER), timeouts (D5), structured JSON output + validation, prompt-injection hardening, request/response audit rows (D12), sanitization before storage | `llmService`, `promptService` |
| 13 | Report engine: report_versions writes (D11), structured_input_hash, prompt_version from DB (D10), sanitized HTML, reproducibility | `reportController`, `services/reportService.js` (new) |
| 14–16 | Frontend: XSS escaping everywhere (F7), remove fabricated numbers (E1/E9 in UI), consent UI, report download, admin additions, remove auto-OTP autofill, DEMO badges | `frontend/js/*` |
| 17 | Admin analytics: question analytics, RIASEC distribution, versions list | `adminController` |
| 18 | Security hardening sweep: rate limits per route, param queries everywhere (D3), audit IP (D20), secrets check | cross-cutting |
| 19 | Test suite: unit (engines incl. tie-break/missing-data), integration (auth flow, assessment flow), security (IDOR/OTP/parent scopes — the exact probes from this audit must fail), LLM (mock provider, malformed output, injection) | `backend/tests/*` |
| 20 | Docs + deployment: README, ARCHITECTURE, SCORING, SECURITY, PRIVACY, API, LIMITATIONS, .env.example rewrite, seed/demo gating | `docs/*`, README |

**Non-negotiable invariants carried into every phase**
1. The LLM never sees, computes, or mutates scores; engines are the single source of numeric truth.
2. No fabricated default score anywhere — missing data yields explicit errors or explicit "not available" states.
3. Every read/write of student data passes an ownership/relationship check server-side.
4. Percentile language is banned unless normative data exists; use "normalized index" / "fit index".
5. All psychometric constants live in versioned DB config, not scattered JS.
