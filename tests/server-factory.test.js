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
