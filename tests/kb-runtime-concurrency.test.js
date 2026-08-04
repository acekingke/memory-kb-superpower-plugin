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
