#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "usage: scripts/before-action.sh '<scheme-action-fact>'" >&2
  exit 64
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ACTION="$1"
TMP="$(mktemp "${TMPDIR:-/tmp}/memory-kb-action.XXXXXX")"
trap 'rm -f "$TMP"' EXIT

{
  printf '(load "kb/engine.scm")\n'
  printf '(load "kb/kb.scm")\n'
  printf '(load "kb/run.scm")\n'
  printf '(cli-test-fact (quote %s))\n' "$ACTION"
} > "$TMP"

cd "$ROOT"
mit-scheme --quiet --batch-mode < "$TMP"
