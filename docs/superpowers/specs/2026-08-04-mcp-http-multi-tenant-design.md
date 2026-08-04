# MCP HTTP Multi-Tenant Design

**Date:** 2026-08-04
**Status:** Approved
**Author:** Brainstorming session with Claude

## Goal

Give the existing Memory KB plugin a real multi-tenant MCP interface:

1. Add an HTTP transport so multiple remote MCP clients can connect to one server.
2. Identify tenants via `Authorization: Bearer <token>`, mapped to `user_id` via a static config file.
3. Isolate each tenant's facts under `storage/users/<user_id>/`, while sharing the engine and generic rule base.
4. Keep the existing stdio transport working unchanged for local single-user use.

## Non-Goals

- Cloud/multi-instance deployment, shared storage backends, rate limiting, RBAC beyond per-tenant isolation.
- OAuth/OIDC integration; tokens are statically provisioned.
- A shared "top-level" repo or project KB. All scoped KBs live under a user.

## Background

The repository already ships:

- `mcp/server.js` — a no-dependency stdio MCP server wrapping shell scripts.
- `storage/README.md` — describes scoped KB composition, but the scripts and server ignore `context` and always operate on the single shared `kb/kb.scm`.
- Bug: `mcp/server.js:207` references `fs.existsSync` without `require("node:fs")`.

This design implements what `storage/README.md` already sketches, adjusts it so that repo/project/session scopes are per-user, and adds the HTTP transport.

## Key Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Transport | Streamable HTTP via `@modelcontextprotocol/sdk` | Official SDK, supports multiple concurrent clients; do not hand-roll JSON-RPC over HTTP. |
| Identity | Static `config/tokens.json` mapping token → user_id | Simple, fits 5–50 user internal deployments; no IdP required. |
| KB composition | Shared engine + per-user overlays ("Model X") | Engine rules and generic axioms stay common; user facts are private. Matches the existing "plugin is generic" rule. |
| Repo scope | Per-user-per-repo | Prevents one user's repo facts from leaking to another user working on the same repo. |
| Write target | Most specific scope by default: `session > project > repo > user-global` | Matches `storage/README.md` intent. Tool may override via `target_scope`. |

## Storage Layout

```
kb/
  engine.scm                              # shared inference engine
  kb.scm                                  # shared generic rules / axioms
  run.scm                                 # shared CLI entrypoints
storage/
  users/<user_id>/
    global.scm                            # user-global facts
    repos/<repo_key>/kb.scm               # facts scoped to (user, repo)
    projects/<project_id>/kb.scm          # facts scoped to (user, project)
    sessions/<session_id>/kb.scm          # facts scoped to (user, session)
config/
  tokens.json                             # { "<token>": "<user_id>", ... }
```

The previous top-level `storage/repos/`, `storage/projects/`, `storage/sessions/` directories are removed; all scoped KBs live under a user.

`<repo_key>` is derived from `context.repo_id` if present, else from `path.basename(context.repo_path)`, sanitised to `[A-Za-z0-9._-]` (existing `safeSegment` logic).

## KB Composition Order

For each tool call with `(user_id, context)`, the runtime composes a temporary KB file in this order, skipping files that do not exist:

```
kb/engine.scm
kb/kb.scm
storage/users/<u>/global.scm
storage/users/<u>/repos/<r>/kb.scm       (if context.repo_id or context.repo_path)
storage/users/<u>/projects/<p>/kb.scm    (if context.project_id)
storage/users/<u>/sessions/<s>/kb.scm    (if context.session_id)
kb/run.scm
```

The composed file is piped to `mit-scheme --quiet --batch-mode`, mirroring how existing scripts work today.

## Components

