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
