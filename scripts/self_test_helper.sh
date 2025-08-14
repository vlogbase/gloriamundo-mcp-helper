#!/bin/bash
set -euo pipefail

# Build the project
npm run build >/dev/null 2>&1

GM_HELPER_VERSION=9.9.9-test node dist/host.js &
HOST_PID=$!
trap "kill $HOST_PID" EXIT

# give the server time to start
sleep 1

# check health version
version=$(curl -s http://localhost:9000/health | jq -r .version)
if [[ "$version" != "9.9.9-test" ]]; then
  echo "Health check version mismatch: $version" >&2
  exit 1
fi

# fetch token
TOKEN=$(curl -s http://localhost:9000/config/public | jq -r .token)
if [[ -z "$TOKEN" || "$TOKEN" == "null" ]]; then
  echo "Failed to fetch token" >&2
  exit 1
fi

# connect without auth -> 401
status=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:9000/mcp/connect)
if [[ "$status" != "401" ]]; then
  echo "Unauthenticated connect did not return 401" >&2
  exit 1
fi

# connect with auth using invalid path -> expect 500 with error message
connect_resp=$(curl -s -i -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"serverPath":"/definitely/not/a/real/path","serverArgs":[],"clientId":"p4-test"}' \
  http://localhost:9000/mcp/connect)

echo "$connect_resp" | grep -q "500" || { echo "Expected 500 from connect" >&2; exit 1; }
echo "$connect_resp" | grep -q 'error' || { echo "Expected error JSON from connect" >&2; exit 1; }

# disconnect -> expect 404
disconnect_resp=$(curl -s -i -H "Authorization: Bearer $TOKEN" -X DELETE \
  http://localhost:9000/mcp/disconnect/p4-test)
echo "$disconnect_resp" | grep -q "404" || { echo "Expected 404 from disconnect" >&2; exit 1; }
echo "$disconnect_resp" | grep -q 'error' || { echo "Expected error JSON from disconnect" >&2; exit 1; }

echo "Self-test passed"
