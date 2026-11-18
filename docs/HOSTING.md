# Psychometric AI — Host Everything on ONE Platform (Beginner Guide)

This guide answers one question: **"Where can I host the whole product —
frontend + backend + database — in one place, without a VPS?"**

Answer: **Render, Railway, or Fly.io.** All three can run the complete stack
from this single zip. No VPS, no manual TLS, no server admin.

---

## 1. Which platform should I pick?

| Platform | Free tier? | Always-on? | Difficulty | Best for |
|---|---|---|---|---|
| **Render** (recommended) | Web service: free (sleeps when idle) · Postgres: free 30 days | Paid: $7/mo | Easiest — no CLI, clicks only | First deployment, demos |
| **Railway** | $5 one-time trial credit | Paid: ~$5/mo usage | Easy — no CLI needed | Cheapest always-on |
| **Fly.io** | No (needs card, pay-as-you-go) | ~$2–3/mo for a tiny VM | Medium — uses a CLI | Lowest long-term cost |
| Cloudflare (zip already delivered) | Generous free | Yes | Hard split — frontend only; backend must live elsewhere | Not for full-stack |
| VPS + docker-compose (zip already delivered) | No (~$4–6/mo VPS) | Yes | Medium | Full control, own domain/TLS |

**Recommendation:** start with **Render** (Option A). It is the closest to
"press one button". Move to Railway or Fly later if you want always-on
without Render's idle sleeping.

**How it works on all three:** ONE container runs BOTH servers (Next.js
frontend on the public port + Express psychometric API on an internal port,
talking over 127.0.0.1), plus ONE managed PostgreSQL provided by the
platform. The container is defined in `Dockerfile.all-in-one`; the startup
script is `deploy/start-all.sh`. Migrations run automatically on every boot.

---

## 2. What is inside this zip (deployment files)

| File | Purpose |
|---|---|
| `Dockerfile.all-in-one` | Builds ONE image: frontend + backend together |
| `deploy/start-all.sh` | Container entrypoint: starts API then web, handles port collisions |
| `render.yaml` | Render Blueprint — describes the whole stack in one file |
| `railway.json` | Railway build/deploy settings (all-in-one service) |
| `psychometric-ai/railway.json` | Railway settings for the optional split deployment |
| `deploy/fly/fly.toml` | Fly.io sample config |
| `Dockerfile` + `psychometric-ai/Dockerfile` | Separate images (used by docker-compose on a VPS, or the split option) |
| `docker-compose.yml` + `Caddyfile` | Full VPS stack (web + api + postgres + redis + caddy) |
| `.env.example` | Every environment variable documented |
| `psychometric-ai/` | The Express backend: engines, migrations, seeds, docs, tests |
| `DEPLOYMENT-CLOUDFLARE.md` | The earlier Cloudflare (frontend-only) path |

---

## 3. Before you deploy — 10-second checklist

You need exactly three things:

1. **This code in a GitHub repo** (Render/Railway deploy straight from GitHub).
2. **A Gemini API key** (optional) — free at <https://aistudio.google.com/apikey> —
   free tier = 20 requests/day; without it reports use the offline narrative
   template (scores are never affected).
3. **Patience for the first build** (~5–10 min; later deploys are faster).

Demo login (only if `SEED_DEMO_DATA=true`): `aarav@demo.psychometric-ai.local`
/ `Demo@12345`.

---

## 4. Option A — Render (recommended, no CLI)

1. Create a free account at <https://render.com> (GitHub login works).
2. Push this project to a **public or private GitHub repo**
   (do NOT commit any `.env` file — secrets go in the dashboard).
3. Dashboard → **New + → Blueprint** → select your repo.
   Render finds `render.yaml` and shows what it will create:
   one web service `psychometric-app` + one database `psychometric-db`.
4. When prompted for **GEMINI_API_KEY**, paste your key — or leave empty
   (offline narratives; you can add the key later in Properties → Environment).
