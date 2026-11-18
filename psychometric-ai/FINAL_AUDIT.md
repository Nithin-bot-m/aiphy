# FINAL_AUDIT.md — Psychometric AI v2.0.0

**Independent final verification audit.** Every claim below was re-executed during this
audit session against a clean environment — nothing is assumed to work because code
exists. Evidence commands and results are recorded in `TEST_REPORT.md`.

- Date: 2026-09-20 (UTC+8)
- Scope: frontend, backend, database, migrations, auth, RBAC, engines, LLM service,
  reports, admin, tests, env configuration (user instruction §1–§33)
- Method: clean install → static inspection → automated suites → live HTTP probes →
  hand-calculated engine vectors → interactive browser QA → targeted remediation →
  full re-verification

---

## 1. Verdict summary

| # | Area | Verdict | Notes |
|---|------|---------|-------|
| 1 | Architecture | **PASS** | Deterministic engines → canonical JSON → LLM narrative only; LLM can never write scores (verified by payload capture + injection tests) |
| 2 | Authentication | **PASS** | bcrypt(12) only; expired/wrong-key/garbage tokens rejected; OTP backdoor dead; no user enumeration (dummy-hash timing equalization) |
| 3 | Authorization | **PASS** | 27-probe matrix: every cross-student / unlinked-parent / cross-role access denied server-side (403/401), consent lifecycle enforced, revocation ends access |
| 4 | Assessment | **PASS** | 44-item lifecycle: load/save/resume/refresh-preserve/idempotent-upsert/422-gate/409-double-complete; foreign-version questions rejected; score values never sent to client |
| 5 | Aptitude engine | **PASS** | Hand-calculated vectors match exactly (max/min/mixed/difficulty-weights); unmeasured dims = explicit null, excluded from overall |
| 6 | RIASEC engine | **PASS** | All-6-dimension vectors, full + partial ties resolve via documented hexagon order, null/invalid answers skipped (no Number(null)=0) |
| 7 | Grit engine | **PASS** | Min/max/mixed vectors match; no reverse-scored items (monotonicity verified); composite = mean of measured dims only |
| 8 | Stream engine | **PASS** | Σ(w·v)/Σw verified by hand for ALL 7 streams; weights sum to **1.0**; deterministic tie-break (score desc, stream_id asc); DB rule override + inactive-rule ignore verified |
| 9 | Congruence engine | **PASS** | 5 required cases incl. parent-missing (explicit null state) and student-missing; neutral language asserted (no loaded terms); friction now symmetric (fix F-06) |
| 10 | LLM boundary | **PASS** | Exact payload captured from `llm_requests`: only {systemPrompt, userPrompt, reportType}; zero credentials/SQL/full-PII/admin surface; system prompt forbids score alteration |
| 11 | LLM failure modes | **PASS** | HTTP 500 / 401 / 429 / malformed / empty / timeout all fall back to honest offline narrative; `structured_input_hash` unchanged; failures recorded in `llm_responses` |
| 12 | Prompt injection | **PASS** | Hostile profile names + inventory comments stay data (escaped in output, never markup); injection cannot reorder scores or promote a stream; over-length payloads rejected by validation |
| 13 | Reports | **PASS** | Every number in reports equals the database rows; `structured_input_hash` = sha256(stored canonical JSON); version/timestamp/model present; zero percentile claims |
| 14 | Privacy | **PASS** | No passwords/tokens/OTP/API keys in logs (fix F-08 removed demo password from seed log); audit trail clean; API errors leak no stacks/SQL/env |
| 15 | Security hardening | **PASS** | SQLi neutralized (parameterized), XSS escaped end-to-end, prototype pollution inert, 256KB body cap (413), rate limiters active, strict CSP with **CSP-safe event wiring** (fix F-01), helmet + CORS allowlist |
| 16 | Testing | **PASS** | 67 automated tests (unit 30 / integration 13+6 / security 18) + 377 audit checks, all passing |
| 17 | Documentation | **PASS** | README matches implementation (67 tests, lint/build, demo creds, audit scripts); no "validated instrument" claims; limitations documented |
| 18 | Deployment readiness | **PASS (with documented prerequisites)** | See §4 — production checklist required (PostgreSQL driver swap, OTP provider, JWT_SECRET) |

