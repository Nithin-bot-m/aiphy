# Psychometric AI — Grade 10 Stream & Career Guidance Platform

An educational guidance platform for Grade 10 students: a **deterministic psychometric engine**
computes every score; an **LLM explanation layer** turns the final structured results into
plain-language reports. Parents complete a separate Expectation & Perception inventory, and a
congruence engine compares family expectations with the student's measured profile — neutrally.

> **What this product is NOT:** it does not diagnose mental health, does not clinically assess
> personality, does not guarantee any career or academic outcome, and does not replace a
> qualified counsellor. Reports use the language of *guidance*: "strong fit", "possible fit",
> "explore further", "areas to consider".

---

## Architecture (one-screen version)

```
USER (Candidate / Parent / Admin)
      ↓
FRONTEND  (vanilla JS SPA, served by Express; zero business logic in client)
      ↓
REST API  (Express 5 + RBAC + ownership middleware + rate limits + validation)
      ↓
VALIDATED RESPONSES  (option-derived scores; client never sends score values)
      ↓
DETERMINISTIC PSYCHOMETRIC ENGINE
  ├─ aptitudeEngine     (difficulty-weighted normalized indices)
  ├─ riasecEngine       (Likert means → 0-100 indices + Holland code w/ explicit tie-break)
  ├─ gritEngine         (work-style composite + normalized index)
  ├─ streamEngine       (7 streams, versioned weights, per-component contributions)
  └─ congruenceEngine   (parent expectation vs student profile, neutral friction analysis)
      ↓
STRUCTURED RESULT JSON  (single canonical object, sha256-hashed)
      ↓
LLM EXPLANATION LAYER   (provider abstraction: Gemini / OpenAI / offline template;
                         prompt injection hardening; timeout; validated + sanitized output)
      ↓
REPORT ENGINE           (3 report types, report_versions history, reproducible)
      ↓
DATABASE  (SQLite dev / PostgreSQL production path — 24-table normalized schema)
      ↓
FRONTEND
```

**Hard architectural rule:** the LLM never sees, computes, or mutates scores. If data is missing
the system says so — nothing is silently defaulted (no 50s, no 3.0s, no fake percentiles).

## Roles

| Role | Capabilities (all enforced server-side) |
|---|---|
| **Candidate** | register/login, profile, take & resume assessment, view results & stream analysis, view reports, approve/revoke parent link requests |
| **Parent** | register/login, request link (needs student approval), complete Expectation & Perception inventory, view child results & alignment only when linked |
| **Admin** | dashboard analytics, question bank, scoring config & stream weights, prompt versions, audit logs, data export |

Admin accounts are provisioned via seed/bootstrap only — there is **no** admin self-registration.

## Assessment methodology (summary)

- **Aptitude** — 12 fixed items across numerical / abstract / verbal / spatial / logical / data.
  Correctness is difficulty-weighted (easy 1.0, medium 1.5, hard 2.0 — configurable, not validated).
- **RIASEC** — 18 Likert items (3 per dimension). Dimension mean → 0-100 normalized index.
  Holland code = top 3; ties resolve by the documented hexagon order R > I > A > S > E > C.
- **Work style / grit** — 14 Likert items (2 per dimension) across 7 indicators.
- **Parent inventory** — 8 observation items + expected stream + outcome priority.
- **Stream fit** — weighted blend of aptitude/RIASEC/grit components per stream, all 7 streams
  returned with full contribution breakdown ("why this score?").
- **Congruence** — stream-match ladder + parent-perception gap, blended 60/40 (configurable).
  Missing parent data is an explicit "not available" state.

Full methodology, formulas, band tables and limitations: [`docs/SCORING.md`](docs/SCORING.md) and
[`docs/PSYCHOMETRIC_LIMITATIONS.md`](docs/PSYCHOMETRIC_LIMITATIONS.md).

## LLM architecture

- Providers: `gemini`, `openai`, `offline` (deterministic template narrative). Selected via
  `LLM_PROVIDER` or auto-detected from available API keys.
