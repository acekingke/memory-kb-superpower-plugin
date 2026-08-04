# MCP HTTP Multi-Tenant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an HTTP transport and per-tenant KB isolation to the Memory KB MCP server, so multiple remote clients with distinct bearer tokens see and mutate only their own scoped facts.

**Architecture:** A shared Node runtime (`mcp/kb-runtime.js`) composes a per-call temporary Scheme KB from `kb/*.scm` plus per-user overlays under `storage/users/<u>/`, then dispatches to MIT Scheme. Both transports sit on `@modelcontextprotocol/sdk`'s `McpServer`: stdio via `StdioServerTransport`, HTTP via `StreamableHTTPServerTransport`. A single `mcp/server-factory.js` registers all tools against an `McpServer` instance given a fixed `userId`. Bearer tokens are resolved to `user_id` via a static `config/tokens.json`.

**Tech Stack:** Node.js (≥18, CommonJS), `@modelcontextprotocol/sdk`, MIT Scheme, bash, Node built-in test runner (`node:test`).

**Reference spec:** `docs/superpowers/specs/2026-08-04-mcp-http-multi-tenant-design.md`

## Global Constraints

- Node CommonJS throughout (`"use strict";` at top of each `.js` file). No ESM.
- No TypeScript, no build step.
- Only one new runtime dependency: `@modelcontextprotocol/sdk`.
- MIT Scheme invoked as `mit-scheme --quiet --batch-mode` with a composed temp file piped via stdin, exactly as existing scripts do.
- All scoped KBs live under `storage/users/<user_id>/...`. No top-level `storage/repos/` / `storage/projects/` / `storage/sessions/`.
- `config/tokens.json` must have mode `0600` and be git-ignored.
- Public tool schemas (names, `context`, `target_scope` fields) stay backwards compatible.
- Per-`(user_id, target_file)` write mutex implemented as in-process `Map<string, Promise>` chain.
- stdio transport resolves user from `MEMORY_KB_USER` env var, falling back to OS username.

---

### Task 1: Bootstrap git, package.json, install MCP SDK

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Modify: none

**Interfaces:**
- Consumes: nothing
- Produces: `node_modules/@modelcontextprotocol/sdk` available for `require()`; `npm test` runs `node --test tests/**/*.test.js`

- [ ] **Step 1: Initialise git and create baseline commit**

The repo is currently not under version control. Initialise it so subsequent tasks can commit.

```bash
cd /Users/kyc/work/memory-kb-superpower-plugin
git init
git add -A
git commit -m "chore: initial commit of existing Memory KB plugin"
```

- [ ] **Step 2: Create `package.json`**

```json
{
  "name": "memory-kb-superpower-plugin",
  "version": "0.1.0",
  "private": true,
  "description": "Generic Scheme-backed memory and reasoning plugin with MCP interface",
  "main": "mcp/server-stdio.js",
  "scripts": {
    "test": "node --test tests/",
    "mcp:stdio": "node mcp/server-stdio.js",
    "mcp:http": "node mcp/server-http.js",
    "smoke:mcp": "node scripts/test-mcp.js"
  },
  "engines": {
    "node": ">=18"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.30.0"
  }
}
```

- [ ] **Step 3: Create `.gitignore`**

```
node_modules/
config/tokens.json
storage/users/
*.log
.DS_Store
```

- [ ] **Step 4: Install dependencies**

```bash
npm install
```

Expected: `node_modules/@modelcontextprotocol/sdk/package.json` exists.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json .gitignore
git commit -m "chore: add package.json with MCP SDK dependency"
```

---

### Task 2: `mcp/scoped-files.js` — path computation

**Files:**
- Create: `mcp/scoped-files.js`
- Test: `tests/scoped-files.test.js`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `repoKey(context) -> string | null`
  - `scopedReadFiles(userId, context) -> string[]` — ordered absolute paths, missing files included
  - `scopedWriteFile(userId, context, targetScope?) -> { path, scope }` — throws `Error` with `.code = "MISSING_CONTEXT"` if the requested scope has no matching context field

- [ ] **Step 1: Write the failing test**

Create `tests/scoped-files.test.js`:

```js
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const {
  repoKey,
  scopedReadFiles,
  scopedWriteFile
} = require("../mcp/scoped-files");

test("repoKey prefers repo_id over repo_path", () => {
  assert.equal(repoKey({ repo_id: "Alpha", repo_path: "/x/y" }), "Alpha");
  assert.equal(repoKey({ repo_path: "/home/u/AlphaZero" }), "AlphaZero");
  assert.equal(repoKey({}), null);
});

test("repoKey sanitises special characters", () => {
  assert.equal(repoKey({ repo_id: "foo bar/baz" }), "foo-bar-baz");
});

test("scopedReadFiles orders user, repo, project, session", () => {
  const files = scopedReadFiles("alice", {
    repo_id: "Alpha",
    project_id: "P1",
    session_id: "S1"
  });
  assert.deepEqual(files, [
    path.join(ROOT, "storage", "users", "alice", "global.scm"),
    path.join(ROOT, "storage", "users", "alice", "repos", "Alpha", "kb.scm"),
    path.join(ROOT, "storage", "users", "alice", "projects", "P1", "kb.scm"),
    path.join(ROOT, "storage", "users", "alice", "sessions", "S1", "kb.scm")
  ]);
});

