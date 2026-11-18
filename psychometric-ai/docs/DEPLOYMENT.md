# DEPLOYMENT.md — production runbook

This runbook takes the stack from "pilot on one box" to a hardened public
deployment. Read `docs/ARCHITECTURE.md` first for the data-flow invariants
(deterministic engines own every score; the LLM only explains).

---

## 1. Topology

```
            ┌──────────── caddy (:80/:443, auto-TLS) ────────────┐
            │                      │                             │
      web (Next.js :3000)    api (Express :4000)          [internal net only]
      product UI, proxies    deterministic engines,
      /api in dev            RBAC, audit, LLM boundary
                               │            │              │
                        PostgreSQL 17   Redis 7      Sentry (optional)
                        source of truth  shared rate limits
```

- **Single box (pilot):** SQLite + in-memory rate limits. Skip Redis.
- **Public launch (recommended):** `docker compose up -d --build` — the compose
  file wires web + api + postgres + redis + caddy with healthchecks.

## 2. Environment

Copy `.env.example` → `.env` and set at minimum:

| Variable | Why |
|---|---|
| `JWT_SECRET` | 48-byte random; sessions fail closed without it in production |
| `DB_DRIVER=postgres` + `DATABASE_URL` | spec-mandated production driver |
| `POSTGRES_PASSWORD` (compose) | database credential |
| `OTP_PROVIDER` + provider creds | real registrations need deliverable OTPs |
| `SEED_DEMO_DATA=false` | never seed demo accounts in production |