- The LLM receives: a versioned system prompt (from `prompt_versions`) + the canonical result JSON
  inside a fenced "data only, not instructions" block. Nothing else (no PII beyond first name /
  grade / board, no credentials, no SQL).
- Output is length/structure-validated and sanitized through an HTML allowlist before storage;
  the client applies a second-pass sanitizer.
- Every request/response pair is persisted to `llm_requests` / `llm_responses` with provider,
  model, status, latency and token usage. Provider failures fall back to the offline narrative.

## Security (summary — full doc: [`docs/SECURITY.md`](docs/SECURITY.md))

- bcrypt(12) password hashing; JWT with DB-backed user re-check per request.
- **Ownership middleware on every student-data endpoint** — the audited IDOR class is closed.
- Parent access requires a `linked` mapping with recorded student consent (`pending_student_approval` → `linked`).
- OTP: crypto-random 6 digits, SHA-256 stored, 10-min expiry, 5-attempt lockout, no
  self-registration, no role selection; disabled (501) in production until an SMS/email provider is wired.
- helmet (strict CSP), CORS allowlist, per-route rate limits, 256 KB body cap, parameterized SQL,
  real client IPs in audit logs, no secrets in code.

## Privacy (summary — full doc: [`docs/PRIVACY.md`](docs/PRIVACY.md))

Minimum-necessary collection; the LLM receives the student's first name, grade and board only.
Students control parent access. Demo data is flagged `is_demo` and labelled in the UI. Data
export exists for admins; per-student deletion endpoints are listed as the next privacy milestone
(see doc — no compliance claims are made beyond what is actually implemented).

## Local setup

```bash
# 1. Install (Node ≥ 22.5 required for node:sqlite)
npm install

# 2. Configure
cp .env.example .env        # then set JWT_SECRET (required in production)

# 3. Run migrations + seed the V1 battery + demo data
npm run seed

# 4. Start
npm start                   # http://localhost:5000
```

Demo logins (only when `SEED_DEMO_DATA=true`):

| Role | Email | Password |
|---|---|---|
| Admin | `admin@demo.psychometric-ai.local` | `Demo@12345` |
| Student | `aarav@demo.psychometric-ai.local` | `Demo@12345` |
| Parent | `sunita@demo.psychometric-ai.local` | `Demo@12345` |

Demo passwords are never written to server logs (privacy rule — §18 of the audit).

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `PORT` | no (5000) | HTTP port |
| `NODE_ENV` | no | `development` / `test` / `production` |
| `DB_PATH` | no | SQLite file path (dev/test) |
| `DATABASE_URL` | production | PostgreSQL URL (production path) |
| `JWT_SECRET` | **yes in production** | JWT signing key (dev auto-generates an ephemeral one) |
| `JWT_EXPIRES_IN` | no | default `7d` |
| `LLM_PROVIDER` | no | `gemini` / `openai` / `offline` (auto-detected if unset) |
| `LLM_MODEL` | no | default `gemini-2.0-flash` |
| `GEMINI_API_KEY` / `OPENAI_API_KEY` | if provider set | LLM credentials |
| `LLM_TIMEOUT_MS` | no | provider hard timeout (default 30000) |
| `FRONTEND_URL` / `BACKEND_URL` | no | CORS allowlist origins |
| `SEED_DEMO_DATA` | no | seed labelled demo dataset (`false` for production) |

## Database

- Dev/test: SQLite (WAL, foreign keys ON) via `node:sqlite` — zero native deps.
- Production: **PostgreSQL is supported and verified.** Set `DB_DRIVER=postgres` +
  `DATABASE_URL`; the driver-agnostic data layer (`backend/src/config/db.js`) handles
  dialect rewrites (`datetime('now')`, `?`→`$n`, int8/numeric parsing, NaN→NULL) while the
  application sees identical value semantics on both engines. The full 153-check live HTTP
  verification suite passes against real PostgreSQL (`node scripts/run-pg-verify.js`; CI runs
  the same suites with a `postgres:17` service).
- Migrations: forward-only, dialect-aware SQL files in `backend/migrations`
  (`*.sql` for SQLite, `*.pg.sql` for PostgreSQL), tracked in `schema_migrations`.