test("scopedReadFiles skips missing context fields", () => {
  const files = scopedReadFiles("alice", { project_id: "P1" });
  assert.deepEqual(files, [
    path.join(ROOT, "storage", "users", "alice", "global.scm"),
    path.join(ROOT, "storage", "users", "alice", "projects", "P1", "kb.scm")
  ]);
});

test("scopedWriteFile defaults to most specific scope", () => {
  const ctx = { repo_id: "Alpha", project_id: "P1", session_id: "S1" };
  assert.deepEqual(scopedWriteFile("alice", ctx), {
    path: path.join(ROOT, "storage", "users", "alice", "sessions", "S1", "kb.scm"),
    scope: "session"
  });
  assert.deepEqual(scopedWriteFile("alice", { repo_id: "Alpha" }), {
    path: path.join(ROOT, "storage", "users", "alice", "repos", "Alpha", "kb.scm"),
    scope: "repo"
  });
  assert.deepEqual(scopedWriteFile("alice", {}), {
    path: path.join(ROOT, "storage", "users", "alice", "global.scm"),
    scope: "user"
  });
});

test("scopedWriteFile honours explicit target_scope", () => {
  const ctx = { repo_id: "Alpha", session_id: "S1" };
  const out = scopedWriteFile("alice", ctx, "repo");
  assert.equal(out.scope, "repo");
  assert.ok(out.path.endsWith(path.join("repos", "Alpha", "kb.scm")));
});

