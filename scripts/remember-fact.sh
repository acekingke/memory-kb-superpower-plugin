#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "usage: scripts/remember-fact.sh '<scheme-fact>'" >&2
  exit 64
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FACT="$1"
TMP="$(mktemp "${TMPDIR:-/tmp}/memory-kb-remember.XXXXXX")"
trap 'rm -f "$TMP"' EXIT

{
  printf '(load "kb/engine.scm")\n'
  printf '(load "kb/kb.scm")\n'
  printf '(load "kb/run.scm")\n'
  printf '(cli-test-fact (quote %s))\n' "$FACT"
} > "$TMP"

cd "$ROOT"
set +e
mit-scheme --quiet --batch-mode < "$TMP"
STATUS=$?
set -e

if [ "$STATUS" -eq 0 ]; then
  INSERT="(fact! '$FACT)"
  awk -v insert="$INSERT" '
    /;; MANUAL MEMORY END/ {
      print insert
    }
    { print }
  ' kb/kb.scm > kb/kb.scm.tmp
  mv kb/kb.scm.tmp kb/kb.scm
fi

exit "$STATUS"
