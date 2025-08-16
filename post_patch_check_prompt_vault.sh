#!/usr/bin/env bash
set -euo pipefail
npm ci
npm run build
bash scripts/self_test_vault.sh
echo "PROMPT VAULT OK"