test("scopedWriteFile throws MISSING_CONTEXT when target scope has no context", () => {
  assert.throws(
    () => scopedWriteFile("alice", {}, "repo"),
    (err) => err.code === "MISSING_CONTEXT"
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test
```

Expected: FAIL with `Cannot find module '../mcp/scoped-files'`.

- [ ] **Step 3: Implement `mcp/scoped-files.js`**

```js
"use strict";

const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

function safeSegment(value) {
  return (
    String(value)
      .trim()
      .replace(/[^A-Za-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 96) || "default"
  );
}

function repoKey(context = {}) {
  if (context.repo_id) return safeSegment(context.repo_id);
  if (context.repo_path) return safeSegment(path.basename(context.repo_path));
  return null;
}

function userDir(userId) {
  return path.join(ROOT, "storage", "users", safeSegment(userId));
}

function scopedReadFiles(userId, context = {}) {
  const files = [path.join(userDir(userId), "global.scm")];
  const repo = repoKey(context);
  if (repo) files.push(path.join(userDir(userId), "repos", repo, "kb.scm"));
  if (context.project_id) {
    files.push(
      path.join(userDir(userId), "projects", safeSegment(context.project_id), "kb.scm")
    );
  }
  if (context.session_id) {
    files.push(
      path.join(userDir(userId), "sessions", safeSegment(context.session_id), "kb.scm")
    );
  }
  return files;
}

function scopedWriteFile(userId, context = {}, targetScope) {
  const dir = userDir(userId);
  const repo = repoKey(context);

  const candidates = {
    session: context.session_id
      ? path.join(dir, "sessions", safeSegment(context.session_id), "kb.scm")
      : null,
    project: context.project_id
      ? path.join(dir, "projects", safeSegment(context.project_id), "kb.scm")
      : null,
    repo: repo ? path.join(dir, "repos", repo, "kb.scm") : null,
    user: path.join(dir, "global.scm")
  };

  if (targetScope) {
    if (!Object.prototype.hasOwnProperty.call(candidates, targetScope)) {
      const err = new Error(`unknown target_scope: ${targetScope}`);
      err.code = "UNKNOWN_SCOPE";
      throw err;
    }
    if (!candidates[targetScope]) {
      const err = new Error(
        `target_scope=${targetScope} requires the matching context field`
      );
      err.code = "MISSING_CONTEXT";
      throw err;
    }
    return { path: candidates[targetScope], scope: targetScope };
  }

  for (const scope of ["session", "project", "repo", "user"]) {
    if (candidates[scope]) return { path: candidates[scope], scope };
  }
  // unreachable: candidates.user is always set
  throw new Error("no write target resolved");
}

module.exports = {
  repoKey,
  scopedReadFiles,
  scopedWriteFile,
  safeSegment
};
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test
```

Expected: all 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add mcp/scoped-files.js tests/scoped-files.test.js
git commit -m "feat(mcp): add scoped-files path computation for per-user KB overlays"
```

---

### Task 3: `mcp/auth.js` — token resolution

**Files:**
- Create: `mcp/auth.js`
- Create: `config/tokens.example.json`
- Test: `tests/auth.test.js`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `loadTokens(filePath?) -> { <token>: <userId>, ... }` — throws if file missing or malformed
  - `resolveUser(token, tokens) -> string | null`

- [ ] **Step 1: Write the failing test**

Create `tests/auth.test.js`:

```js
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { loadTokens, resolveUser } = require("../mcp/auth");

test("loadTokens reads a valid tokens file", () => {
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "tk-")), "tokens.json");
  fs.writeFileSync(tmp, JSON.stringify({ "tok-a": "alice", "tok-b": "bob" }));
  assert.deepEqual(loadTokens(tmp), { "tok-a": "alice", "tok-b": "bob" });
});

test("loadTokens throws on missing file", () => {
  assert.throws(() => loadTokens("/nonexistent/tokens.json"));
});

test("loadTokens throws on non-object content", () => {
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "tk-")), "tokens.json");
  fs.writeFileSync(tmp, JSON.stringify(["not", "an", "object"]));
  assert.throws(() => loadTokens(tmp));
});

test("resolveUser returns user_id for known token, null otherwise", () => {
  const tokens = { "tok-a": "alice" };
  assert.equal(resolveUser("tok-a", tokens), "alice");
  assert.equal(resolveUser("nope", tokens), null);
  assert.equal(resolveUser("", tokens), null);
  assert.equal(resolveUser(undefined, tokens), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test
```

Expected: FAIL with `Cannot find module '../mcp/auth'`.

- [ ] **Step 3: Implement `mcp/auth.js`**

```js
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_TOKENS_PATH = path.resolve(__dirname, "..", "config", "tokens.json");

function loadTokens(filePath = DEFAULT_TOKENS_PATH) {
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw);
  if (
    !parsed ||
    typeof parsed !== "object" ||
    Array.isArray(parsed)
  ) {
    throw new Error(`tokens file must be a JSON object: ${filePath}`);
  }
  for (const [token, user] of Object.entries(parsed)) {
    if (typeof token !== "string" || typeof user !== "string" || !user) {
      throw new Error(`tokens file must map string tokens to non-empty string user_ids`);
    }
  }
  return parsed;
}

function resolveUser(token, tokens) {
  if (!token || typeof token !== "string") return null;
  return tokens[token] || null;
}

module.exports = { loadTokens, resolveUser, DEFAULT_TOKENS_PATH };
```

- [ ] **Step 4: Create `config/tokens.example.json`**

```json
{
  "replace-with-long-random-token": "alice",
  "another-long-random-token": "bob"
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npm test
```

Expected: all tests pass (auth + scoped-files).

- [ ] **Step 6: Commit**

```bash
git add mcp/auth.js tests/auth.test.js config/tokens.example.json
git commit -m "feat(mcp): add static token-to-user auth resolver"
```

---

### Task 4: `mcp/kb-runtime.js` — shared tool dispatcher

**Files:**
- Create: `mcp/kb-runtime.js`
- Test: `tests/kb-runtime.test.js`

**Interfaces:**
- Consumes: `scoped-files.js` (`scopedReadFiles`, `scopedWriteFile`)
- Produces:
  - `runTool(userId, toolName, args) -> Promise<{ ok, status, stdout, stderr }>` — dispatches `memory_kb_*` tools against the per-user composed KB
  - `composeKb(userId, context) -> Promise<string>` — returns path to a temp file with all existing scoped KBs concatenated; caller deletes

Behaviour contract:
- Loads `kb/kb.scm` first, then every existing file from `scopedReadFiles(userId, context)` in order.
- `memory_kb_check` runs the equivalent of `kb/check.scm` against the composed KB.
- `memory_kb_recall`, `memory_kb_before_action`, `memory_kb_explain` evaluate `(cli-recall …)`, `(cli-test-fact …)`, `(cli-explain …)` respectively against the composed KB.
- `memory_kb_remember_fact` first runs `(cli-test-fact …)` against the composed KB; on success, appends `(fact! '<fact>)` to the file chosen by `scopedWriteFile`, creating parent directories as needed. Serialised per target path via in-process mutex.
- `memory_kb_context_files` returns a human-readable list of read files marked `exists`/`missing`.

- [ ] **Step 1: Write the failing test**

Create `tests/kb-runtime.test.js`:

```js
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// Redirect storage to a temp dir for the duration of these tests by
// monkey-patching scoped-files. kb-runtime reads it via require, so we
// re-require after overriding USER_STORAGE_ROOT.
process.env.MEMORY_KB_STORAGE_ROOT = fs.mkdtempSync(
  path.join(os.tmpdir(), "kb-runtime-")
);

const { runTool } = require("../mcp/kb-runtime");

test("recall returns base KB facts for a fresh user", async () => {
  const r = await runTool("alice", "memory_kb_recall", {
    pattern: "(scope-type ?s)"
  });
  assert.equal(r.ok, true, r.stderr);
  assert.match(r.stdout, /\(scope-type global\)/);
});

test("remember_fact then recall round-trips a user-global fact", async () => {
  const w = await runTool("alice", "memory_kb_remember_fact", {
    fact: '(prefers user language "zh-CN")'
  });
  assert.equal(w.ok, true, w.stderr);

  const r = await runTool("alice", "memory_kb_recall", {
    pattern: "(prefers user language ?l)"
  });
  assert.equal(r.ok, true, r.stderr);
  assert.match(r.stdout, /zh-CN/);
});

test("repo-scoped facts do not leak across users", async () => {
  const w = await runTool("alice", "memory_kb_remember_fact", {
    fact: "(repo-owner alpha alice)",
    context: { repo_id: "alpha" }
  });
  assert.equal(w.ok, true, w.stderr);

  const rAlice = await runTool("alice", "memory_kb_recall", {
    pattern: "(repo-owner alpha ?who)",
    context: { repo_id: "alpha" }
  });
  assert.match(rAlice.stdout, /alice/);

  const rBob = await runTool("bob", "memory_kb_recall", {
    pattern: "(repo-owner alpha ?who)",
    context: { repo_id: "alpha" }
  });
  assert.equal(rBob.ok, true, rBob.stderr);
  assert.doesNotMatch(rBob.stdout, /alice/);
});

test("functional conflict in user KB rejects second remember_fact", async () => {
  const w = await runTool("alice", "memory_kb_remember_fact", {
    fact: '(prefers user language "en-US")'
  });
  assert.equal(w.ok, false);
});

test("remember_fact with target_scope=repo but no repo context errors", async () => {
  const w = await runTool("alice", "memory_kb_remember_fact", {
    fact: "(some fact)",
    target_scope: "repo"
  });
  assert.equal(w.ok, false);
  assert.match(w.stderr, /target_scope=repo/);
});

test("context_files lists read paths with exists/missing markers", async () => {
  const r = await runTool("alice", "memory_kb_context_files", {
    context: { repo_id: "alpha" }
  });
  assert.equal(r.ok, true);
  assert.match(r.stdout, /exists\s+.*users\/alice\/global\.scm/);
  assert.match(r.stdout, /exists\s+.*users\/alice\/repos\/alpha\/kb\.scm/);
});
```

Note: tests rely on a `MEMORY_KB_STORAGE_ROOT` env var that `scoped-files.js` and `kb-runtime.js` must honour. We'll add that to `scoped-files.js` in Step 3.

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test
```

Expected: FAIL with `Cannot find module '../mcp/kb-runtime'`.

- [ ] **Step 3a: Update `mcp/scoped-files.js` to honour `MEMORY_KB_STORAGE_ROOT`**

Replace the `userDir` function:

```js
function storageRoot() {
  return process.env.MEMORY_KB_STORAGE_ROOT
    ? path.resolve(process.env.MEMORY_KB_STORAGE_ROOT)
    : path.join(ROOT, "storage");
}

function userDir(userId) {
  return path.join(storageRoot(), "users", safeSegment(userId));
}
```

Re-run `npm test` — the scoped-files tests should still pass (they don't set the env var).

- [ ] **Step 3b: Implement `mcp/kb-runtime.js`**

```js
"use strict";

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  scopedReadFiles,
  scopedWriteFile
} = require("./scoped-files");

const ROOT = path.resolve(__dirname, "..");

// In-process per-target-path write mutex: Map<absPath, Promise>
const writeChains = new Map();

function withWriteLock(targetPath, fn) {
  const prev = writeChains.get(targetPath) || Promise.resolve();
  const next = prev.then(fn, fn); // run even if previous rejected
  writeChains.set(targetPath, next.catch(() => {}));
  return next;
}

async function composeKb(userId, context) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "memory-kb-"));
  const kbPath = path.join(tmp, "kb.scm");

  const parts = [];
  parts.push(fs.readFileSync(path.join(ROOT, "kb", "kb.scm"), "utf8"));
  for (const file of scopedReadFiles(userId, context)) {
    if (fs.existsSync(file)) {
      parts.push(`;;; ---- begin ${file} ----`);
      parts.push(fs.readFileSync(file, "utf8"));
      parts.push(`;;; ---- end ${file} ----`);
    }
  }
  // Re-derive predicate facts after all overlays loaded.
  parts.push("(inject-predicate-facts!)");
  fs.writeFileSync(kbPath, parts.join("\n"));
  return kbPath;
}

