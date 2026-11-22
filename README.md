# Psychometric AI — Grade 10 Educational Stream & Career Guidance Platform

An educational guidance platform for Grade 10 students: a **deterministic psychometric engine** computes every score, while a **sandboxed LLM narrative layer** (Google Gemini) turns structured results into compassionate, plain-language reports. Parents complete a separate Expectation & Perception inventory, and a neutral congruence engine highlights family discussion topics without loaded or judgmental language.

> **What this product is NOT:** It does not diagnose clinical mental health, does not clinically assess personality, does not guarantee career outcomes, and does not replace qualified school counsellors. Reports use the language of *exploration and fit*: "strong fit", "possible fit", "explore further", and "areas to consider".

---

## 1. System Architecture

```
                                      PUBLIC INTERNET
                                            │
                                ┌───────────▼───────────┐
                                │   Reverse Proxy / TLS │
                                │   (Caddy / Cloudflare)│
                                └───────────┬───────────┘
                                            │
                                            ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          ALL-IN-ONE CONTAINER (Port 3000)                        │
│                                                                                 │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │  Next.js 16 (React 19) Product Frontend (Public: $PORT)                  │   │
│   │  - Candidate, Parent, and Admin Spaces                                   │   │
│   │  - Editorial Design System (Warm Paper & Deep Teal)                     │   │
│   │  - Server-side /api bridge forwards requests to 127.0.0.1:4000          │   │
│   └────────────────────────────────────┬────────────────────────────────────┘   │
│                                        │ Internal Loopback (127.0.0.1:4000)     │
│   ┌────────────────────────────────────▼────────────────────────────────────┐   │
│   │  Express 5 Psychometric Core API                                         │   │
│   │  ├─ RBAC + Consent-based ownership middleware                           │   │
│   │  ├─ Deterministic Psychometric Engine (Difficulty-weighted Aptitude,   │   │
│   │  │   Holland RIASEC Hexagon, Composite Grit, 7-Stream Fit Weights)       │   │
│   │  ├─ LLM Narrative Layer (Gemini 3.8 Flash / Offline Template)           │   │
│   │  └─ DPDP-compliant data retention & erasure                             │   │
│   └────────────────────────────────────┬────────────────────────────────────┘   │
└────────────────────────────────────────┼────────────────────────────────────────┘
                                         │
                                ┌────────▼────────┐
                                │ PostgreSQL 17   │
                                │ (Managed / VPS) │
                                └─────────────────┘
```

**Hard Architectural Rule:** The LLM *never* sees, calculates, or mutates numerical scores. If optional student data is missing, the system reports it as "not measured" — nothing is ever silently fabricated.

---

## 2. Quick Start (Local Development)

### Prerequisites
- **Node.js**: v22.5.0 or higher (v24 LTS recommended)
- **npm** or **bun**

### 1. Install Dependencies
```bash
# Install frontend dependencies
npm install

# Install backend dependencies
cd psychometric-ai && npm install && cd ..
```

### 2. Configure Environment
```bash
cp .env.example .env
```
*(In local development, the backend automatically generates an ephemeral JWT secret and uses SQLite at `./data/psychometric.db` if no PostgreSQL is configured).*

