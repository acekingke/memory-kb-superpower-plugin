# Memory KB Superpower Plugin

**Code is memory.** A Scheme-backed memory and reasoning plugin for coding agents.

![Plugin demo — `/memory-kb-*` slash commands inside a Claude Code session](demo3.gif)

*Installed as a plugin (no MCP), the user-invocable `/memory-kb-*` commands
work directly inside the agent session: `/memory-kb-recall (task ?x ?y)`
returns matching facts from the project KB.*

![MCP demo — agent session via MCP tools](demo2.gif)

*The same engine exposed as MCP tools for MCP-capable clients — natural
language in, checked Scheme facts out.*

![Engine demo](demo.gif)

*Under the hood: writes are validated, conflicting facts rejected, derivations
carry provenance, and everything is undoable with git.*

The plugin lets an AI assistant:

- remember generic facts and rules
- model business domains before implementation
- check planned actions against constraints
- use MIT Scheme for deterministic inference
- expose the KB as user-invocable `/memory-kb-*` commands and as MCP tools
- keep domain-specific knowledge out of plugin defaults

## Advantages

- **Memory as source code.** Facts and rules live in auditable Scheme files,
  not opaque vector blobs. Every memory is inspectable, diffable, and
  versionable with git.
- **Deterministic inference.** A tail-recursive forward-chaining engine runs
  on MIT Scheme, so the same KB always yields the same answers — no
  hallucinated memories or fuzzy retrieval drift.
- **Write-time validation.** `remember-fact.sh` accepts a new fact only after
  checking it against the existing KB; functional constraints (e.g.
  `prefers user language`) reject conflicting updates instead of silently
  overwriting old knowledge.
- **Action gating.** `before-action` tests a planned action against remembered
  constraints and returns a concise `OK` / `REDUNDANT` / `REJECT`, stopping
  rule violations before they happen rather than explaining them afterwards.
- **Explainability on demand.** Every derivation records provenance. Normal
  output stays concise; `explain` expands the full fact-and-rule evidence
  chain only when the user asks for it.
- **Business modeling before coding.** Domains, hierarchies, capabilities,
  states, and invariants are expressed as declarative facts, and
  contradictions (e.g. an actor holding a capability above its level) are
  caught mechanically at model time.
- **Zero-dependency MCP integration.** A pure-Node stdio/HTTP MCP server wraps
  the Scheme engine, so any MCP-capable client gets the same tools without
  extra runtime dependencies.
- **Multi-tenant HTTP transport.** Bearer tokens map to isolated
  `storage/users/<user_id>/` trees, letting mutually trusted remote clients
  share one deployment without seeing each other's facts.
- **Safe-write discipline.** Complex changes are generated as patches, checked
  against a candidate KB copy, and only applied to the real KB when clean —
  memory updates can never corrupt the knowledge base.
- **Generality by design.** The default rule base contains only generic
  knowledge; domain facts live in scoped memory records, so the same plugin
  serves any project without hard-coded examples.
- **Layered testing.** Scheme unit tests, CLI behavior tests, conflict
  scenarios, and Claude Code acceptance tests keep both the engine and the
  agent-facing workflow honest.

## Installation

### Prerequisites