function runScheme(kbPath, expr) {
  return new Promise((resolve) => {
    const script =
      `(load "kb/engine.scm")\n` +
      `(load ${JSON.stringify(kbPath)})\n` +
      `(load "kb/run.scm")\n` +
      expr + "\n";

    const child = spawn("mit-scheme", ["--quiet", "--batch-mode"], {
      cwd: ROOT,
      shell: false
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c) => (stdout += c.toString()));
    child.stderr.on("data", (c) => (stderr += c.toString()));
    child.on("error", (err) =>
      resolve({ ok: false, status: 127, stdout, stderr: stderr + err.message + "\n" })
    );
    child.on("close", (status) =>
      resolve({ ok: status === 0, status, stdout, stderr })
    );

    child.stdin.write(script);
    child.stdin.end();
  });
}

async function runSchemeWithCleanup(kbPath, expr) {
  try {
    return await runScheme(kbPath, expr);
  } finally {
    fs.rmSync(path.dirname(kbPath), { recursive: true, force: true });
  }
}

function appendFact(targetPath, fact) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const line = `(fact! '${fact})\n`;
  if (!fs.existsSync(targetPath)) {
    fs.writeFileSync(targetPath, `;;; scoped Memory KB\n${line}`);
    return;
  }
  const existing = fs.readFileSync(targetPath, "utf8");
  if (/;; MANUAL MEMORY END/.test(existing)) {
    const updated = existing.replace(
      /(^\s*;; MANUAL MEMORY END\s*$)/m,
      `(fact! '${fact})\n$1`
    );
    fs.writeFileSync(targetPath, updated);
  } else {
    fs.appendFileSync(targetPath, line);
  }
}

