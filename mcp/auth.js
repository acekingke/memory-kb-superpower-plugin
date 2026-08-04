"use strict";

const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_TOKENS_PATH = path.resolve(__dirname, "..", "config", "tokens.json");

function loadTokens(filePath = DEFAULT_TOKENS_PATH) {
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw);
  if (
    !parsed ||
    typeof parsed !== "object" ||
    Array.isArray(parsed)
  ) {
    throw new Error(`tokens file must be a JSON object: ${filePath}`);
  }
  for (const [token, user] of Object.entries(parsed)) {
    if (typeof token !== "string" || typeof user !== "string" || !user) {
      throw new Error(`tokens file must map string tokens to non-empty string user_ids`);
    }
  }
  return parsed;
}

function resolveUser(token, tokens) {
  if (!token || typeof token !== "string") return null;
  return tokens[token] || null;
}

module.exports = { loadTokens, resolveUser, DEFAULT_TOKENS_PATH };