- [MIT Scheme](https://www.gnu.org/software/mit-scheme/) — the reasoning
  engine (`brew install mit-scheme` on macOS). This is the only runtime the
  plugin itself needs.
- Node.js >= 18 with npm — only for the optional MCP server (Option B).

Sanity check that the engine runs:

```sh
mit-scheme --quiet --batch-mode < kb/check.scm
```

### Option A — Install as a plugin (no MCP)

The primary installation path. It installs the Memory KB as user-invocable
skills (slash commands) that drive the Scheme scripts directly. No Node.js,
no npm, no MCP server — just MIT Scheme.

#### A1. Into a project (Claude Code / Codex / superpowers-style agents)

```sh
install/install-speckit-style.sh /path/to/project
```

Add `--no-mcp` to skip every MCP artifact (`mcp/`, `package.json`, the
project-root `.mcp.json`) and the `npm install`:

```sh
install/install-speckit-style.sh --no-mcp /path/to/project
```

This creates:

```text
.agents/
  memory-kb/            # runtime: kb/, scripts/, prompts/, docs/, tests/
  skills/               # user-invocable skills → slash commands
    memory-kb-check/
    memory-kb-recall/
    memory-kb-explain/
    memory-kb-before-action/
  memory-kb-CLAUDE.md   # agent-facing install notes
```

The agent in that project then exposes four user-invocable commands:

- `/memory-kb-check` — check consistency, structure, and duplicates
- `/memory-kb-recall <pattern>` — recall facts matching a Scheme pattern
- `/memory-kb-before-action <fact>` — gate a planned action
- `/memory-kb-explain <pattern-or-last-rejection>` — provenance chain

`/memory-kb-explain` is opt-in. Normal checks stay concise and do not show
provenance unless the user asks for the evidence chain.

Verify from the target project root:

```sh
cd /path/to/project
.agents/memory-kb/scripts/test-all.sh
```

Expected result:

```text
all checks passed
```

(In a `--no-mcp` install the MCP smoke test is skipped; the Scheme tests
still report `all checks passed`.)

#### A2. As a Codex / ChatGPT plugin

The repository itself is a Codex plugin: `.codex-plugin/plugin.json`
packages `skills/` and the optional MCP server for the ChatGPT/Codex
Plugins Directory.

Add a local marketplace so the desktop app can install it. The canonical
repo-marketplace layout is:

```sh
mkdir -p /path/to/project/plugins
cp -R /path/to/memory-kb-superpower-plugin /path/to/project/plugins/memory-kb-superpower-plugin
```

`/path/to/project/.agents/plugins/marketplace.json`:

```json
{
  "name": "local-repo",
  "plugins": [
    {
      "name": "memory-kb-superpower-plugin",
      "source": { "source": "local", "path": "./plugins/memory-kb-superpower-plugin" },
      "policy": { "installation": "AVAILABLE", "authentication": "ON_INSTALL" },
      "category": "Productivity"
    }
  ]
}
```

The same entry works as a personal marketplace at
`~/.agents/plugins/marketplace.json` with the plugin stored under
`~/.codex/plugins/` — `source.path` resolves relative to the marketplace
root. After restarting the ChatGPT desktop app, open the Plugins Directory,
select the marketplace, and install the plugin; the bundled `memory-kb`
skill becomes available. For a skills-only plugin without the MCP server,
remove the `"mcpServers"` entry from `.codex-plugin/plugin.json` before
installing.

### Option B — MCP server (optional)

The same engine is also exposed as an MCP server for MCP-capable clients
(tools `memory_kb_check`, `memory_kb_recall`, `memory_kb_before_action`,
`memory_kb_explain`, `memory_kb_context_files`, `memory_kb_remember_fact`).
Requires `npm install`; see the [MCP Server](#mcp-server) section.

### Use in this repository

```sh
npm install                # MCP server dependencies
scripts/test-all.sh        # Scheme engine tests
node scripts/test-mcp.js   # MCP smoke test → "mcp checks passed"
```

The stdio MCP server is registered in `.mcp.json` at the repository root.

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

## Demo: `/memory-kb-recall (task ?x ?y)`

The demo runs in a scratch project (`/tmp/test`) so the plugin repository's
own KB stays untouched. It installs the plugin the non-MCP way (`--no-mcp`)
and is recorded live in a real Claude Code session (`demo3.gif`):

![Plugin slash-command demo](demo3.gif)

Inside the session the user invokes `/memory-kb-recall (task ?x ?y)` and
Claude runs the installed script behind the slash command. Reproducing it
step by step:

```sh
install/install-speckit-style.sh --no-mcp /tmp/test
```

```text
Installed Memory KB into: /tmp/test
Runtime: /tmp/test/.agents/memory-kb
MCP server: skipped (--no-mcp); only MIT Scheme is required
Skills:
  /tmp/test/.agents/skills/memory-kb-check
  /tmp/test/.agents/skills/memory-kb-recall
  /tmp/test/.agents/skills/memory-kb-explain
  /tmp/test/.agents/skills/memory-kb-before-action

Run:
  cd "/tmp/test" && .agents/memory-kb/scripts/test-all.sh
```

Record a task fact (it is checked for consistency before it is stored):

```sh
cd /tmp/test
.agents/memory-kb/scripts/remember-fact.sh "(task improve-readme write-plugin-usage)"
```

```text
OK (task improve-readme write-plugin-usage)
derived-delta: ((task improve-readme write-plugin-usage))
```

The fact is appended to the project KB (`kb/kb.scm`) — auditable and
diffable like any source change. Now the user invokes the slash command:

```text
/memory-kb-recall (task ?x ?y)
```

The agent runs the installed script behind that command:

```sh
.agents/memory-kb/scripts/recall.sh "(task ?x ?y)"
```

```text
(task improve-readme write-plugin-usage)
```

`?x` and `?y` are pattern variables: the query returns every `task` fact
with two arguments. Provenance stays hidden by default; ask for it
explicitly:

```text
/memory-kb-explain (task ?x ?y)
```

```sh
.agents/memory-kb/scripts/explain.sh "(task ?x ?y)"
```

```text
BASE (task improve-readme write-plugin-usage)
```

And the KB stays healthy:

```sh
.agents/memory-kb/scripts/test-all.sh
```

```text
skipping MCP smoke test (plugin-only install without mcp/)
all checks passed
```

## MCP Server

The plugin includes a no-dependency stdio MCP server:

```text
mcp/server-stdio.js
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

**Trust model:** the Scheme subprocess runs under the Node process's OS user
and has unrestricted filesystem access via MIT Scheme primitives. Tenants are
isolated at the routing layer (each token sees only its own
`storage/users/<user_id>/` tree), not at the OS level. Deploy this server
only when all token holders are mutually trusted; do not expose it to
adversarial tenants.

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

This covers generic forbidden actions, domain capability constraints,
preference conflicts, provenance recording, and — when `mcp/` is present —
the MCP smoke test. In a `--no-mcp` plugin install the smoke test is skipped.

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
/memory-kb-explain last rejection
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

The project install exposes four user-invocable commands. The assistant
should keep reasoning explanations hidden by default and expand the evidence
chain only when the user invokes `/memory-kb-explain` or explicitly asks.

| Command | Maps to |
| --- | --- |
| `/memory-kb-check` | `scripts/check-kb.sh` |
| `/memory-kb-recall <pattern>` | `scripts/recall.sh "<pattern>"` |
| `/memory-kb-before-action <fact>` | `scripts/before-action.sh "<fact>"` |
| `/memory-kb-explain <pattern-or-last-result>` | `scripts/explain.sh "<pattern>"` |

Examples:

```sh
scripts/recall.sh "(task ?x ?y)"
scripts/explain.sh "(contradiction ?message ?domain ?actor ?capability)"
```

## Design Rule

The plugin is generic. Domain examples belong in scoped memories, not in the default rule base.