async function runTool(userId, toolName, args = {}) {
  const context = args.context || {};

  switch (toolName) {
    case "memory_kb_check": {
      const kb = await composeKb(userId, context);
      return runSchemeWithCleanup(kb, "(cli-check)");
    }
    case "memory_kb_recall": {
      const kb = await composeKb(userId, context);
      return runSchemeWithCleanup(kb, `(cli-recall (quote ${args.pattern}))`);
    }
    case "memory_kb_before_action": {
      const kb = await composeKb(userId, context);
      return runSchemeWithCleanup(kb, `(cli-test-fact (quote ${args.action}))`);
    }
    case "memory_kb_explain": {
      const kb = await composeKb(userId, context);
      return runSchemeWithCleanup(kb, `(cli-explain (quote ${args.pattern}))`);
    }
    case "memory_kb_remember_fact": {
      let writeTarget;
      try {
        writeTarget = scopedWriteFile(userId, context, args.target_scope);
      } catch (err) {
        return {
          ok: false,
          status: 64,
          stdout: "",
          stderr: `${err.message}\n`
        };
      }
      const kb = await composeKb(userId, context);
      const testResult = await runSchemeWithCleanup(
        kb,
        `(cli-test-fact (quote ${args.fact}))`
      );
      if (!testResult.ok) return testResult;
      await withWriteLock(writeTarget.path, async () => {
        appendFact(writeTarget.path, args.fact);
      });
      return testResult;
    }
    case "memory_kb_context_files": {
      const lines = scopedReadFiles(userId, context).map(
        (f) => `${fs.existsSync(f) ? "exists" : "missing"} ${f}`
      );
      return { ok: true, status: 0, stdout: lines.join("\n") + "\n", stderr: "" };
    }
    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

module.exports = { runTool, composeKb };
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add mcp/kb-runtime.js mcp/scoped-files.js tests/kb-runtime.test.js
git commit -m "feat(mcp): add shared KB runtime with per-user composition and write mutex"
```

---

### Task 5: `mcp/server-factory.js` — tool registration on SDK `McpServer`

**Files:**
- Create: `mcp/server-factory.js`
- Test: `tests/server-factory.test.js`

**Interfaces:**
- Consumes: `kb-runtime.runTool`, `@modelcontextprotocol/sdk` (`McpServer`, `StdioServerTransport`)
- Produces:
  - `buildServer(userId) -> McpServer` — an SDK `McpServer` instance with all six `memory_kb_*` tools registered; every tool handler calls `runTool(userId, ...)` with the captured `userId`
  - `TOOL_NAMES: string[]` — exported list of tool names, used by tests

The factory pattern means the same registration code serves both stdio and HTTP transports; only the transport and the `userId` source differ.

- [ ] **Step 1: Write the failing test**

Create `tests/server-factory.test.js`:

```js
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { InMemoryTransport } = require("@modelcontextprotocol/sdk/inMemory.js");

process.env.MEMORY_KB_STORAGE_ROOT = fs.mkdtempSync(
  path.join(os.tmpdir(), "kb-factory-")
);

const { buildServer, TOOL_NAMES } = require("../mcp/server-factory");

async function connectClient(server) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client(
    { name: "test-client", version: "0.0.1" },
    { capabilities: {} }
  );
  await Promise.all([
    client.connect(clientTransport),
    server.connect(serverTransport)
  ]);
  return client;
}

test("buildServer registers all six memory_kb tools", async () => {
  const server = buildServer("alice");
  const client = await connectClient(server);
  try {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    for (const expected of TOOL_NAMES) {
      assert.ok(names.includes(expected), `missing tool ${expected}`);
    }
    assert.equal(names.length, TOOL_NAMES.length);
  } finally {
    await client.close();
    await server.close();
  }
});

test("memory_kb_remember_fact + memory_kb_recall round-trip via SDK client", async () => {
  const server = buildServer("alice");
  const client = await connectClient(server);
  try {
    const w = await client.callTool({
      name: "memory_kb_remember_fact",
      arguments: { fact: '(prefers user language "zh-CN")' }
    });
    assert.equal(w.isError, false, JSON.stringify(w));

    const r = await client.callTool({
      name: "memory_kb_recall",
      arguments: { pattern: "(prefers user language ?l)" }
    });
    assert.equal(r.isError, false);
    assert.match(r.content[0].text, /zh-CN/);
  } finally {
    await client.close();
    await server.close();
  }
});

test("memory_kb_context_files returns per-user paths (regression: fs bug)", async () => {
  const server = buildServer("alice");
  const client = await connectClient(server);
  try {
    const r = await client.callTool({
      name: "memory_kb_context_files",
      arguments: { context: { repo_id: "X" } }
    });
    assert.equal(r.isError, false, JSON.stringify(r));
    assert.match(r.content[0].text, /users\/alice\/repos\/X\/kb\.scm/);
  } finally {
    await client.close();
    await server.close();
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test
```

Expected: FAIL with `Cannot find module '../mcp/server-factory'`.

- [ ] **Step 3: Implement `mcp/server-factory.js`**

```js
"use strict";

const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { z } = require("zod");

const { runTool } = require("./kb-runtime");

const TOOL_NAMES = [
  "memory_kb_check",
  "memory_kb_recall",
  "memory_kb_before_action",
  "memory_kb_explain",
  "memory_kb_remember_fact",
  "memory_kb_context_files"
];

const contextShape = {
  project_id: z.string().optional(),
  repo_id: z.string().optional(),
  repo_path: z.string().optional(),
  session_id: z.string().optional()
};
const contextSchema = z.object(contextShape).optional();

function toToolResult(r) {
  const text = [r.stdout.trimEnd(), r.stderr.trimEnd()].filter(Boolean).join("\n");
  return {
    content: [{ type: "text", text: text || "(no output)" }],
    isError: !r.ok
  };
}

function buildServer(userId) {
  const server = new McpServer({
    name: "memory-kb",
    version: "0.2.0"
  });

  server.registerTool(
    "memory_kb_check",
    {
      description:
        "Check the Memory KB for contradictions, dangling references, structure errors, and duplicates.",
      inputSchema: { context: contextSchema }
    },
    async ({ context }) => toToolResult(await runTool(userId, "memory_kb_check", { context }))
  );

  server.registerTool(
    "memory_kb_recall",
    {
      description: "Recall facts from the Memory KB using a Scheme pattern.",
      inputSchema: {
        pattern: z.string().describe("Scheme pattern, for example: (scope-type ?s)"),
        context: contextSchema
      }
    },
    async ({ pattern, context }) =>
      toToolResult(await runTool(userId, "memory_kb_recall", { pattern, context }))
  );

  server.registerTool(
    "memory_kb_before_action",
    {
      description: "Check a planned action against the Memory KB before executing it.",
      inputSchema: {
        action: z.string().describe("Scheme action fact, for example: (do delete production-db)"),
        context: contextSchema
      }
    },
    async ({ action, context }) =>
      toToolResult(await runTool(userId, "memory_kb_before_action", { action, context }))
  );

  server.registerTool(
    "memory_kb_explain",
    {
      description:
        "Show the provenance evidence chain for matching facts. Use only when explicitly requested.",
      inputSchema: {
        pattern: z.string().describe("Scheme pattern, for example: (contradiction ?message ?x ?y)"),
        context: contextSchema
      }
    },
    async ({ pattern, context }) =>
      toToolResult(await runTool(userId, "memory_kb_explain", { pattern, context }))
  );

  server.registerTool(
    "memory_kb_remember_fact",
    {
      description: "Test and append one Scheme fact if it is consistent with the current KB.",
      inputSchema: {
        fact: z.string().describe('Single Scheme fact without fact!, e.g. (prefers user language "zh-CN")'),
        context: contextSchema,
        target_scope: z
          .enum(["user", "repo", "project", "session"])
          .optional()
          .describe("Scoped storage layer to write when context is provided.")
      }
    },
    async ({ fact, context, target_scope }) =>
      toToolResult(
        await runTool(userId, "memory_kb_remember_fact", { fact, context, target_scope })
      )
  );

  server.registerTool(
    "memory_kb_context_files",
    {
      description: "List the scoped KB files that would be loaded for a context.",
      inputSchema: { context: contextSchema }
    },
    async ({ context }) =>
      toToolResult(await runTool(userId, "memory_kb_context_files", { context }))
  );

  return server;
}

module.exports = { buildServer, TOOL_NAMES };
```

Add `zod` to dependencies (SDK already depends on it, but we import it directly):

```bash
npm install zod
```

- [ ] **Step 4: Run tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add mcp/server-factory.js tests/server-factory.test.js package.json package-lock.json
git commit -m "feat(mcp): add server factory registering all tools on SDK McpServer"
```

---

### Task 6: stdio transport via `StdioServerTransport`

**Files:**
- Create: `mcp/server-stdio.js`
- Delete: `mcp/server.js`
- Modify: `scripts/test-mcp.js:9` — update path
- Modify: `.mcp.json` — update path

**Interfaces:**
- Consumes: `server-factory.buildServer`, `@modelcontextprotocol/sdk`'s `StdioServerTransport`
- Produces: a stdio MCP server binary that resolves `userId` from `MEMORY_KB_USER` env (fallback OS username) and serves the SDK protocol over stdin/stdout

- [ ] **Step 1: Create `mcp/server-stdio.js`**

```js
#!/usr/bin/env node
"use strict";

const os = require("node:os");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");

const { buildServer } = require("./server-factory");

const USER_ID = process.env.MEMORY_KB_USER || os.userInfo().username;

async function main() {
  const server = buildServer(USER_ID);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Keep process alive; SDK handles stdin/stdout lifecycle.
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Delete old `mcp/server.js`**

```bash
git rm mcp/server.js
```

- [ ] **Step 3: Update `scripts/test-mcp.js`**

Change line 9 from `path.join(root, "mcp", "server.js")` to `path.join(root, "mcp", "server-stdio.js")`.

The rest of the smoke test (raw newline-delimited JSON-RPC) still works because `StdioServerTransport` speaks the same line-delimited framing on the wire.

- [ ] **Step 4: Update `.mcp.json`**

```json
{
  "mcpServers": {
    "memory-kb": {
      "command": "node",
      "args": ["./mcp/server-stdio.js"]
    }
  }
}
```

- [ ] **Step 5: Run tests and smoke test**

```bash
npm test
node scripts/test-mcp.js
```

Expected: all `node:test` tests pass; smoke test prints `mcp checks passed`.

- [ ] **Step 6: Commit**

```bash
git add mcp/server-stdio.js mcp/server.js scripts/test-mcp.js .mcp.json
git commit -m "refactor(mcp): migrate stdio transport to SDK StdioServerTransport"
```

---

### Task 7: HTTP transport via `StreamableHTTPServerTransport` + bearer auth

**Files:**
- Create: `mcp/server-http.js`
- Test: `tests/server-http.test.js`

**Interfaces:**
- Consumes: `server-factory.buildServer`, `auth.loadTokens`, `auth.resolveUser`, `@modelcontextprotocol/sdk`'s `StreamableHTTPServerTransport`
- Produces: HTTP server on `PORT` (default 3000), MCP endpoint `/mcp` speaking the Streamable HTTP protocol; requests without a valid bearer token are rejected with HTTP 401

The transport is **stateless-per-request**: each POST spins up a fresh `McpServer` + `StreamableHTTPServerTransport({ sessionIdGenerator: undefined })`, handles the request, closes. This is the pattern the SDK recommends for simple request/response servers and avoids cross-tenant session leakage.

- [ ] **Step 1: Write the failing test**

Create `tests/server-http.test.js`:

```js
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StreamableHTTPClientTransport } = require("@modelcontextprotocol/sdk/client/streamableHttp.js");

const ROOT = path.resolve(__dirname, "..");

async function waitForPort(port, timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await fetch(`http://127.0.0.1:${port}/health`);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error("server did not start");
}

function startServer(port, tokensPath, storageRoot) {
  return spawn(process.execPath, [path.join(ROOT, "mcp", "server-http.js")], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      MEMORY_KB_TOKENS_PATH: tokensPath,
      MEMORY_KB_STORAGE_ROOT: storageRoot
    }
  });
}

function makeClient(port, token) {
  return new Client(
    { name: "test", version: "0.0.1" },
    { capabilities: {} }
  );
}

async function connectClient(port, token) {
  const transport = new StreamableHTTPClientTransport(
    new URL(`http://127.0.0.1:${port}/mcp`),
    { requestInit: { headers: { Authorization: `Bearer ${token}` } } }
  );
  const client = makeClient(port, token);
  await client.connect(transport);
  return client;
}

test("HTTP server rejects missing or invalid bearer token with 401", async () => {
  const storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kb-http-"));
  const configDir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-cfg-"));
  const tokensPath = path.join(configDir, "tokens.json");
  fs.writeFileSync(tokensPath, JSON.stringify({ "tok-alice": "alice" }));

  const port = 3741;
  const child = startServer(port, tokensPath, storageRoot);
  try {
    await waitForPort(port);

    const r1 = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream"
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "t", version: "0" }
        }
      })
    });
    assert.equal(r1.status, 401);

    const r2 = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: "Bearer wrong"
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "t", version: "0" }
        }
      })
    });
    assert.equal(r2.status, 401);
  } finally {
    child.kill();
  }
});

