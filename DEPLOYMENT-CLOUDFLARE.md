# DEPLOYMENT-CLOUDFLARE.md — Psychometric AI on Cloudflare

Read this first — it explains **what Cloudflare can and cannot host for this app**,
then gives the exact steps. Total time: ~30 minutes.

---

## 1. Architecture (honest version)

```
Browser ── same-origin /api/* ──> Cloudflare WORKER (Next.js product UI)
                                      │  server-side proxy (no CORS, hides backend)
                                      ▼
                          PSYCHOMETRIC_BACKEND_URL (any container host)
                          Express deterministic engines + PostgreSQL
```

**The frontend runs on Cloudflare Workers** (via the official
`@opennextjs/cloudflare` adapter — already configured: `wrangler.jsonc`,
`open-next.config.ts`, verified build).

**The backend CANNOT run on Workers.** It is an Express server that uses
`node:sqlite` (a native Node module) — Workers has no HTTP server and no native
SQLite. Do not try to force it. Three supported placements:

| Option | Where | Cost | Notes |
|---|---|---|---|
| **A (recommended)** | Any $5 VPS (Hetzner/DO) — existing `docker-compose.yml` stack | ~$5/mo | Follow `psychometric-ai/docs/DEPLOYMENT.md`; put Caddy on ports 80/443 |
| **B** | Railway / Fly.io container (`psychometric-ai/Dockerfile`) + Neon Postgres | ~$5/mo | No VPS to manage; Fly gives a `*.fly.dev` URL |
| **C (advanced)** | Cloudflare **Containers** (beta) | beta pricing | Works (it runs real Docker) but beta-grade; only if you want 100% Cloudflare |

**PostgreSQL**: Cloudflare does not host databases. Use **Neon** (free tier,
neon.tech) or Supabase for the app DB — the backend already runs
`DB_DRIVER=postgres` (spec-mandated) and its migrations auto-apply on boot.

---

## 2. Step-by-step

### Step 1 — Deploy the backend (Option A or B)

Option A: on your VPS, from the repo root:
```bash
cp .env.example .env    # set POSTGRES_PASSWORD, JWT_SECRET, GEMINI_API_KEY, OTP creds
docker compose up -d --build   # api + postgres + redis + caddy
```
Note the public API origin, e.g. `https://api.your-domain.in` (Caddy serves the
backend directly at `/api` — see `deploy/caddy/Caddyfile`).

Option B (Railway-style): deploy a container from `psychometric-ai/` with env:
`DB_DRIVER=postgres`, `DATABASE_URL=postgres://…@neon-host/db?sslmode=require`,
`JWT_SECRET=…`, `GEMINI_API_KEY=…`, `SEED_DEMO_DATA=false`.
Neon: create project → copy the pooled connection string.

Verify: `curl https://<backend>/api/health` → `"status":"healthy"`.
Run migrations once if your host doesn't run boot migrations:
`npm run migrate` (they are idempotent).

### Step 2 — Deploy the frontend to Cloudflare

```bash
# inside the unzipped repo root (has wrangler.jsonc + open-next.config.ts)
npm install
npx wrangler login                 # opens browser → authorize your CF account

# point the /api proxy at YOUR backend:
npx wrangler secret put PSYCHOMETRIC_BACKEND_URL
#   → paste: https://api.your-domain.in     (or edit "vars" in wrangler.jsonc and redeploy)

npm run deploy:cf                  # builds with OpenNext and deploys the Worker
```
Output: `https://psychometric-ai-web.<your-subdomain>.workers.dev`

### Step 3 — Verify

```bash
curl https://psychometric-ai-web.<subdomain>.workers.dev/api/health
# → {"success":true,"data":{"status":"healthy","database":{"ok":true,...}}}
```
Open the site, register a real account (OTP must be configured on the backend —
console provider fails closed 501 in production), complete an assessment, view
the report.

### Step 4 — Custom domain (optional)

In `wrangler.jsonc` uncomment `routes` with your domain (domain must be a zone
in your CF account), then `npm run deploy:cf`. TLS is automatic.

---

## 3. What everything costs (free tier reality)

| Piece | Free tier | Enough for |
|---|---|---|
| Cloudflare Workers (frontend) | 100k requests/day | A school-scale pilot |
| Neon Postgres | 0.5 GB, autosuspend | Thousands of assessments |
| Gemini API (your key) | **20 generate-requests/day** | ~10–20 reports/day; `LLM_DAILY_MAX_REQUESTS=20` keeps you inside it |
| Backend host | — | $0 only if you already have a VPS; otherwise ~$5/mo |

## 4. Why the split (and why it's a good thing)

- The **deterministic scoring core** (the part that must never be wrong or
  rate-limited) lives on a real Node host with a real PostgreSQL — full
  `pg`, transactions, `VACUUM`/backups.
- The **frontend edge** gets Cloudflare's global CDN, unlimited static asset
  serving, DDoS protection, and observability logs for free.
- The `/api` proxy runs **inside** the Worker (server-to-server fetch): the
  browser never learns the backend URL, CORS is bypassed by design, and the
  backend's origin allowlist stays closed.

## 5. Limits & gotchas (read once)

1. **`node:sqlite` / Express are Node-only** — never point the Worker at a
   "backend on Workers" idea; there is no such thing for this codebase.
2. **Neon autosuspend**: first request after idle takes ~1 s to wake the DB.
   Fine for this traffic profile; scale-to-always-on is a paid Neon tier.
3. **Worker CPU limits**: the proxy only streams JSON; report generation happens
   on the backend host, so Workers' 10 ms CPU budget is a non-issue.
4. **Secrets live on the backend** (JWT, OTP, Gemini). The Worker holds only
   `PSYCHOMETRIC_BACKEND_URL` — there are no credentials in the frontend.
5. Upgrading Next.js? Re-check `@opennextjs/cloudflare` peer range
   (`>=15.5.29 <16 || >=16.4.5`) — current pin: Next 16.4.6 + adapter 1.20.17.
6. Rebuild after every deploy: `npm run deploy:cf` is always **build + deploy**
   in one step; never deploy a stale `.open-next/`.

## 6. Checklist

- [ ] Backend deployed (VPS compose or Railway) — `/api/health` 200
- [ ] Neon (or other managed) PostgreSQL reachable; migrations applied
- [ ] Backend env: `JWT_SECRET`, `SEED_DEMO_DATA=false`, `OTP_PROVIDER` + real creds, `GEMINI_API_KEY`
- [ ] `wrangler login` done; `PSYCHOMETRIC_BACKEND_URL` set as secret/var
- [ ] `npm run deploy:cf` → Worker URL returns the landing page
- [ ] `/api/health` through the Worker returns backend `healthy`
- [ ] Custom domain bound (optional) — TLS automatic
- [ ] Uptime monitor on the Worker URL + backend `/api/health`