### 3. Run Development Servers
```bash
# Starts both the backend API (http://localhost:4000) and Next.js frontend (http://localhost:3000)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

#### Demo Credentials (when `SEED_DEMO_DATA=true`):
- **Candidate:** `aarav@demo.psychometric-ai.local` / `Demo@12345`
- **Parent:** `sunita@demo.psychometric-ai.local` / `Demo@12345`
- **Admin:** `admin@demo.psychometric-ai.local` / `Demo@12345`

---

## 3. Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Starts both backend API and frontend UI concurrently |
| `npm run dev:fe` | Starts the Next.js frontend alone (port 3000) |
| `npm run dev:be` | Starts the Express backend alone (port 4000) |
| `npm run build` | Builds the Next.js standalone application and bundles static assets |
| `npm run start` | Runs the compiled Next.js standalone server in production |
| `npm run typecheck` | Validates TypeScript types across `/src` without emitting code |
| `npm test` | Runs the backend unit, integration, and security test suites (67 tests) |
| `npm run db:migrate` | Runs idempotent SQL migrations against PostgreSQL or SQLite |
| `npm run db:seed` | Seeds assessment battery V1, scoring profiles, and demo accounts |
| `npm run deploy:cf` | Deploys the frontend to Cloudflare Workers via `@opennextjs/cloudflare` |

---

## 4. Deployment Blueprints

### Option A: Render (Recommended — Zero CLI)
The entire stack runs as **one web service + one managed database** defined in `render.yaml`:
1. Push this repository to GitHub.
2. In [Render Dashboard](https://dashboard.render.com), click **New + → Blueprint** and select your repository.
3. Render creates the `psychometric-app` service (`Dockerfile.all-in-one`) and `psychometric-db` (Postgres).
4. Provide `GEMINI_API_KEY` when prompted (or leave blank for offline narrative fallback).
5. Migrations and battery seeds apply automatically on first boot.

### Option B: Railway (~$5/mo Always-on)
1. Go to [Railway](https://railway.com) → **New Project → Deploy from GitHub repo**.
2. Railway reads `railway.json` and builds `Dockerfile.all-in-one`.
3. Add a **PostgreSQL** database service within the same project.
4. Set environment variables on the app service:
   - `DB_DRIVER=postgres`
   - `DATABASE_URL=${{Postgres.DATABASE_URL}}`
   - `JWT_SECRET=<generate-random-48-hex-string>`
   - `GEMINI_API_KEY=<your-key>`

### Option C: Fly.io (CLI)
```bash
fly launch --dockerfile Dockerfile.all-in-one --name psychometric-app --region bom
fly postgres create --name psychometric-db --region bom
fly postgres attach psychometric-db --app psychometric-app
fly secrets set JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))") DB_DRIVER=postgres
fly deploy
```

### Option D: VPS with Docker Compose
```bash
cp .env.example .env
# Edit .env with your domain, POSTGRES_PASSWORD, and JWT_SECRET
docker compose up -d --build
```
*(Spins up Caddy TLS terminator + Next.js web + Express API + PostgreSQL 17 + Redis)*.

---

## 5. Security & Privacy Controls

- **Authentication:** Passwords hashed with `bcrypt(12)`. Constant-shape timing equalization prevents username enumeration.
- **OTP Verification:** Cryptographically random 6-digit codes with SHA-256 storage, 10-minute expiry, and a 5-attempt lockout. Production enforces fail-closed behavior (501) unless Twilio, SMTP, or Webhooks are configured.
- **Authorization:** Strict RBAC (`candidate`, `parent`, `admin`) enforced by server-side relationship middleware. Parents cannot access child assessments until the student grants explicit consent.
- **LLM Safety:** Hardened system prompts prevent prompt injection; HTML responses undergo dual server/client sanitization; full audit trail stored in `llm_requests`.
- **Data Protection (DPDP §8/§11):** Admin console includes self-service user data export and irreversible identity erasure while preserving statistical assessment records.

---

## 6. Directory Structure

```
.
├── deploy/                     # Deployment entrypoints and reverse proxy configs
│   ├── caddy/                  # Production Caddyfile for VPS
│   ├── fly/                    # Fly.io blueprint
│   └── start-all.sh            # All-in-one container process supervisor
├── docs/                       # Architecture and hosting documentation
│   └── HOSTING.md              # Beginner step-by-step hosting guide
├── psychometric-ai/            # Express psychometric core & deterministic engines
│   ├── backend/
│   │   ├── migrations/         # Dialect-aware SQL migrations (.sql & .pg.sql)
│   │   ├── seeds/              # Battery V1, 7 stream profiles, demo datasets
│   │   ├── src/                # Controllers, repositories, scoring engines, LLM
│   │   └── tests/              # 67 unit, integration, and security test suites
│   └── frontend/               # Legacy fallback vanilla JS UI (reference)
├── public/                     # Static icons and assets
├── scripts/                    # Development runners and packaging utilities
│   ├── copy-standalone.js      # Cross-platform asset bundler
│   └── dev-all.js              # Concurrent full-stack local runner
├── src/                        # Modern Next.js 16 (React 19) Frontend
│   ├── app/                    # Next.js App Router & server-side API bridge
│   ├── components/psych/       # Bespoke design system, charts, and navigators
│   ├── lib/                    # Typed API client, session context, formatting
│   └── views/                  # Candidate, Parent, Admin, Assessment, Report views
├── Dockerfile.all-in-one       # Production image packaging web + api
├── docker-compose.yml          # Production VPS stack with Postgres, Redis & Caddy
└── render.yaml                 # Render Blueprint configuration
```

---

## 7. License

MIT License. See [LICENSE](LICENSE) for details.