**No critical security, authorization, scoring or data-integrity issue remains open.**
All issues found during this audit were fixed and re-verified (see §3). The project is
**production-ready for a controlled pilot** subject to the deployment prerequisites in §4;
it is explicitly *not* a validated psychometric instrument (see `docs/PSYCHOMETRIC_LIMITATIONS.md`).

---

## 2. What was verified, and how

### 2.1 Environment & build (§1, §2, §28)
- `rm -rf node_modules && npm install` from scratch: **success**, lockfile resolved, **0 vulnerabilities** (`npm audit`).
- All 7 runtime dependencies used (bcryptjs, cors, dotenv, express, express-rate-limit, helmet, jsonwebtoken); dev deps (eslint, globals) used by CI-gates.
- `npm run lint` (created this audit): **0 errors** after removing 15 dead imports/vars it exposed.
- `npm run build` (created this audit — the app is intentionally bundler-free): verifies
  syntax of all 65 JS files, all 15 `index.html` asset refs exist, zero hardcoded absolute
  API URLs in the frontend, and emits a sha256 `build-manifest.json`.

### 2.2 Database (§3) — `scripts/verify-db.js` → **90/90 PASS**
- Fresh DB from zero: forward-only migration `001_init.sql` applies cleanly; replay is idempotent.
- Introspected: 24 expected tables (+`schema_migrations` bookkeeping, no others); 25 foreign keys
  with expected cardinality per table; unique constraints (email, phone, student_code, version_code,
  one score row per assessment, one report per (assessment,type), report version numbers, stream per
  assessment); `uq_responses_respondent` dedup with `COALESCE(parent_id,0)`; CHECK constraints on
  every enum/status column; NOT NULL on identity/score columns; timestamps on mutable tables;
  hot-path indexes present. Runtime FK enforcement proven by rejected orphan inserts.
- Seed on fresh DB: battery V1 (12 aptitude + 18 RIASEC + 14 work-style + 10 parent items),
  7 scoring-rule profiles, scoring config, 3 prompt versions, demo assessment computed **through
  the real engines**, 3 demo reports. Demo users flagged `is_demo=1`.

### 2.3 Engines vs hand calculation (§7–§14, §21, §22) — `scripts/final-verify-engines.js` → **134/134 PASS**
- **Aptitude**: all-max → 100; all-min → 0; mixed vector hand-computed (numerical 67, abstract 100,
  verbal 0, spatial 50, logical/data null, overall 54 with nulls excluded — *not* averaged as 50);
  hard items weighted 2× (2/3 → 67); empty input throws `ScoringError`.
- **RIASEC**: each single dimension ranks top; mixed vector hand-computed (R60 I93 A20 S70 E80 C50,
  code `IES`); full tie → hexagon `RIA` + `tie_break_applied=true`; partial tie → `IEC` with R<A<S
  ordering; null/string answers skipped; empty input throws.
- **Grit**: min → 1.00/20; max → 5.00/100; mixed vector hand-computed (composite 3.36 = 23.5/7,
  index 67); unmeasured dimension excluded from composite (never mid-default); monotonicity proves
  no reverse-scoring; empty input throws.
- **Stream**: every stream's weights sum to **1.0**; fit scores hand-computed for a full input
  vector and matched exactly (pcm 79.0, pcb 79.0, commerce_math 76.5, commerce_no_math 71.3,
  humanities_law 65.0, design 72.6, vocational 71.9) with correct bands (75+/55–74.999/else);
  contributions arithmetically consistent (Σw·v/Σw reproduces each score); uniform input →
  deterministic alphabetical tie-break; unmeasured component → `ScoringError` (no silent 50);
  DB rule overrides defaults; inactive rules ignored.
