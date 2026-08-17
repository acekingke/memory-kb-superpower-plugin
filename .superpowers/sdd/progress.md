# SDD progress — MCP HTTP multi-tenant

Plan: docs/superpowers/plans/2026-08-04-mcp-http-multi-tenant.md
Branch: feat/mcp-http-multi-tenant
Baseline (main): f2ed741

## Global Constraints (verbatim from plan)
- Node CommonJS throughout ("use strict"; at top of each .js file). No ESM.
- No TypeScript, no build step.
- Only one new runtime dependency: @modelcontextprotocol/sdk.
- MIT Scheme invoked as `mit-scheme --quiet --batch-mode` with a composed temp file piped via stdin, exactly as existing scripts do.
- All scoped KBs live under `storage/users/<user_id>/...`. No top-level `storage/repos/` / `storage/projects/` / `storage/sessions/`.
- `config/tokens.json` must have mode `0600` and be git-ignored.
- Public tool schemas (names, `context`, `target_scope` fields) stay backwards compatible.
- Per-`(user_id, target_file)` write mutex implemented as in-process `Map<string, Promise>` chain.
- stdio transport resolves user from `MEMORY_KB_USER` env var, falling back to OS username.

## Pre-flight notes (resolved before dispatch)
- Task 2 tests use a hard-coded ROOT=repo path; Task 4 Step 3a adds MEMORY_KB_STORAGE_ROOT override.
  These coexist ONLY because `node --test` runs each test file in its own subprocess. Implementers
  must NOT switch to a single-process test runner.
- Task 4 test regex for context_files uses relative `users/alice/...` which works under
  MEMORY_KB_STORAGE_ROOT override (mkdtemp dir + that subpath). No change needed.

## Task log
Baseline: main f2ed741 — chore: initial commit of existing Memory KB plugin
Task 1: implemented (commit 2cee1b0) — review in progress
Task 1: complete (commits f2ed741..2cee1b0, review clean — branch-name ⚠️ verified by controller via git branch --show-current)
Task 2: complete (commits 2cee1b0..b835570 — includes controller's b835570 test-glob fix approved by user; review clean; minor: brief prose said 6 tests but reference has 7, immaterial)
Task 3: complete (commits b835570..dd056d0, review clean)
Task 4: complete (commits dd056d0..77502d9 — includes controller's 77502d9 reverting context_files extension per user decision + updating plan doc; review clean)
Task 5: complete (commits 77502d9..f34038f, review clean; minors: zod ^4.4.3 loose pin, legacy contextSchema dropped user_id field — both deferred to final review)
Task 6: complete (commits f34038f..42981c3, review clean; minors: lost exec bit — FIXED by controller in follow-up commit; report stat cosmetic)
Task 7: complete (commits 7a9ff1c..38365bc, review clean; minors: case-sensitive Bearer regex per RFC 7235 strictness, no graceful shutdown, tokens loaded once at startup — all deferred to final review)
Task 8: complete (commits 38365bc..9f22cda, review clean)
Task 9: complete (commits 9f22cda..392e0e2, review clean)
Task 10: complete (auto steps only)
  Step 1 npm test: 23/23 PASS
  Step 2 node scripts/test-mcp.js: "mcp checks passed"
  Step 3a scripts/test-all.sh: "all checks passed" exit 0
  Step 3b scripts/check-kb.sh: all checks ok, exit 0
  Step 4 manual end-to-end with Claude Code CLI: DEFERRED to user (requires real MCP client)
  Step 5 git status: clean apart from progress.md (working file)
Final whole-branch review (opus): Ready to merge = Yes, with 4 Important findings to adjudicate:
  I1: TOCTOU between cli-test-fact and withWriteLock in kb-runtime.js
  I2: safeSegment("..") returns ".." (path traversal within user dir)
  I3: spec mandates -32602 on context.user_id conflict; impl silently strips
  I4: README needs "tenants are trusted, not mutually adversarial" caveat
Plus 5 Minor (README staleness, test-order coupling, appendFact atomicity, tokens.json mode check, timing side-channel).
Final fixes: complete (commit db73dc0, re-review clean — all 4 Important findings addressed)
Branch state: READY TO MERGE
Merged: feat/mcp-http-multi-tenant → main (merge commit 72ec38c, --no-ff)
Branch deleted. Tests on main: 24/24 PASS, smoke test PASS, test-all.sh PASS.
