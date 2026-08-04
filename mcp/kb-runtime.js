"use strict";

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  scopedReadFiles,
  scopedWriteFile,
  safeSegment
} = require("./scoped-files");

const ROOT = path.resolve(__dirname, "..");

// In-process per-target-path write mutex: Map<absPath, Promise>
const writeChains = new Map();

function withWriteLock(targetPath, fn) {
  const prev = writeChains.get(targetPath) || Promise.resolve();
  const next = prev.then(fn, fn); // run even if previous rejected
  writeChains.set(targetPath, next.catch(() => {}));
  return next;
}

async function composeKb(userId, context) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "memory-kb-"));
  const kbPath = path.join(tmp, "kb.scm");

  const parts = [];
  parts.push(fs.readFileSync(path.join(ROOT, "kb", "kb.scm"), "utf8"));
  for (const file of scopedReadFiles(userId, context)) {
    if (fs.existsSync(file)) {
      parts.push(`;;; ---- begin ${file} ----`);
      parts.push(fs.readFileSync(file, "utf8"));
      parts.push(`;;; ---- end ${file} ----`);
    }
  }
  // Re-derive predicate facts after all overlays loaded.
  parts.push("(inject-predicate-facts!)");
  fs.writeFileSync(kbPath, parts.join("\n"));
  return kbPath;
}

function runScheme(kbPath, expr) {
  return new Promise((resolve) => {
    const script =
      `(load "kb/engine.scm")\n` +
      `(load ${JSON.stringify(kbPath)})\n` +
      `(load "kb/run.scm")\n` +
      expr + "\n";

    const child = spawn("mit-scheme", ["--quiet", "--batch-mode"], {
      cwd: ROOT,
      shell: false
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c) => (stdout += c.toString()));
    child.stderr.on("data", (c) => (stderr += c.toString()));
    child.on("error", (err) =>
      resolve({ ok: false, status: 127, stdout, stderr: stderr + err.message + "\n" })
    );
    child.on("close", (status) =>
      resolve({ ok: status === 0, status, stdout, stderr })
    );

    child.stdin.write(script);
    child.stdin.end();
  });
}

async function runSchemeWithCleanup(kbPath, expr) {
  try {
    return await runScheme(kbPath, expr);
  } finally {
    fs.rmSync(path.dirname(kbPath), { recursive: true, force: true });
  }
}

function appendFact(targetPath, fact) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const line = `(fact! '${fact})\n`;
  if (!fs.existsSync(targetPath)) {
    fs.writeFileSync(targetPath, `;;; scoped Memory KB\n${line}`);
    return;
  }
  const existing = fs.readFileSync(targetPath, "utf8");
  if (/;; MANUAL MEMORY END/.test(existing)) {
    const updated = existing.replace(
      /(^\s*;; MANUAL MEMORY END\s*$)/m,
      `(fact! '${fact})\n$1`
    );
    fs.writeFileSync(targetPath, updated);
  } else {
    fs.appendFileSync(targetPath, line);
  }
}

async function runTool(userId, toolName, args = {}) {
  const context = args.context || {};

  switch (toolName) {
    case "memory_kb_check": {
      const kb = await composeKb(userId, context);
      return runSchemeWithCleanup(kb, "(cli-check)");
    }
    case "memory_kb_recall": {
      const kb = await composeKb(userId, context);
      return runSchemeWithCleanup(kb, `(cli-recall (quote ${args.pattern}))`);
    }
    case "memory_kb_before_action": {
      const kb = await composeKb(userId, context);
      return runSchemeWithCleanup(kb, `(cli-test-fact (quote ${args.action}))`);
    }
    case "memory_kb_explain": {
      const kb = await composeKb(userId, context);
      return runSchemeWithCleanup(kb, `(cli-explain (quote ${args.pattern}))`);
    }
    case "memory_kb_remember_fact": {
      let writeTarget;
      try {
        writeTarget = scopedWriteFile(userId, context, args.target_scope);
      } catch (err) {
        return {
          ok: false,
          status: 64,
          stdout: "",
          stderr: `${err.message}\n`
        };
      }
      const kb = await composeKb(userId, context);
      const testResult = await runSchemeWithCleanup(
        kb,
        `(cli-test-fact (quote ${args.fact}))`
      );
      if (!testResult.ok) return testResult;
      await withWriteLock(writeTarget.path, async () => {
        appendFact(writeTarget.path, args.fact);
      });
      return testResult;
    }
    case "memory_kb_context_files": {
      const lines = scopedReadFiles(userId, context).map(
        (f) => `${fs.existsSync(f) ? "exists" : "missing"} ${f}`
      );
      // Also list slot directories for scopes not present in context, marked
      // missing, so callers can see the full canonical layout.
      const userRoot = path.join(
        process.env.MEMORY_KB_STORAGE_ROOT
          ? path.resolve(process.env.MEMORY_KB_STORAGE_ROOT)
          : path.join(ROOT, "storage"),
        "users",
        safeSegment(userId)
      );
      if (!context.repo_id && !context.repo_path) {
        lines.push(`missing ${path.join(userRoot, "repos")}`);
      }
      if (!context.project_id) {
        lines.push(`missing ${path.join(userRoot, "projects")}`);
      }
      if (!context.session_id) {
        lines.push(`missing ${path.join(userRoot, "sessions")}`);
      }
      return { ok: true, status: 0, stdout: lines.join("\n") + "\n", stderr: "" };
    }
    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

module.exports = { runTool, composeKb };
