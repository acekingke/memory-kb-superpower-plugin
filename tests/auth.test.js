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