test("HTTP server isolates facts per token", async () => {
  const storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kb-http-"));
  const configDir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-cfg-"));
  const tokensPath = path.join(configDir, "tokens.json");
  fs.writeFileSync(
    tokensPath,
    JSON.stringify({ "tok-alice": "alice", "tok-bob": "bob" })
  );

  const port = 3742;
  const child = startServer(port, tokensPath, storageRoot);
  try {
    await waitForPort(port);

    const alice = await connectClient(port, "tok-alice");
    const bob = await connectClient(port, "tok-bob");
    try {
      const w = await alice.callTool({
        name: "memory_kb_remember_fact",
        arguments: { fact: '(prefers user language "zh-CN")' }
      });
      assert.equal(w.isError, false, JSON.stringify(w));

      const ra = await alice.callTool({
        name: "memory_kb_recall",
        arguments: { pattern: "(prefers user language ?l)" }
      });
      assert.match(ra.content[0].text, /zh-CN/);

      const rb = await bob.callTool({
        name: "memory_kb_recall",
        arguments: { pattern: "(prefers user language ?l)" }
      });
      assert.doesNotMatch(rb.content[0].text, /zh-CN/);
    } finally {
      await alice.close();
      await bob.close();
    }
  } finally {
    child.kill();
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test
```

Expected: FAIL — `mcp/server-http.js` doesn't exist.

- [ ] **Step 3: Implement `mcp/server-http.js`**

```js
#!/usr/bin/env node
"use strict";

const http = require("node:http");
const { StreamableHTTPServerTransport } = require("@modelcontextprotocol/sdk/server/streamableHttp.js");

const { loadTokens, resolveUser } = require("./auth");
const { buildServer } = require("./server-factory");

const PORT = Number(process.env.PORT || 3000);

let tokens;
try {
  tokens = loadTokens(process.env.MEMORY_KB_TOKENS_PATH);
} catch (err) {
  console.error(`failed to load tokens: ${err.message}`);
  process.exit(1);
}

function parseBearer(req) {
  const header = req.headers.authorization || "";
  const m = /^Bearer\s+(.+)$/.exec(header);
  return m ? m[1].trim() : null;
}

function send401(res) {
  res.writeHead(401, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "unauthorized" }));
}

const server = http.createServer(async (req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  if (req.url !== "/mcp") {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "not_found" }));
    return;
  }

  const token = parseBearer(req);
  const userId = resolveUser(token, tokens);
  if (!userId) {
    send401(res);
    return;
  }

  // Stateless per-request: fresh McpServer + transport per call.
  const mcpServer = buildServer(userId);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined
  });

  res.on("close", () => {
    transport.close().catch(() => {});
    mcpServer.close().catch(() => {});
  });

  try {
    await mcpServer.connect(transport);
    await transport.handleRequest(req, res);
  } catch (err) {
    console.error("MCP request failed:", err);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "internal_error" }));
    }
  }
});

