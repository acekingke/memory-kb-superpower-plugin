#!/usr/bin/env bash
# AI 症状反查:给我遇到的错误消息关键词,返回相关 invariant。
# 用法: scripts/for-symptom.sh "PSQLException"
#       scripts/for-symptom.sh "tenant_id"
#       scripts/for-symptom.sh "MetaClass not found"
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "usage: scripts/for-symptom.sh '<error-keyword-or-fragment>'" >&2
  exit 64
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP="$(mktemp "${TMPDIR:-/tmp}/memory-kb-for-symptom.XXXXXX")"
trap 'rm -f "$TMP"' EXIT

{
  printf '(load "kb/engine.scm")\n'
  printf '(load "kb/kb.scm")\n'
  printf '(load "kb/run.scm")\n'
  printf '(cli-for-symptom %s)\n' "$(printf '%s' "$1" | sed 's/"/\\"/g' | sed 's/^/"/' | sed 's/$/"/')"
} > "$TMP"

cd "$ROOT"
mit-scheme --quiet --batch-mode < "$TMP"
