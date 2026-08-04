#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "usage: scripts/recall.sh '<scheme-pattern>'" >&2
  exit 64
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP="$(mktemp "${TMPDIR:-/tmp}/memory-kb-recall.XXXXXX.scm")"
trap 'rm -f "$TMP"' EXIT

{
  printf '(load "kb/engine.scm")\n'
  printf '(load "kb/kb.scm")\n'
  printf '(load "kb/run.scm")\n'
  printf '(cli-recall (quote %s))\n' "$1"
} > "$TMP"

cd "$ROOT"
mit-scheme --quiet --batch-mode < "$TMP"
