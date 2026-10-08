#!/usr/bin/env bash
# A live eval run against a local server: `make eval-live`, then
# `make eval-live CONFIRM=1` for the full run.
#
# ANTHROPIC_API_KEY and TUTOR_ACCESS_CODE come from the caller's shell
# environment only. This script never reads .env and never prints either value.
# It starts the server in live mode on a free local port, sends a 3-request
# smoke run, then asks before the full 20 requests (CONFIRM=1 skips the
# question). The server stops when the script exits.
set -euo pipefail

missing=()
[ -n "${ANTHROPIC_API_KEY:-}" ] || missing+=(ANTHROPIC_API_KEY)
[ -n "${TUTOR_ACCESS_CODE:-}" ] || missing+=(TUTOR_ACCESS_CODE)
if [ ${#missing[@]} -gt 0 ]; then
  echo "eval-live: set ${missing[*]} in your shell environment first (export each; neither is read from a file)." >&2
  exit 1
fi

port=$(uv run --no-env-file python -c 'import socket; s = socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1])')
url="http://127.0.0.1:${port}"

TUTOR_MODE=live \
  TUTOR_RATE_LIMIT="240/minute;4000/day" \
  TUTOR_DAILY_TOKEN_BUDGET=2000000 \
  uv run --no-env-file uvicorn hearhear.app:app --app-dir server --host 127.0.0.1 --port "$port" \
  --log-level warning &
server=$!
trap 'kill "$server" 2>/dev/null || true; wait "$server" 2>/dev/null || true' EXIT INT TERM

for _ in $(seq 60); do
  if curl -fsS "${url}/api/health" 2>/dev/null | grep -q '"tutor_mode":"live"'; then break; fi
  if ! kill -0 "$server" 2>/dev/null; then
    echo "eval-live: the server exited before it was ready (see its output above)." >&2
    exit 1
  fi
  sleep 0.5
done
curl -fsS "${url}/api/health" 2>/dev/null | grep -q '"tutor_mode":"live"' || {
  echo "eval-live: the server at ${url} did not report live mode within 30 seconds." >&2
  exit 1
}

echo "Live server on ${url}. Smoke run: 3 requests."
node evals/run.js --url "$url" --limit 3

cat <<'EOF'

Before the full run (20 requests), check what those 3 cost: in the Anthropic
Console (console.anthropic.com), open Usage and Cost and look at today's tokens
and spend for the tutor's model. Multiply by about 41 for the full run.
EOF

if [ "${CONFIRM:-}" != "1" ]; then
  if [ -t 0 ]; then
    read -r -p "Send the full 20 requests now? Type yes to go on: " answer
    [ "$answer" = "yes" ] || { echo "Stopped before the full run."; exit 0; }
  else
    echo "Stopped before the full run. Run \`make eval-live CONFIRM=1\` to send all 20 requests."
    exit 0
  fi
fi

node evals/run.js --url "$url"