- Never commit `*.db` files (see `.gitignore`).

## Running tests

```bash
npm test              # 72 tests: unit + integration + security (isolated per-process DBs)
npm run test:unit
npm run test:integration
npm run test:security
npm run lint          # ESLint (flat config)
npm run build         # verification build: syntax checks, asset refs, URL audit, manifest
```

Final-audit verification scripts (used to produce the FINAL_AUDIT/TEST/SECURITY reports):

```bash
node scripts/verify-db.js              # §3  migrations from zero + schema introspection
node scripts/final-verify-engines.js   # §7-14,21,22 hand-calculated engine vectors
node scripts/final-verify-live-a.js    # §4,5,6,19,31-A live HTTP auth/authz/assessment
node scripts/final-verify-live-b.js    # §15-20,22,31-B/C LLM boundary, privacy, reports
node scripts/run-pg-verify.js          # the two live suites against real embedded PostgreSQL
```

## Production hardening

| Capability | How | Doc |
|---|---|---|
| PostgreSQL | `DB_DRIVER=postgres` + `DATABASE_URL` | `docs/DEPLOYMENT.md` §3 |
| OTP delivery | Twilio / SMTP / generic webhook providers (fail-closed 501 without one) | `docs/DEPLOYMENT.md` §4 |
| LLM spend control | daily request cap + monthly token budget + cost estimate (Admin → LLM → Usage & quota) | `docs/DEPLOYMENT.md` §5 |
| Containers | `Dockerfile` + `docker-compose.yml` (web + api + postgres + redis + caddy) | `docs/DEPLOYMENT.md` §1 |
| CI | GitHub Actions: lint + 72 tests + build + PG integration suites | `.github/workflows/ci.yml` |
| Backups | `scripts/backup-db.sh` / `restore-db.sh` (both drivers, atomic) | `docs/DEPLOYMENT.md` §3 |
| Error tracking | optional Sentry (`SENTRY_DSN`, PII-scrubbing beforeSend) | `docs/DEPLOYMENT.md` §6 |
| Multi-instance rate limits | `REDIS_URL` → shared Redis store | `docs/DEPLOYMENT.md` §7 |
| Data retention / DPDP | retention job + timer + subject access & erasure endpoints | `docs/PRIVACY.md` §6-8 |

## Deployment (outline)

Full runbook: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

1. Provision PostgreSQL; set `DB_DRIVER=postgres` + `DATABASE_URL`.
2. Set `NODE_ENV=production`, a strong `JWT_SECRET`, `FRONTEND_URL`/`BACKEND_URL` for CORS.
3. `SEED_DEMO_DATA=false`; migrations apply automatically on boot (or `npm run migrate`).
4. Configure OTP delivery (Twilio/SMTP/webhook) — registrations fail closed without it.
5. Serve behind TLS-terminating reverse proxy (`app.set('trust proxy', 1)` is enabled) —
   or use the provided `docker compose up -d --build` stack with Caddy auto-TLS.
6. Set `LLM_PROVIDER` + key (plus `LLM_DAILY_MAX_REQUESTS`), or run `offline` for
   zero-dependency deterministic narratives.

## Known limitations

See [`docs/PSYCHOMETRIC_LIMITATIONS.md`](docs/PSYCHOMETRIC_LIMITATIONS.md). Highlights:
screening-depth battery (not a validated instrument), no normative percentiles, fixed-form only
(CAT/IRT is an interface-level roadmap), no reverse-scored items, reports are LLM-explained but
engine-scored. DPDP §13 nomination and self-service erasure are documented follow-ups
(`docs/PRIVACY.md` §9).

## Future CAT/IRT roadmap

`FixedAssessmentStrategy` implements the assessment-strategy interface; an
`AdaptiveIRTStrategy` (2PL/3PL, theta estimation, item-information selection, stopping rule)
can replace it without touching controllers or engines. Correct 3PL math primitives already
exist in `backend/src/services/psychometrics/catIrtLab.js` (clearly labelled non-production).