5. Click **Apply**. First build takes 5–10 minutes. Watch the logs — you
   should see migration lines, then `[start-all] api -> 127.0.0.1:4000`.
6. Open your URL (`https://psychometric-app.onrender.com`) and verify:
   - the homepage loads,
   - `https://<your-url>/api/health` returns `"status":"healthy"`.
7. Log in with the demo account (SEED_DEMO_DATA is true on the first deploy),
   take a look around, then set **SEED_DEMO_DATA=false** (Environment tab →
   save → auto-redeploy) before real students use it.
8. Custom domain (optional): Render → Settings → Custom Domains — TLS is
   automatic.

**Render free-tier reality:** the free web service sleeps after ~15 min idle;
the next visitor waits ~50 seconds (cold start). The free Postgres is deleted
after 30 days — upgrade the database to **basic-256 ($6/mo)** for real use.
Service plan **starter ($7/mo)** = always-on.

---

## 5. Option B — Railway (~$5/mo, always-on, no CLI)

1. <https://railway.com> → sign in with GitHub → **New Project**.
2. **Deploy from GitHub repo** → pick this repo. Railway reads `railway.json`
   and builds `Dockerfile.all-in-one` automatically.
3. In the same project click **+ Create → Database → PostgreSQL**.
4. Open your app service → **Variables** and add:

   | Variable | Value |
   |---|---|
   | `DB_DRIVER` | `postgres` |
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (reference to the database service) |
   | `JWT_SECRET` | long random string (`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`) |
   | `GEMINI_API_KEY` | your key (or skip) |
   | `LLM_DAILY_MAX_REQUESTS` | `20` |
   | `SEED_DEMO_DATA` | `true` for the first look, then `false` |

5. **Settings → Networking → Generate Domain** → Railway gives you an HTTPS URL.
6. Verify `/api/health`, log in with the demo account, then flip
   `SEED_DEMO_DATA` to `false`.

Railway notes: the $5 trial credit covers a few days; after that the Hobby
plan ($5/mo) covers a small school's traffic comfortably. Railway's Postgres
backups are built in (Backups tab).

**Split option (advanced):** if you later want the frontend and backend to
scale independently, create a SECOND service from the same repo with
**Root Directory = `psychometric-ai`** (its own `railway.json` + Dockerfile
apply automatically), give it the same Postgres variables, and set the web
service variable `PSYCHOMETRIC_BACKEND_URL` to the API service's internal URL
(`http://<api-service-name>.railway.internal:4000`). The all-in-one mode
needs none of this.

---

## 6. Option C — Fly.io (CLI, cheapest always-on)

```bash
# once: install flyctl (https://fly.io/docs/flyctl/install), then
fly auth signup                       # or fly auth login

# from the project root:
fly launch --dockerfile Dockerfile.all-in-one --name psychometric-ai-app --region bom --no-deploy
# (bom = Mumbai; pick your closest region, e.g. sin/blr/del)

fly postgres create --name psychometric-ai-db --region bom
fly postgres attach psychometric-ai-db --app psychometric-ai-app
#   ^ sets DATABASE_URL automatically

fly secrets set JWT_SECRET=$(openssl rand -hex 48) \
    DB_DRIVER=postgres \
    SEED_DEMO_DATA=false \
    GEMINI_API_KEY=YOUR_KEY_HERE      # or skip for offline narratives

fly deploy                            # build + migrate + start
fly status && curl https://psychometric-ai-app.fly.dev/api/health
```

Fly runs on pay-as-you-go: a shared-CPU 512 MB machine is roughly $2–3/month;
Postgres similar. You can copy `deploy/fly/fly.toml` to the repo root to pin
region/machine settings.

---

## 7. Environment variables (master checklist)

**Required**

| Variable | Value |
|---|---|
| `DB_DRIVER` | `postgres` |
| `DATABASE_URL` | provided by the platform (Render/Railway auto; Fly via `postgres attach`) |
| `JWT_SECRET` | long random string — required or boot fails in production |
| `NODE_ENV` | `production` |

**LLM narrative layer**