- **Congruence**: case 1 agree → 100/High Alignment; case 2 strong disagreement → 39/High Friction
  with stream + perception friction (hand-computed: cross-family 30, gap 100−60·0.8=52,
  0.6·30+0.4·52=39); case 3 rank-2 → 88; case 4 parent missing → explicit null state; case 5
  student missing → 25 with documented stream-only basis; neutral language asserted against a
  loaded-term list.
- **Reproducibility**: two independent full engine passes produce **byte-identical** JSON.
- **Versioning**: V2 clone with one revised item leaves V1 rows byte-identical; V2 contains the
  revised item and not the original.

### 2.4 Live HTTP verification (§4–§6, §15–§23, §31)
`scripts/final-verify-live-a.js` (**77/77**) and `scripts/final-verify-live-b.js` (**76/76**),
each against an isolated, freshly-migrated + seeded server on an ephemeral port:
- **Auth (§4)**: candidate/parent register+login+logout; admin login; admin self-registration
  rejected; invalid password 401; missing credentials 400; expired token (−10s expiry) 401;
  wrong-secret token 401; malformed token 401; `users` table contains **zero** non-bcrypt hashes;
  static OTP `123456` rejected.
- **Authorization (§5)**: student A cannot read/write/complete/read-results/read-reports of
  student B (all 403); unlinked parent denied; link requires student approval; after approval the
  correct parent sees the dashboard; parent A still denied for B; **student revocation ends parent
  access immediately**; candidates/parents blocked from admin APIs (403); admin allowed; profile
  updates cannot change role.
- **Assessment (§6)**: 44 questions load with **no score values in options**; invalid option /
  invalid question / foreign-version question / malformed payload all 400; duplicate answer
  upserts to a single row; early completion → 422 `ASSESSMENT_INCOMPLETE`; full completion returns
  top-3 streams + 3 reports; duplicate completion → 409 and does not duplicate reports; progress
  endpoint reports 44/44; refresh preserves all 44 answers; resume returns the same assessment.
- **Input security (§19)**: three SQLi patterns neutralized (table intact afterwards); hostile
  `<script>`/`onerror` name accepted as data and rendered escaped in report HTML; `__proto__`
  payload does not pollute `Object.prototype`; 300KB body → 413; mass-assignment fields ignored
  (role, password_hash, student_code).
- **Reports (§20)**: report aptitude/RIASEC/grit values equal DB rows; 7 streams equal
  `stream_scores` (scores, bands, ranks); version code, timestamp, model present;
  `structured_input_hash == sha256(stored canonical JSON)`; contribution sets reproduce each fit
  score; no affirmative percentile language anywhere.
- **LLM boundary (§15)**: captured request payload keys exactly `{systemPrompt, userPrompt,
  reportType}`; no `DATABASE_URL`/`postgres://`/SQL/`JWT_SECRET`/API keys/email/student-code/full
  name/admin routes; contains the structured psychometrics; system prompt includes explicit
  never-change/never-invent rules.
- **LLM failure (§16)**: with provider forced to `gemini` + bogus key, six failure modes
  (500, 401, 429, malformed JSON, empty completion, hung connection with abort) each: complete
  with a ready report, render the honest fallback narrative, leave the input hash unchanged, and
  record the failure in `llm_requests`/`llm_responses`.
- **Injection (§17)**: hostile candidate name (>120 chars) rejected by validation; length-valid
  hostile name processed as data — never executable, no score reordering, no stream promotion;
  hostile inventory comment never executable in refreshed reports.
- **Privacy (§18)**: full captured server log contains none of the session's passwords/tokens;
  `audit_logs` and LLM payloads contain no secrets.
- **Version immutability (§22 live)**: admin update of a question used by a completed assessment
  → 400 `QUESTION_LOCKED`; DB text unchanged.
