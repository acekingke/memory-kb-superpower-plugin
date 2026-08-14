#!/usr/bin/env bash
# AI 优先查询:给我准备做的 (do ...) 动作,返回应想起的所有 invariant。
# 用法: scripts/for-action.sh '(create-entity "SysTenant")'
#       scripts/for-action.sh '(extend-entity ?)'        # 通配 object
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "usage: scripts/for-action.sh '(<verb> <object> [...])'" >&2
  echo "  verbs: create-entity extend-entity write-row persist-via login-as" >&2
  echo "         add-tenant-column modify-xml write-service write-detailview" >&2
  echo "         write-test migrate-schema approve-doc unapprove-doc post-stock" >&2
  echo "         write-bootstrap write-rest-api pick-version pick-xml-tag" >&2
  exit 64
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP="$(mktemp "${TMPDIR:-/tmp}/memory-kb-for-action.XXXXXX")"
trap 'rm -f "$TMP"' EXIT

{
  printf '(load "kb/engine.scm")\n'
  printf '(load "kb/kb.scm")\n'
  printf '(load "kb/run.scm")\n'
  printf '(cli-for-action (quote %s))\n' "$1"
} > "$TMP"

cd "$ROOT"
mit-scheme --quiet --batch-mode < "$TMP"