| Variable | Value |
|---|---|
| `LLM_PROVIDER` | `auto` (uses the Gemini key when present) |
| `LLM_MODEL` | `gemini-3.8-flash` (2.0 was retired by Google) |
| `GEMINI_API_KEY` | your key; empty = offline template (honest fallback) |
| `GEMINI_BASE_URL` | only if your server's region blocks Gemini — point it at a relay |
| `LLM_DAILY_MAX_REQUESTS` | `20` (free tier) |
| `LLM_MONTHLY_TOKEN_BUDGET` | `0` (unlimited) or a token cap |

**OTP (real registrations)**

| Variable | Value |
|---|---|
| `OTP_PROVIDER` | `console` = DEV ONLY (send-otp fails closed with 501 in production) |
| | `twilio` needs `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM_NUMBER` |
| | `smtp` needs `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` |
| | `webhook` needs `OTP_WEBHOOK_URL` / `OTP_WEBHOOK_SECRET` (covers MSG91, SNS, ...) |

**Data**

| Variable | Value |
|---|---|
| `SEED_DEMO_DATA` | `true` once to explore, then `false` |
| `SENTRY_DSN` | optional error tracking |
| `RETENTION_LLM_DAYS` / `RETENTION_AUDIT_DAYS` / `RETENTION_OUTBOX_DAYS` | `180` / `365` / `90` |

TLS note: managed Postgres usually needs encryption — the backend enables it
automatically when `DB_SSL=true` or the URL contains `sslmode=require`
(internal platform URLs need neither; both work out of the box).

---

## 8. First-deploy verification (2 minutes)

1. `<your-url>/api/health` → `"status":"healthy"`, `"database":{"driver":"postgres"}`.
2. Homepage loads, log in as the demo student (if seeded).
3. Take any assessment quickly or open an existing demo report → narrative
   text renders (Gemini or offline template — both are correct).
4. Admin → **LLM → Usage & quota** shows request counts (if a key is set).
5. Then set `SEED_DEMO_DATA=false` and let it redeploy.

---

## 9. Gotchas (read once)

- **Migrations run on boot** — every deploy is schema-safe; no manual step.
- **Seed only what you need** — demo accounts are flagged `is_demo`; still
  flip `SEED_DEMO_DATA=false` for real use.
- **Free tiers sleep** — Render free = ~50 s wake-up; Railway/Fly paid = always-on.
- **Render free Postgres dies after 30 days** — upgrade before real data.
- **Rotate the Gemini key** you shared earlier (it appeared in chat).
- **Gemini geo-blocks some regions** — if your instance logs 403/geo errors,
  set `GEMINI_BASE_URL` to a small relay, or accept offline narratives.
- **OTP is fail-closed by design** — production registration won't send codes
  until Twilio/SMTP/webhook credentials exist.
- **One port, two servers** — never set `PORT=4000`; the start script shifts
  the API to 4001 automatically if that ever happens.
- **Backups** — Railway/Render/Postgres providers offer backups; on Fly add
  `fly postgres` snapshots. For a VPS, `psychometric-ai/scripts/backup-db.sh`.
- **Scaling** — all-in-one scales web+api together, which is exactly right
  for a school-sized load; split later only if you truly need it.

---

## 10. Costs at a glance (India context, ~2026 pricing)

| Setup | Monthly | Notes |
|---|---|---|
| Render free + free PG | **₹0** | sleeps; PG 30-day limit; demos only |
| Render starter + basic-256 PG | ~$13 (≈₹1,100) | always-on, real use |
| Railway Hobby | ~$5–8 (≈₹450–700) | always-on, small school traffic |
| Fly.io tiny VM + PG | ~$4–6 (≈₹350–500) | cheapest always-on |
| VPS + compose (delivered earlier) | ~$4–6 VPS | most control, manual setup |

LLM cost: Gemini free tier (20 requests/day) covers roughly 10–20 reports a
day — fine for demos and small pilots; paid Gemini or `LLM_DAILY_MAX_REQUESTS`
tuning when you scale.