- **Journeys (§31)**: A (candidate end-to-end), B (parent link→approve→inventory→dashboard→
  alignment→parent report; counselor report denied), C (admin dashboard→questions CRUD→scoring
  rules with sum-validation→candidates→counselor report→audit logs→exports→report version history)
  — all pass.
- **API contract (§23)**: single envelope `{success:true,data}` / `{success:false,error:{code,
  message}}` across 2xx/4xx/404/malformed-JSON; no internals in error bodies (6 dedicated tests).

### 2.5 Browser QA (§24, §25, §26)
Interactive headless-Chromium session against the real server (strict CSP enabled):
- Full UI journeys: landing → DEMO student login → candidate dashboard (7 ranked streams) →
  report view → sign out → admin login → analytics/questions/scoring/prompts/audit tabs →
  sign out → **new candidate registration via modal** → assessment start → option selection →
  next question. **Zero console errors, zero page errors.**
- Keyboard: option cards selectable with Enter/Space (`role="button"`, `tabindex="0"`),
  verified by dispatched key events; global `:focus-visible` outline added (fix F-12).
- Responsive: no horizontal scroll at 375px / 768px / 1440px (fixes F-10/F-11).
- Performance (§26): `/health`, `/auth/me`, `/results` respond in 3–4 ms; duplicate report
  generation impossible (upsert + unique constraint); duplicate assessment submission → 409;
  scoring config TTL-cached; LLM called once per report type per generation with hard timeout.

---

## 3. Issues found and fixed during this audit (with locations)

| ID | Severity | Issue | File(s) | Fix | Re-verified by |
|----|----------|-------|---------|-----|----------------|
| F-01 | **CRITICAL** | Production CSP (`script-src-attr 'none'`) silently blocked **all 55** inline `onclick/onsubmit/onchange/onkeydown` handlers → UI completely non-interactive under the shipped security headers | `frontend/index.html`, all `frontend/js/*View.js`, `auth.js` | Converted every handler to CSP-safe event delegation: one dispatcher (`data-act` + JSON `data-args`, event-first signatures preserved) in `secureRender.js`; anchors switched off `javascript:` hrefs | Interactive browser QA (all journeys, 0 console errors) |
| F-02 | **HIGH** | Unmeasured RIASEC dimension rendered as `0` (fabricated value in display) | `frontend/js/candidateView.js:301-306` | Renders explicit "not measured" for null | §9 grep + code review |
| F-03 | **MEDIUM** | Perception friction one-sided: only "parent rated higher" produced a factor — asymmetric and not fully neutral | `backend/src/services/psychometrics/congruenceEngine.js:115-136` | Symmetric neutral labels for both directions | engine vectors 134/134 incl. case-2 |
| F-04 | **MEDIUM** | Malformed-JSON errors echoed body-parser internals ("Expected property name… position 1") | `backend/src/server.js` error handler | Generic "Malformed request body." message | contract test (67/67) |
| F-05 | **MEDIUM** | Convenience test scripts `test:unit/integration/security` broken on Node 24 (`node --test <dir>` MODULE_NOT_FOUND) | `package.json` | Glob-based file arguments | `npm run test:*` all green |
| F-06 | **MEDIUM** | Test helper DBs left 40+ `data/test-*.db` droppings | `backend/tests/helpers.js` | `close()` deletes isolated DB + wal/shm | post-run `ls data/` |
| F-07 | **MEDIUM** | Seed logged demo **passwords** to server logs (privacy §18) | `backend/seeds/runSeed.js` | Log emails only; README documents demo creds | live-B §18.1 scan |
| F-08 | **LOW** | Seeded version description claimed "+ 6 parent inventory items"; actual bank has 10 (8 perception + 2 expectation) | `backend/seeds/runSeed.js:30` | Description corrected | engine §22 count check |
| F-09 | **LOW** | Google Fonts `@import` blocked by own CSP → dead dependency + console noise | `frontend/css/tokens.css:2` | Removed; documented system-font stack | browser QA (no CSP violations) |
| F-10 | **LOW** | Header nav caused horizontal scroll at ≤768px | `frontend/css/main.css` | Responsive wrap rules | 375/768/1440 checks |
| F-11 | **LOW** | Fixed 340px canvases overflowed mobile | `frontend/css/candidate.css` | `.chart-card canvas { max-width:100%; height:auto }` | 375px check |
| F-12 | **LOW** | No visible keyboard focus on buttons/links/cards; 17 form labels not programmatically associated with inputs | `frontend/css/main.css`, `frontend/js/{auth,parentView,adminView}.js` | Global `:focus-visible` outline; `for=` attributes added | a11y pass (find-by-label works) |
| F-13 | **LOW** | 15 dead imports/unused vars across src + audit scripts | various | Removed / renamed `_`-prefixed | `npm run lint` = 0 errors |

