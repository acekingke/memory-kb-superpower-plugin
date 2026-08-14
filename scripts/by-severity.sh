#!/usr/bin/env bash
# AI 按严重度反查:列出所有指定 severity 的 invariant slug。
# 用法: scripts/by-severity.sh blocker
#       scripts/by-severity.sh high
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "usage: scripts/by-severity.sh <blocker|high|medium|low>" >&2
  exit 64
fi

case "$1" in
  blocker|high|medium|low) ;;
  *) echo "severity must be blocker|high|medium|low" >&2; exit 64 ;;
esac

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP="$(mktemp "${TMPDIR:-/tmp}/memory-kb-by-severity.XXXXXX")"
trap 'rm -f "$TMP"' EXIT

{
  printf '(load "kb/engine.scm")\n'
  printf '(load "kb/kb.scm")\n'
  printf '(load "kb/run.scm")\n'
  printf '(cli-by-severity (quote %s))\n' "$1"
} > "$TMP"

cd "$ROOT"
mit-scheme --quiet --batch-mode < "$TMP"
