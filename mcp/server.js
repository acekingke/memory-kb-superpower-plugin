#!/usr/bin/env node
"use strict";

const { spawn } = require("node:child_process");
const path = require("node:path");
const readline = require("node:readline");

const root = path.resolve(__dirname, "..");

const contextSchema = {
  type: "object",
  description: "Optional KB selection context for scoped storage.",
  properties: {
    user_id: { type: "string" },
    project_id: { type: "string" },
    repo_id: { type: "string" },
    repo_path: { type: "string" },
    session_id: { type: "string" }
  },
  additionalProperties: false
};

const tools = [
  {
    name: "memory_kb_check",
    description: "Check the Memory KB for contradictions, dangling references, structure errors, and duplicates.",
    inputSchema: {
      type: "object",
      properties: {
        context: contextSchema
      },
      additionalProperties: false
    }
  },
  {
    name: "memory_kb_recall",
    description: "Recall facts from the Memory KB using a Scheme pattern.",
    inputSchema: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: "Scheme pattern, for example: (scope-type ?s)"
        },
        context: contextSchema
      },
      required: ["pattern"],
      additionalProperties: false
    }
  },
  {
    name: "memory_kb_before_action",
    description: "Check a planned action against the Memory KB before executing it.",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: "Scheme action fact, for example: (do delete production-db)"
        },
        context: contextSchema
      },
      required: ["action"],
      additionalProperties: false
    }
  },
  {
    name: "memory_kb_explain",
    description: "Show the provenance evidence chain for matching facts. Use only when explicitly requested.",
    inputSchema: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: "Scheme pattern, for example: (contradiction ?message ?x ?y)"
        },
        context: contextSchema
      },
      required: ["pattern"],
      additionalProperties: false
    }
  },
  {
    name: "memory_kb_remember_fact",
    description: "Test and append one Scheme fact if it is consistent with the current KB.",
    inputSchema: {
      type: "object",
      properties: {
        fact: {
          type: "string",
          description: "Single Scheme fact without fact!, for example: (prefers user language \"zh-CN\")"
        },
        context: contextSchema,
        target_scope: {
          type: "string",
          enum: ["user", "repo", "project", "session"],
          description: "Scoped storage layer to write when context is provided."
        }
      },
      required: ["fact"],
      additionalProperties: false
    }
  },
  {
    name: "memory_kb_context_files",
    description: "List the scoped KB files that would be loaded for a context.",
    inputSchema: {
      type: "object",
      properties: {
        context: contextSchema
      },
      additionalProperties: false
    }
  }
];

function scriptPath(name) {
  return path.join(root, "scripts", name);
}

function runScript(script, args = []) {
  return new Promise((resolve) => {
    const child = spawn(scriptPath(script), args, {
      cwd: root,
      env: process.env,
      shell: false
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      resolve({
        ok: false,
        status: 127,
        stdout,
        stderr: `${stderr}${error.message}\n`
      });
    });
    child.on("close", (status) => {
      resolve({
        ok: status === 0,
        status,
        stdout,
        stderr
      });
    });
  });
}

function safeSegment(value) {
  return String(value)
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96) || "default";
}

function repoKey(context = {}) {
  if (context.repo_id) return safeSegment(context.repo_id);
  if (context.repo_path) return safeSegment(path.basename(context.repo_path));
  return null;
}

function scopedFiles(context = {}) {
  const files = [];
  if (context.user_id) {
    files.push(path.join(root, "storage", "users", safeSegment(context.user_id), "global.scm"));
  }
  const repo = repoKey(context);
  if (repo) {
    files.push(path.join(root, "storage", "repos", repo, "kb.scm"));
  }
  if (context.project_id) {
    files.push(path.join(root, "storage", "projects", safeSegment(context.project_id), "kb.scm"));
  }
  if (context.session_id) {
    files.push(path.join(root, "storage", "sessions", safeSegment(context.session_id), "kb.scm"));
  }
  return files;
}

function textContent(text) {
  return [{ type: "text", text }];
}

async function callTool(name, args) {
  switch (name) {
    case "memory_kb_check":
      return runScript("check-kb.sh");
    case "memory_kb_recall":
      return runScript("recall.sh", [args.pattern]);
    case "memory_kb_before_action":
      return runScript("before-action.sh", [args.action]);
    case "memory_kb_explain":
      return runScript("explain.sh", [args.pattern]);
    case "memory_kb_remember_fact":
      return runScript("remember-fact.sh", [args.fact]);
    case "memory_kb_context_files":
      return {
        ok: true,
        status: 0,
        stdout: scopedFiles(args.context || {})
          .map((file) => `${fs.existsSync(file) ? "exists" : "missing"} ${file}`)
          .join("\n") + "\n",
        stderr: ""
      };
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function result(id, value) {
  send({ jsonrpc: "2.0", id, result: value });
}

function error(id, code, message) {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

async function handle(request) {
  const { id, method, params = {} } = request;

  if (method === "initialize") {
    result(id, {
      protocolVersion: "2024-11-05",
      capabilities: {
        tools: {}
      },
      serverInfo: {
        name: "memory-kb",
        version: "0.1.0"
      }
    });
    return;
  }

  if (method === "notifications/initialized") {
    return;
  }

  if (method === "tools/list") {
    result(id, { tools });
    return;
  }

  if (method === "tools/call") {
    try {
      const toolResult = await callTool(params.name, params.arguments || {});
      const output = [
        toolResult.stdout.trimEnd(),
        toolResult.stderr.trimEnd()
      ].filter(Boolean).join("\n");
      result(id, {
        content: textContent(output || "(no output)"),
        isError: !toolResult.ok
      });
    } catch (err) {
      error(id, -32602, err.message);
    }
    return;
  }

  error(id, -32601, `Method not found: ${method}`);
}

const rl = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity
});

rl.on("line", (line) => {
  if (!line.trim()) return;
  let request;
  try {
    request = JSON.parse(line);
  } catch (err) {
    error(null, -32700, `Parse error: ${err.message}`);
    return;
  }
  handle(request).catch((err) => {
    error(request.id ?? null, -32603, err.message);
  });
});