## 4. Remaining known limitations (documented, not hidden)

1. **No normative population**: all scores are normalized indices (0-100), *not* percentiles.
   Percentile language requires a normative dataset (roadmap: `docs/PSYCHOMETRIC_LIMITATIONS.md`).
2. **Not a validated instrument**: fixed-form 44-item screening battery; bands are product
   interpretation labels. No reliability/validity claims are made anywhere.
3. **PostgreSQL**: production target; schema is portable and access is parameterized through the
   repository layer, but today's runtime is SQLite (`node:sqlite`). The driver swap is a
   documented deployment step, not yet exercised in production.
4. **OTP delivery**: no SMS/email provider is implemented; OTP endpoints fail closed (501) in
   production. Password login is the supported path.
5. **Fixed-form only**: CAT/IRT exists solely as a labelled future interface
   (`catIrtLab.js` + `AssessmentStrategy`); nothing imports it.
6. **Report generation is synchronous** (documented); a job queue is the next step for
   large deployments.

## 5. Final commands and results

| Item | Command | Result |
|------|---------|--------|
| Test | `npm test` | **67/67 pass**, 0 fail, 0 skipped |
| Test suites | `npm run test:unit` / `test:integration` / `test:security` | 30 / 19 / 18 pass |
| Build | `npm run build` | **BUILD OK** — 65 JS files, 15 asset refs, manifest emitted |
| Lint | `npm run lint` | **0 errors**, 0 warnings |
| DB migration | `node scripts/verify-db.js` (migrate from zero + seed) | **90/90 PASS** |
| Engine vectors | `node scripts/final-verify-engines.js` | **134/134 PASS** |
| Live HTTP A | `node scripts/final-verify-live-a.js` | **77/77 PASS** |
| Live HTTP B | `node scripts/final-verify-live-b.js` | **76/76 PASS** |
| Dependency audit | `npm audit` | **0 vulnerabilities** |
| Browser QA | interactive session (strict CSP) | all journeys OK, 0 console errors |

## 6. Deployment steps

```bash
# 1. Provision PostgreSQL and set DATABASE_URL (repository-layer driver swap — see README)
# 2. Configure
cp .env.example .env
#    NODE_ENV=production, strong JWT_SECRET (48-byte random), FRONTEND_URL/BACKEND_URL
#    = public origins (CORS allowlist), SEED_DEMO_DATA=false
# 3. Migrate (from zero) and provision battery + prompts (idempotent, demo-free)
npm run migrate
# 4. Provision the first admin (bcrypt hash) directly in `users`
# 5. Start behind a TLS-terminating proxy (trust proxy is enabled)
npm start
# 6. Optional gate before release:
npm test && npm run lint && npm run build
node scripts/verify-db.js && node scripts/final-verify-engines.js
```

The implementation is intended to be understandable by a human engineer: one deterministic
pipeline, one canonical result schema (`psychometric-result/1.0`), one API envelope, and four
independent verification scripts that can re-prove every claim in this document.