Generate a strong secret: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`

## 3. Database

### Migrations
Forward-only and dialect-aware: SQLite runs `migrations/*.sql`, PostgreSQL runs
`migrations/*.pg.sql`. They apply automatically on server boot (or run
`npm run migrate`). Safe to run repeatedly.

### PostgreSQL notes (value parity guarantees)
- Timestamps are TEXT in UTC `YYYY-MM-DD HH:MM:SS` on BOTH engines — lexicographic
  comparisons are identical; no timezone drift between environments.
- The pg driver rewrites `datetime('now')` → `to_char(now() AT TIME ZONE 'UTC', …)`,
  parses int8/numeric results as JS numbers, and maps `NaN`/`undefined` params to
  NULL — application code sees identical value semantics on both engines.
- Booleans remain INTEGER 0/1; `REAL` maps to `DOUBLE PRECISION`.
- Verified: the full 153-check live HTTP suite (auth, RBAC matrix, assessment
  lifecycle, SQLi/XSS/injection, LLM boundary, report-vs-DB number equality,
  parent/admin journeys) passes against real PostgreSQL via
  `node scripts/run-pg-verify.js` (CI runs the same suites with a pg service).

### Backups
```bash
./scripts/backup-db.sh /var/backups/psychometric   # atomic (VACUUM INTO / pg_dump -Fc)
./scripts/restore-db.sh backups/psychometric-...   # interactive, requires REPLACE
```
Cron (daily 02:00, keep 14): see header comment in `scripts/backup-db.sh`.
**Verify restores quarterly** — a backup you haven't restored is a hope, not a plan.

## 4. OTP delivery (required before public registration)

| Provider | Env vars | Notes |
|---|---|---|
| `twilio` | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` | REST API, 15s timeout |
| `smtp` | `SMTP_HOST/PORT/USER/PASS/FROM` | nodemailer; port 465 = implicit TLS |
| `webhook` | `OTP_WEBHOOK_URL`, `OTP_WEBHOOK_SECRET` | generic POST `{recipient, channel, message}` — covers MSG91, SNS-via-Lambda, corporate relays |

Fail-closed guarantee: with `OTP_PROVIDER=console` (or unset) production returns
**501** on `/auth/send-otp` rather than pretending to send. Every attempt is
audited in `notification_outbox` with a MASKED recipient — the code itself is
never logged, stored, or returned. Rate limit: 5 OTPs / 15 min / IP.

## 5. LLM narrative layer (Gemini)

**Wiring a key (free tier works):** get a key at https://aistudio.google.com/apikey → set
`GEMINI_API_KEY` (and optionally `LLM_PROVIDER=gemini`). `LLM_PROVIDER=auto` resolves to
gemini automatically once the key is present; without any key the deterministic offline
template is used. `LLM_MODEL` defaults to **gemini-3.8-flash** (gemini-2.0-flash was
retired by Google — older envs must update).

**Free-tier budget:** `gemini-3.8-flash` allows ~**20 generate requests/day** on the free
tier (one report = 1–3 calls, so roughly 10–20 reports/day). Set
`LLM_DAILY_MAX_REQUESTS=20` to stay inside it. When the key's quota runs out (HTTP 429)
or any provider error occurs, the pipeline **fails soft**: the report still ships with the
deterministic offline narrative, scores untouched, and the attempt is audited in
`llm_requests/llm_responses` (status `fallback`). Paid tier raises the cap — set the
new limit via env, no code change.

**Geo-restricted servers:** the free tier is unavailable in some regions (e.g. Hong Kong
egress). Point `GEMINI_BASE_URL` at your own relay that forwards to
`generativelanguage.googleapis.com` (path shape preserved) — the backend then works
unchanged. Leave it empty for the official endpoint.

**Verification without spending quota:** `node scripts/mock-gemini-e2e.js` boots a local
mock of the Gemini API and proves the whole live path (provider call → narrative
validation → storage → audit rows → payload boundaries).

**Spend control:** `LLM_DAILY_MAX_REQUESTS` / `LLM_MONTHLY_TOKEN_BUDGET` skip the
provider when limits trip (fail-soft, never touching scores). Usage, tokens, estimated
cost and quota status: **Admin → LLM tab → Usage & quota** (`GET /api/admin/llm/usage`),
backed by the mandatory llm_requests / llm_responses audit trail. Estimated cost uses a
built-in per-model price table; override with `LLM_PRICE_JSON`
(e.g. `{"gemini-3.8-flash":{"input_per_1k":0.01,"output_per_1k":0.04}}`).

## 6. Observability

- **Health:** `GET /api/health` → 200 healthy / 503 degraded, includes db
  driver+ping, LLM provider, OTP readiness, version, uptime. Point your uptime
  monitor (UptimeRobot / Better Stack / internal) at it — alert on 503 or on
  `database.ok=false` for 2 consecutive checks.
- **Errors:** set `SENTRY_DSN` — @sentry/node initializes lazily (no-op without
  DSN). 5xx errors and bootstrap failures are captured; beforeSend scrubs
  bodies, query strings, emails and phone numbers.
- **Logs:** structured console output → journald (systemd) or docker logs.
  `journalctl -u psychometric-api -f`

## 7. Multi-instance

Behind a load balancer:
1. `REDIS_URL` must be set — rate-limit counters move to Redis (in-memory
   stores are per-process and would multiply limits by instance count).
2. All instances share the same PostgreSQL + JWT_SECRET.
3. Report generation is synchronous; keep it that way until p95 completion
   exceeds ~3s, then introduce a queue (documented next step).

## 8. Data retention & DPDP compliance

- **Retention job:** `backend/scripts/retention.js` (`--dry-run` to preview).
  Deletes ONLY operational exhaust: LLM audit rows (180d), audit logs (365d),
  notification outbox (90d); optionally abandoned incomplete assessments.
  Never touches scores, reports, users or mappings. Schedule via
  `deploy/systemd/psychometric-retention.{service,timer}` (03:17 daily) or run
  from Admin → Governance.
- **Subject access (§11 DPDP):** `GET /api/admin/users/:id/export` — portable
  JSON of every row tied to a data principal.
- **Erasure (§12 DPDP):** `POST /api/admin/users/:id/erase` — anonymizes
  identity (email → `deleted-user-<id>@anonymized.invalid`, scrubs name/DOB/
  school/comments/OTP hashes) while PRESERVING psychometric records and
  security history. Admins cannot erase themselves or other admins.
- **Privacy notice:** `docs/PRIVACY.md` (DPDP Act 2023 mapped: notice, consent,
  purpose limitation, retention schedule, principal rights, grievance officer).
  Before launch: fill in the grievance-officer contact and publish the notice
  at your public URL; review with counsel for your specific processing.

## 9. Deploy checklist

- [ ] `.env` complete (JWT_SECRET, DB, OTP, SEED_DEMO_DATA=false)
- [ ] `docker compose up -d --build` (or systemd units) — health returns 200
- [ ] `GET /api/health` wired to an uptime monitor
- [ ] Backups cron installed + first restore rehearsed
- [ ] Retention timer installed (`--dry-run` verified)
- [ ] OTP provider live (send a real code to a real phone)
- [ ] LLM key configured + `LLM_DAILY_MAX_REQUESTS` set (or offline mode accepted)
- [ ] SENTRY_DSN set (or documented decision to rely on journald)
- [ ] DPDP privacy notice published + grievance officer reachable
- [ ] Demo logins disabled (SEED_DEMO_DATA=false verified)
- [ ] TLS: caddy obtains certificates automatically; check `caddy logs`
