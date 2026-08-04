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
