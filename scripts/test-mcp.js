#!/usr/bin/env node
"use strict";

const { spawn } = require("node:child_process");
const path = require("node:path");
const readline = require("node:readline");

const root = path.resolve(__dirname, "..");
const server = spawn(process.execPath, [path.join(root, "mcp", "server.js")], {
  cwd: root,
  shell: false
});

const rl = readline.createInterface({ input: server.stdout });
const pending = new Map();
let nextId = 1;

function send(method, params) {
  const id = nextId++;
  const message = { jsonrpc: "2.0", id, method, params };
  server.stdin.write(`${JSON.stringify(message)}\n`);
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`timeout waiting for ${method}`));
      }
    }, 5000);
  });
}

rl.on("line", (line) => {
  const response = JSON.parse(line);
  const waiter = pending.get(response.id);
  if (!waiter) return;
  pending.delete(response.id);
  if (response.error) {
    waiter.reject(new Error(response.error.message));
  } else {
    waiter.resolve(response.result);
  }
});

let stderr = "";
server.stderr.on("data", (chunk) => {
  stderr += chunk.toString();
});

(async () => {
  const init = await send("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "memory-kb-test", version: "0.1.0" }
  });
  if (init.serverInfo.name !== "memory-kb") {
    throw new Error("unexpected server name");
  }

  const listed = await send("tools/list", {});
  const names = listed.tools.map((tool) => tool.name);
  for (const expected of ["memory_kb_check", "memory_kb_recall", "memory_kb_before_action", "memory_kb_explain"]) {
    if (!names.includes(expected)) {
      throw new Error(`missing tool: ${expected}`);
    }
  }

  const check = await send("tools/call", {
    name: "memory_kb_check",
    arguments: {}
  });
  if (check.isError || !check.content[0].text.includes("contradictions: ok")) {
    throw new Error("check tool failed");
  }

  const recall = await send("tools/call", {
    name: "memory_kb_recall",
    arguments: { pattern: "(scope-type ?s)" }
  });
  if (recall.isError || !recall.content[0].text.includes("(scope-type global)")) {
    throw new Error("recall tool failed");
  }

  const before = await send("tools/call", {
    name: "memory_kb_before_action",
    arguments: { action: "(do inspect kb)" }
  });
  if (before.isError || !before.content[0].text.includes("OK")) {
    throw new Error("before_action tool failed");
  }

  server.kill();
  console.log("mcp checks passed");
})().catch((err) => {
  server.kill();
  console.error(stderr);
  console.error(err.message);
  process.exit(1);
});