server.listen(PORT, () => {
  console.log(`memory-kb MCP HTTP server listening on :${PORT}`);
});
```

- [ ] **Step 4: Run tests**

```bash
npm test
```

Expected: all tests pass (scoped-files, auth, kb-runtime, server-factory, server-http).

- [ ] **Step 5: Commit**

```bash
git add mcp/server-http.js tests/server-http.test.js
git commit -m "feat(mcp): add HTTP transport with bearer token auth via SDK StreamableHTTPServerTransport"
```

---

### Task 8: Concurrency test — parallel writes

**Files:**
- Test: `tests/kb-runtime-concurrency.test.js`

**Interfaces:**
- Consumes: `kb-runtime.runTool`
- Produces: regression test proving the per-target write mutex works

- [ ] **Step 1: Write the test**

Create `tests/kb-runtime-concurrency.test.js`:

```js
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

process.env.MEMORY_KB_STORAGE_ROOT = fs.mkdtempSync(
  path.join(os.tmpdir(), "kb-conc-")
);

const { runTool } = require("../mcp/kb-runtime");

test("parallel remember_fact calls all land in the user file", async () => {
  const facts = [
    "(note alice one)",
    "(note alice two)",
    "(note alice three)",
    "(note alice four)",
    "(note alice five)"
  ];
  const results = await Promise.all(
    facts.map((fact) =>
      runTool("alice", "memory_kb_remember_fact", { fact })
    )
  );
  for (const r of results) {
    assert.equal(r.ok, true, r.stderr);
  }

  const storageRoot = process.env.MEMORY_KB_STORAGE_ROOT;
  const userFile = path.join(storageRoot, "users", "alice", "global.scm");
  const content = fs.readFileSync(userFile, "utf8");
  for (const fact of facts) {
    assert.ok(content.includes(fact), `missing ${fact}`);
  }
});
```

- [ ] **Step 2: Run test**

```bash
npm test
```

Expected: PASS. If it fails, the write mutex in `kb-runtime.js` is not working — fix before proceeding.

- [ ] **Step 3: Commit**

```bash
git add tests/kb-runtime-concurrency.test.js
git commit -m "test(mcp): cover parallel remember_fact writes"
```

---

### Task 9: Docs — README and storage README

**Files:**
- Modify: `README.md`
- Modify: `storage/README.md`

**Interfaces:**
- Consumes: all previous tasks
- Produces: user-facing docs for HTTP transport, token provisioning, per-user storage layout

- [ ] **Step 1: Update `storage/README.md`**

Replace its content with:

```markdown
# Scoped Storage

