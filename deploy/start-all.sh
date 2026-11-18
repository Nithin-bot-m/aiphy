#!/bin/sh
# ---------------------------------------------------------------------
# Psychometric AI — ALL-IN-ONE container entrypoint.
#
# Runs BOTH processes inside one container:
#   1. Express psychometric API  -> fixed INTERNAL port (default 4000)
#   2. Next.js standalone server -> the platform's public $PORT
#
# Why: platforms like Render / Railway / Fly.io expose exactly ONE port
# per service. The Next.js /api/* proxy talks to the API over 127.0.0.1,
# so the browser only ever sees one origin and CORS stays irrelevant.
#
# Collision guard: if the platform happens to set PORT=4000, the API
# shifts to 4001 and the proxy target is exported accordingly.
# ---------------------------------------------------------------------
set -eu

API_PORT="${API_PORT:-4000}"
if [ "$API_PORT" = "${PORT:-3000}" ]; then
  API_PORT=4001
fi
export PSYCHOMETRIC_BACKEND_URL="http://127.0.0.1:${API_PORT}"

echo "[start-all] api -> 127.0.0.1:${API_PORT} | web -> 0.0.0.0:${PORT:-3000}"

PORT="$API_PORT" node backend/src/server.js &
API_PID=$!

# The Dockerfile copies the standalone bundle CONTENTS into /app, so the
# server entrypoint is /app/server.js (with .next/ and public/ beside it).
node server.js &
NEXT_PID=$!

trap 'kill "$API_PID" "$NEXT_PID" 2>/dev/null || true' INT TERM

# Stay in the foreground on the web process; if it exits the container
# exits and the platform restarts it (API included).
wait "$NEXT_PID"
