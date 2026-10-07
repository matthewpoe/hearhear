#!/usr/bin/env bash
# Record the demo's lessons from the live tutor: `make capture-lessons`
# (CONFIRM=1 skips the question). See content/lessons/README.md.
#
# Two ways to run it:
# - Locally (the default): needs ANTHROPIC_API_KEY and TUTOR_ACCESS_CODE. It
#   starts the server in live mode on a free local port and stops it when the
#   script exits.
# - Against the deployed site: set TUTOR_URL. It needs only TUTOR_ACCESS_CODE,
#   sent as the passphrase header, and starts no server.
#
# Both values come from the caller's shell environment only. This script never
# reads .env and never prints either value.
set -euo pipefail

missing=()
if [ -z "${TUTOR_URL:-}" ]; then
  [ -n "${ANTHROPIC_API_KEY:-}" ] || missing+=(ANTHROPIC_API_KEY)
fi
[ -n "${TUTOR_ACCESS_CODE:-}" ] || missing+=(TUTOR_ACCESS_CODE)
if [ ${#missing[@]} -gt 0 ]; then
  echo "capture-lessons: set ${missing[*]} in your shell environment first (export each; neither is read from a file)." >&2
  exit 1
fi

echo "Recording content/lessons/plan.json from ${TUTOR_URL:-a local live server}."
node scripts/capture-lessons.js --estimate
echo "Each saved lesson overwrites its file in content/lessons/recorded/."

if [ "${CONFIRM:-}" != "1" ]; then
  if [ -t 0 ]; then
    read -r -p "Send them now? Type yes to go on: " answer
    [ "$answer" = "yes" ] || { echo "Stopped before sending anything."; exit 0; }
  else
    echo "Stopped before sending anything. Run \`make capture-lessons CONFIRM=1\` to send them."
    exit 0
  fi
fi

if [ -n "${TUTOR_URL:-}" ]; then
  node scripts/capture-lessons.js --url "$TUTOR_URL"
  exit
fi

port=$(uv run --no-env-file python -c 'import socket; s = socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1])')
url="http://127.0.0.1:${port}"

TUTOR_MODE=live \
  TUTOR_RATE_LIMIT="60/minute;1000/day" \
  TUTOR_DAILY_TOKEN_BUDGET=2000000 \
  uv run --no-env-file uvicorn hearhear.app:app --app-dir server --host 127.0.0.1 --port "$port" \
  --log-level warning &
server=$!
trap 'kill "$server" 2>/dev/null || true; wait "$server" 2>/dev/null || true' EXIT INT TERM

for _ in $(seq 60); do
  if curl -fsS "${url}/api/health" 2>/dev/null | grep -q '"tutor_mode":"live"'; then break; fi
  if ! kill -0 "$server" 2>/dev/null; then
    echo "capture-lessons: the server exited before it was ready (see its output above)." >&2
    exit 1
  fi
  sleep 0.5
done
curl -fsS "${url}/api/health" 2>/dev/null | grep -q '"tutor_mode":"live"' || {
  echo "capture-lessons: the server at ${url} did not report live mode within 30 seconds." >&2
  exit 1
}

echo "Live server on ${url}."
node scripts/capture-lessons.js --url "$url"
