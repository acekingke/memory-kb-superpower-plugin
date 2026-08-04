#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

scripts/check-kb.sh
mit-scheme --quiet --batch-mode < tests/test-generic.scm
scripts/recall.sh "(scope-type ?s)" >/dev/null
scripts/before-action.sh "(do inspect kb)" >/dev/null
scripts/explain.sh "(ready ?task)" >/dev/null
node scripts/test-mcp.js

echo "all checks passed"