Memory KB isolates each tenant's facts under `storage/users/<user_id>/`.
The shared engine (`kb/engine.scm`) and generic rule base (`kb/kb.scm`)
are common to all tenants.

## Layout

    storage/users/<user_id>/
      global.scm                       # user-global facts
      repos/<repo_key>/kb.scm          # facts scoped to (user, repo)
      projects/<project_id>/kb.scm     # facts scoped to (user, project)
      sessions/<session_id>/kb.scm     # facts scoped to (user, session)

`<repo_key>` is `context.repo_id` if provided, else
`path.basename(context.repo_path)`, sanitised to `[A-Za-z0-9._-]`.

## Load Order

For each tool call, the runtime composes a temporary KB by concatenating:

    kb/kb.scm                          # shared generic rules
    storage/users/<u>/global.scm       (if exists)
    storage/users/<u>/repos/<r>/kb.scm     (if context has repo)
    storage/users/<u>/projects/<p>/kb.scm  (if context has project_id)
    storage/users/<u>/sessions/<s>/kb.scm  (if context has session_id)

The engine (`kb/engine.scm`) and CLI entrypoints (`kb/run.scm`) are loaded
around this composed KB by the runtime.

## Write Target

`memory_kb_remember_fact` writes to the most specific scope present in
`context`:

    session > project > repo > user-global

`target_scope` overrides the choice. Requesting a scope without the
matching context field returns an error.

## Identity

- **HTTP transport:** the bearer token in `Authorization: Bearer <token>`
  is looked up in `config/tokens.json`. The resolved `user_id` overrides
  any `context.user_id` the client sends.
- **stdio transport:** `MEMORY_KB_USER` env var, falling back to the OS
  username.
```

- [ ] **Step 2: Update `README.md`**

In the "MCP Server" section, after the existing stdio instructions, add:

```markdown
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
```

Also update the "Available MCP tools" list to include `memory_kb_context_files`.

- [ ] **Step 3: Commit**

```bash
git add README.md storage/README.md
git commit -m "docs: document HTTP transport, token auth, and per-user storage layout"
```

---

### Task 10: Final verification

**Files:**
- Modify: none (verification only)

- [ ] **Step 1: Run full test suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 2: Run stdio smoke test**

```bash
node scripts/test-mcp.js
```

Expected: `mcp checks passed`.

- [ ] **Step 3: Run existing shell-level checks**

```bash
scripts/test-all.sh
scripts/check-kb.sh
```

Expected: `all checks passed`, no regressions in the Scheme layer.

- [ ] **Step 4: Manual end-to-end**

Use the Claude Code CLI as a real MCP client. In Terminal 1 start the server:

```bash
cp config/tokens.example.json config/tokens.json
# edit config/tokens.json: set alice token to "alice-secret", bob token to "bob-secret"
chmod 600 config/tokens.json
PORT=3000 npm run mcp:http
```

In Terminal 2, register the HTTP MCP server twice (once per token) and exercise it:

```bash
claude mcp add --transport http memory-kb-alice http://127.0.0.1:3000/mcp \
  --header "Authorization: Bearer alice-secret"
claude mcp add --transport http memory-kb-bob http://127.0.0.1:3000/mcp \
  --header "Authorization: Bearer bob-secret"

# In a Claude session: use memory-kb-alice's memory_kb_remember_fact to record
#   (prefers user language "zh-CN")
# Then use memory-kb-bob's memory_kb_recall for (prefers user language ?l)
# Expected: bob sees nothing about zh-CN.
```

Expected: Alice's write succeeds; Bob's recall does not mention `zh-CN`.

- [ ] **Step 5: Final commit**

```bash
git status  # ensure clean
git log --oneline
```
