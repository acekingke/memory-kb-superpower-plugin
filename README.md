# Memory KB Superpower Plugin

A generic Scheme-backed memory and reasoning plugin prototype.

The plugin lets an AI assistant:

- remember generic facts and rules
- model business domains before implementation
- check planned actions against constraints
- use MIT Scheme for deterministic inference
- expose the KB through MCP tools
- keep domain-specific knowledge out of plugin defaults

## Runtime

Requires MIT Scheme:

```sh
mit-scheme --quiet --batch-mode < kb/check.scm
```

This machine currently has MIT Scheme at `/usr/local/bin/mit-scheme`.

## Quick Start

Run from the plugin root:

```sh
scripts/check-kb.sh
scripts/recall.sh "(scope-type ?s)"
scripts/before-action.sh "(do inspect kb)"
scripts/explain.sh "(ready ?task)"
node scripts/test-mcp.js
scripts/test-all.sh
```

To test a single fact and append it only if it is consistent:

```sh
scripts/remember-fact.sh "(prefers user language zh-CN)"
```

MIT Scheme folds unescaped symbols to lowercase when reading them. Use strings
or vertical-bar symbols for case-sensitive values:

```scheme
(fact! '(prefers user language "zh-CN"))
(fact! '(entity |HTTPRequest|))
```

For complex memory updates, generate a patch to `kb/kb.scm`, apply it to a candidate copy, run checks, and only then apply it to the real KB.

## MCP Server

The plugin includes a no-dependency stdio MCP server:

```text
mcp/server.js
.mcp.json
```

Available MCP tools:

- `memory_kb_check`
- `memory_kb_recall`
- `memory_kb_before_action`
- `memory_kb_explain`
- `memory_kb_context_files`
- `memory_kb_remember_fact`

The MCP server wraps the existing MIT Scheme scripts. It keeps normal checks
concise; provenance is shown only through `memory_kb_explain`.

### HTTP transport (multi-tenant)

To expose the server to multiple remote clients:

1. Copy `config/tokens.example.json` to `config/tokens.json` and replace
   the example entries with real `(token, user_id)` pairs. Generate tokens
   with `openssl rand -hex 32`. `chmod 600 config/tokens.json`.
2. Start the HTTP server:

       PORT=3000 npm run mcp:http

3. Point MCP clients at `http://<host>:3000/mcp` with header
   `Authorization: Bearer <token>`.

Each token maps to an isolated `storage/users/<user_id>/` tree; tenants
cannot see each other's facts. See `storage/README.md` for the layout.

Environment variables:

- `PORT` — listen port (default `3000`)
- `MEMORY_KB_TOKENS_PATH` — override tokens file location
- `MEMORY_KB_STORAGE_ROOT` — override storage root (useful for tests)
- `MEMORY_KB_USER` — stdio-only: override local user identity

Smoke test:

```sh
node scripts/test-mcp.js
```

Expected result:

```text
mcp checks passed
```

## Speckit-Style Project Install

You can install Memory KB into any project in the same style as local speckit
commands: runtime files live under `.agents/memory-kb/`, and user-invocable
commands live under `.agents/skills/*`.

From the plugin root:

```sh
install/install-speckit-style.sh /path/to/project
```

For this repository, for example:

```sh
install/install-speckit-style.sh /Users/kyc/homework/tmp/AlphaZero
```

This creates:

```text
.agents/
  memory-kb/
    kb/
    scripts/
    prompts/
    docs/
    tests/
    mcp/
    .mcp.json
  skills/
    memory-kb-check/
    memory-kb-recall/
    memory-kb-explain/
    memory-kb-before-action/
  memory-kb-CLAUDE.md
```

After installation, test from the target project root:

```sh
.agents/memory-kb/scripts/test-all.sh
```

Expected result:

```text
all checks passed
```

The installed user-invocable commands are:

- `/memory-kb-check`
- `/memory-kb-recall`
- `/memory-kb-before-action`
- `/memory-kb-explain`

`/memory-kb-explain` is opt-in. Normal checks should stay concise and should
not show provenance unless the user asks for the evidence chain.

## Testing

Use layered tests so both the Scheme engine and the agent-facing workflow stay honest.

### 1. Scheme Unit Tests

Run the full local test suite:

```sh
scripts/test-all.sh
```

Expected result:

```text
all checks passed
```

This covers generic forbidden actions, domain capability constraints, preference conflicts, and provenance recording.

### 2. CLI Behavior Tests

Verify each command works as an agent-facing tool:

```sh
scripts/check-kb.sh
scripts/recall.sh "(scope-type ?s)"
scripts/before-action.sh "(do inspect kb)"
scripts/explain.sh "(scope-type ?s)"
```

Expected behavior:

- `check-kb.sh` reports contradictions, dangling references, structure, and duplicates as `ok`.
- `recall.sh` returns matching facts.
- `before-action.sh` gives a concise `OK`, `REDUNDANT`, or `REJECT`.
- `explain.sh` expands the evidence chain only when explicitly requested.

### 3. Conflict Scenario Test

Use a temporary copy so the real KB is not polluted:

```sh
cp -R memory-kb-superpower-plugin /tmp/memory-kb-test
cd /tmp/memory-kb-test

scripts/remember-fact.sh "(prefers user language zh-CN)"
scripts/remember-fact.sh "(prefers user language en-US)"
```

Expected behavior:

- The first command is accepted.
- The second command is rejected because `prefers user language` is functional.

### 4. Business Modeling Test

Add or temporarily test a permission-like domain model:

```scheme
(domain-capability permission-system project-lead approve-budget)
(domain-level permission-system project-lead 1)
(domain-level permission-system approve-budget 3)
(greater-than 3 1)
```

Expected result:

```scheme
(contradiction "Domain actor has capability above its level"
               permission-system project-lead approve-budget)
```

Then inspect the evidence chain:

```sh
scripts/explain.sh "(contradiction ?msg permission-system project-lead approve-budget)"
```

### 5. Claude Code Acceptance Test

When using this project from Claude Code, test these interactions:

```text
Remember: I prefer Chinese responses.
```

Expected behavior: Claude proposes a scoped memory fact, checks it, then writes it only if consistent.

```text
Build a permission system: general manager > department manager > project lead. Project leads must not approve company budgets.
```

Expected behavior: Claude models the business domain before coding and records the relevant hierarchy and invariants.

```text
/memory-explain last rejection
```

Expected behavior: Claude shows the provenance chain only because the user explicitly requested it.

## Current Scope

This is an MVP implementation of the specification in `docs/spec.md`.

Implemented:

- plugin manifest
- MCP stdio server
- memory skill instructions
- generic Scheme KB
- forward-chaining engine
- contradiction checks
- functional uniqueness checks
- generic task/action/domain rules
- MIT Scheme wrapper scripts
- prompt templates
- smoke tests

Not yet implemented:

- natural language retrieval
- automatic business-model patch generation
- scoped storage directories
- incremental inference

## Slash Command Convention

The assistant should keep reasoning explanations hidden by default. If the user
asks for the evidence chain, use this slash-style command convention:

```text
/memory-explain <scheme-pattern-or-last-result>
```

The command maps to:

```sh
scripts/explain.sh "<scheme-pattern>"
```

Example:

```sh
scripts/explain.sh "(contradiction ?message ?domain ?actor ?capability)"
```

## Design Rule

The plugin is generic. Domain examples belong in scoped memories, not in the default rule base.