| Module | Responsibility |
|---|---|
| `mcp/server-stdio.js` | Renamed from `mcp/server.js`. stdio entry; resolves identity from local config or env (`MEMORY_KB_USER`), then calls the shared runtime. |
| `mcp/server-http.js` | New HTTP entry. Verifies bearer token, injects `user_id` into every tool call's context, mounts the MCP `StreamableHTTPServerTransport`. |
| `mcp/kb-runtime.js` | Shared tool dispatcher. Given `(user_id, tool_name, args)`, composes the KB, invokes Scheme, handles writes. Used by both stdio and HTTP servers. |
| `mcp/scoped-files.js` | Pure functions: given `(user_id, context)` return the ordered read list and the default write path. |
| `mcp/auth.js` | Loads `config/tokens.json`; exposes `resolveUser(token) -> user_id | null`. |
| `scripts/*` | Refactored to accept a KB file list (or a pre-composed file) instead of hard-coding `kb/kb.scm`. |
| `config/tokens.json` | Static token → user_id map. File permissions `0600`. |

## Authentication Flow (HTTP)

1. Client sends `Authorization: Bearer <token>`.
2. `auth.js` looks up the token. If missing or unknown → `401 Unauthorized`, request never reaches MCP layer.
3. On success, the server forces `context.user_id = <resolved user_id>` for every `tools/call`. The `context` schema does not include a `user_id` field; if a client sends one, zod silently strips it and the token-derived `user_id` is used. The token is the source of truth; there is no explicit rejection of client-supplied `user_id`.

## Tool Behaviour Changes

Existing tools keep their schemas (they already accept `context` and `target_scope`). Behavioural changes:

- All tools now actually consume `context` and compose the KB as described above.
- `memory_kb_remember_fact` writes to the most specific scope present in `context` (`session > project > repo > user-global`), or to the scope named by `target_scope` if provided. Write goes through a per-`(user_id, target_path)` mutex.
- `memory_kb_context_files` returns the read list for the current `(user_id, context)` and marks each entry `exists` or `missing`.

For the stdio transport there is no bearer token; the user is identified by the `MEMORY_KB_USER` environment variable (default: local OS user). This keeps local single-user behaviour unchanged while routing through the same runtime.

## Concurrency

- **Reads** are lock-free: each call composes a fresh temp KB via `mktemp` and spawns its own `mit-scheme` process.
- **Writes** are serialised per `(user_id, target_file)` using an in-process `Map<key, Promise>` chain. Cross-process safety is out of scope for the single-server deployment.

## Error Handling

| Case | Behaviour |
|---|---|
| Missing/unknown token | HTTP 401, no MCP processing. |
| `context.user_id` supplied by client | Silently stripped by zod; token-derived `user_id` wins. No explicit rejection. |
| `target_scope` requested but required context missing (e.g. `target_scope=repo` without `repo_id`/`repo_path`) | Tool returns error describing the missing context field. |
| Scheme engine failure | Tool returns stderr; existing behaviour. |

## Testing

- **Unit:** `scoped-files` path computation, `auth` token resolution, KB composition order.
- **Integration (multi-tenant isolation):** start `server-http.js`, seed two tokens (`alice`, `bob`), then:
  - `alice` calls `memory_kb_remember_fact` with a fact; `alice` recalls → fact present.
  - `bob` recalls with the same pattern → fact absent.
  - `alice` writes a repo-scoped fact for `repo X`; `bob` queries with the same `repo_id` → absent.
- **Concurrency:** two parallel `remember_fact` calls for the same user → both succeed, file contains both facts, no corruption.
- **Regression:** `node scripts/test-mcp.js` (stdio smoke test) still passes.
- **Bug fix bundled in:** add the missing `fs` require (or drop the `existsSync` call) in the stdio server's `memory_kb_context_files` branch.

## Migration

- Existing single shared `kb/kb.scm` stays as the shared generic rule base. Any user-specific facts currently in it are the operator's responsibility to move into `storage/users/<u>/global.scm`; this design does not auto-migrate.
- `storage/README.md` is updated to reflect the per-user layout.

## Open Questions

None at design time. Token rotation, expiry, and per-user rate limiting are explicitly deferred.
