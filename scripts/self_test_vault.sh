#!/usr/bin/env bash
set -euo pipefail
node dist/host.js >/tmp/helper.log 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null || true' EXIT
sleep 0.7
TOKEN=$(curl -s http://localhost:9000/config/public | sed -n 's/.*"token"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
[ -n "$TOKEN" ]
curl -sf http://localhost:9000/catalog/servers > /dev/null
curl -sf -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"value":"abc123"}' http://localhost:9000/vault/DEMO > /dev/null
echo "VAULT SELF-TEST OK"
