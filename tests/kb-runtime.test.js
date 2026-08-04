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
  assert.match(r.stdout, /missing\s+.*users\/alice\/projects/);
});
