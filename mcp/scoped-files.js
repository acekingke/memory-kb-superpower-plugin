"use strict";

const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

function safeSegment(value) {
  return (
    String(value)
      .trim()
      .replace(/[^A-Za-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 96) || "default"
  );
}

function repoKey(context = {}) {
  if (context.repo_id) return safeSegment(context.repo_id);
  if (context.repo_path) return safeSegment(path.basename(context.repo_path));
  return null;
}

function storageRoot() {
  return process.env.MEMORY_KB_STORAGE_ROOT
    ? path.resolve(process.env.MEMORY_KB_STORAGE_ROOT)
    : path.join(ROOT, "storage");
}

function userDir(userId) {
  return path.join(storageRoot(), "users", safeSegment(userId));
}

function scopedReadFiles(userId, context = {}) {
  const files = [path.join(userDir(userId), "global.scm")];
  const repo = repoKey(context);
  if (repo) files.push(path.join(userDir(userId), "repos", repo, "kb.scm"));
  if (context.project_id) {
    files.push(
      path.join(userDir(userId), "projects", safeSegment(context.project_id), "kb.scm")
    );
  }
  if (context.session_id) {
    files.push(
      path.join(userDir(userId), "sessions", safeSegment(context.session_id), "kb.scm")
    );
  }
  return files;
}

function scopedWriteFile(userId, context = {}, targetScope) {
  const dir = userDir(userId);
  const repo = repoKey(context);

  const candidates = {
    session: context.session_id
      ? path.join(dir, "sessions", safeSegment(context.session_id), "kb.scm")
      : null,
    project: context.project_id
      ? path.join(dir, "projects", safeSegment(context.project_id), "kb.scm")
      : null,
    repo: repo ? path.join(dir, "repos", repo, "kb.scm") : null,
    user: path.join(dir, "global.scm")
  };

  if (targetScope) {
    if (!Object.prototype.hasOwnProperty.call(candidates, targetScope)) {
      const err = new Error(`unknown target_scope: ${targetScope}`);
      err.code = "UNKNOWN_SCOPE";
      throw err;
    }
    if (!candidates[targetScope]) {
      const err = new Error(
        `target_scope=${targetScope} requires the matching context field`
      );
      err.code = "MISSING_CONTEXT";
      throw err;
    }
    return { path: candidates[targetScope], scope: targetScope };
  }

  for (const scope of ["session", "project", "repo", "user"]) {
    if (candidates[scope]) return { path: candidates[scope], scope };
  }
  // unreachable: candidates.user is always set
  throw new Error("no write target resolved");
}

module.exports = {
  repoKey,
  scopedReadFiles,
  scopedWriteFile,
  safeSegment
};
