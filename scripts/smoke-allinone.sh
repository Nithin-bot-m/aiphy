#!/bin/sh
# ---------------------------------------------------------------------
# Psychometric AI — ALL-IN-ONE local verification (no Docker needed).
#
# Reproduces, in a staging directory, the exact runtime layout the
# Dockerfile.all-in-one image ships, then boots it and asserts the full
# path: web:$PORT -> /api proxy -> 127.0.0.1:$API_PORT -> sqlite engine.
#
# Usage:  sh scripts/smoke-allinone.sh [PORT] [API_PORT]
# Prereq: npm run build  (creates .next/standalone)
# ---------------------------------------------------------------------
set -eu

PORT="${1:-3100}"
API_PORT="${2:-4400}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STG="${TMPDIR:-/tmp}/psych-allinone-smoke"

if [ ! -f "$ROOT/.next/standalone/server.js" ]; then
  echo "FAIL: .next/standalone/server.js missing — run 'npm run build' first"; exit 1
fi

rm -rf "$STG"; mkdir -p "$STG"
cp -a "$ROOT/.next/standalone/." "$STG/"
cp -a "$ROOT/psychometric-ai/node_modules/." "$STG/node_modules/"
cp -a "$ROOT/psychometric-ai/backend" "$STG/backend"
cp "$ROOT/deploy/start-all.sh" "$STG/start-all.sh"

LOG="$STG/boot.log"
cd "$STG"
PORT="$PORT" API_PORT="$API_PORT" NODE_ENV=production \
  JWT_SECRET="${JWT_SECRET:-smoke-test-secret-0123456789abcdef0123456789abcdef}" \
  DB_DRIVER=sqlite DB_PATH="$STG/smoke.db" \
  SEED_DEMO_DATA=true LLM_PROVIDER=offline \
  sh start-all.sh > "$LOG" 2>&1 &
SH_PID=$!

cleanup() { kill "$SH_PID" 2>/dev/null || true; pkill -P "$SH_PID" 2>/dev/null || true; }
trap cleanup EXIT INT TERM

echo "waiting for boot (staging: $STG)..."
ok=""
i=0
while [ $i -lt 60 ]; do
  if curl -sf "http://127.0.0.1:$PORT/api/health" > "$STG/health.json" 2>/dev/null; then ok=1; break; fi
  i=$((i+1)); sleep 1
done
if [ -z "$ok" ]; then echo "FAIL: no health response in 60s"; tail -30 "$LOG"; exit 1; fi
echo "health: $(head -c 160 "$STG/health.json")"

LOGIN=$(curl -sf -X POST "http://127.0.0.1:$PORT/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"identifier":"aarav@demo.psychometric-ai.local","password":"Demo@12345"}')
TOKEN=$(printf '%s' "$LOGIN" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d).data.token||'')}catch{console.log('')}})")
if [ -z "$TOKEN" ]; then echo "FAIL: demo login"; printf '%s\n' "$LOGIN" | head -c 300; exit 1; fi
echo "login: OK (token received)"

RES=$(curl -sf "http://127.0.0.1:$PORT/api/candidate/results" -H "Authorization: Bearer $TOKEN")
STREAMS=$(printf '%s' "$RES" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const r=JSON.parse(d).data.result;console.log((r.streams||[]).length+' streams, top: '+(((r.streams||[])[0]||{}).name||'-'))}catch(e){console.log('parse-error')}})")
echo "results: $STREAMS"

HOME=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/")
echo "homepage: HTTP $HOME"

if [ "$HOME" = "200" ]; then
  echo "ALL-IN-ONE SMOKE TEST: PASS (web:$PORT -> api:127.0.0.1:$API_PORT)"
else
  echo "ALL-IN-ONE SMOKE TEST: FAIL"; exit 1
fi
