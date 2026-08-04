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
