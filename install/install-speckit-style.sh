#!/usr/bin/env bash
set -euo pipefail

SOURCE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_ROOT="${1:-$(pwd)}"

if [ ! -d "$TARGET_ROOT" ]; then
  echo "target project does not exist: $TARGET_ROOT" >&2
  exit 64
fi

TARGET_ROOT="$(cd "$TARGET_ROOT" && pwd)"
AGENTS_DIR="$TARGET_ROOT/.agents"
RUNTIME_DIR="$AGENTS_DIR/memory-kb"
SKILLS_DIR="$AGENTS_DIR/skills"

mkdir -p "$RUNTIME_DIR" "$SKILLS_DIR"

copy_dir() {
  local src="$1"
  local dst="$2"
  rm -rf "$dst"
  mkdir -p "$(dirname "$dst")"
  cp -R "$src" "$dst"
}

copy_dir "$SOURCE_ROOT/kb" "$RUNTIME_DIR/kb"
copy_dir "$SOURCE_ROOT/scripts" "$RUNTIME_DIR/scripts"
copy_dir "$SOURCE_ROOT/prompts" "$RUNTIME_DIR/prompts"
copy_dir "$SOURCE_ROOT/docs" "$RUNTIME_DIR/docs"
copy_dir "$SOURCE_ROOT/tests" "$RUNTIME_DIR/tests"
copy_dir "$SOURCE_ROOT/mcp" "$RUNTIME_DIR/mcp"
cp "$SOURCE_ROOT/.mcp.json" "$RUNTIME_DIR/.mcp.json"
cp "$SOURCE_ROOT/README.md" "$RUNTIME_DIR/README.md"

chmod +x "$RUNTIME_DIR"/scripts/*.sh
chmod +x "$RUNTIME_DIR"/mcp/*.js

write_skill() {
  local name="$1"
  local description="$2"
  local argument_hint="$3"
  local body="$4"
  local skill_dir="$SKILLS_DIR/$name"
  mkdir -p "$skill_dir"
  cat > "$skill_dir/SKILL.md" <<EOF
---
name: "$name"
description: "$description"
argument-hint: "$argument_hint"
compatibility: "Requires project-local .agents/memory-kb installed by memory-kb-superpower-plugin"
metadata:
  author: "memory-kb-superpower-plugin"
  source: "install/install-speckit-style.sh"
user-invocable: true
disable-model-invocation: true
---

## User Input

\`\`\`text
\$ARGUMENTS
\`\`\`

$body
EOF
}

write_skill "memory-kb-check" \
  "Check the project-local Memory KB for contradictions, dangling references, structure errors, and duplicates." \
  "No arguments" \
  'Run:

```sh
.agents/memory-kb/scripts/check-kb.sh
```

Report the result concisely. If checks fail, summarize the failing lines and suggest `/memory-kb-explain` only when the user wants the evidence chain.'

write_skill "memory-kb-recall" \
  "Recall facts from the project-local Memory KB using a Scheme pattern." \
  "Scheme pattern, for example: (scope-type ?s)" \
  'If `$ARGUMENTS` is empty, ask for a Scheme pattern.

Run:

```sh
.agents/memory-kb/scripts/recall.sh "$ARGUMENTS"
```

Return matching facts concisely.'

write_skill "memory-kb-explain" \
  "Show the provenance evidence chain for matching Memory KB facts. Use only when explicitly requested." \
  "Scheme pattern or last rejected result" \
  'Use this command only when the user explicitly asks why, asks for evidence, or invokes `/memory-kb-explain`.

If `$ARGUMENTS` is `last rejection`, explain the most recent rejected action or contradiction from the conversation. Otherwise treat `$ARGUMENTS` as a Scheme pattern.

Run:

```sh
.agents/memory-kb/scripts/explain.sh "$ARGUMENTS"
```

Show the rule and premise chain. Keep normal Memory KB commands concise; do not show provenance by default.'

write_skill "memory-kb-before-action" \
  "Check a planned action against the project-local Memory KB before executing it." \
  "Scheme action fact, for example: (do delete production-db)" \
  'If `$ARGUMENTS` is empty, ask for a Scheme action fact.

Run:

```sh
.agents/memory-kb/scripts/before-action.sh "$ARGUMENTS"
```

If the result is OK, continue. If it is REJECT, stop and summarize the contradiction. Offer `/memory-kb-explain` if the user wants the evidence chain.'

cat > "$AGENTS_DIR/memory-kb-CLAUDE.md" <<'EOF'
# Memory KB Project Install

This project has Memory KB installed in `.agents/memory-kb`.

Available user-invocable commands:

- `/memory-kb-check`
- `/memory-kb-recall`
- `/memory-kb-before-action`
- `/memory-kb-explain`

Default behavior:

- Recall before reasoning when memory may matter.
- Model business domains before implementing non-trivial business systems.
- Check before risky actions.
- Do not show provenance by default.
- Show provenance only when the user invokes `/memory-kb-explain` or explicitly asks for evidence.
EOF

echo "Installed Memory KB into: $TARGET_ROOT"
echo "Runtime: $RUNTIME_DIR"
echo "Skills:"
echo "  $SKILLS_DIR/memory-kb-check"
echo "  $SKILLS_DIR/memory-kb-recall"
echo "  $SKILLS_DIR/memory-kb-explain"
echo "  $SKILLS_DIR/memory-kb-before-action"
echo
echo "Run:"
echo "  cd \"$TARGET_ROOT\" && .agents/memory-kb/scripts/test-all.sh"
