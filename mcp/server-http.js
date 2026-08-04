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
