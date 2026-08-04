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
