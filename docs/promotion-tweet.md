# Launch Tweet (single, attach demo2.gif)

**Code is memory.**

An agent that remembers in plain Scheme — inspectable, git-diffable, validated on write, deterministic on recall.

No vector blobs. No hallucinated memories.

→ https://github.com/acekingke/memory-kb-superpower-plugin

(attach demo2.gif)

---

# Follow-up Thread (reply to launch tweet)

**Code is memory. 🧠**

Most AI agent memory = opaque vector blobs. You can't read them, can't diff them, can't trust them.

We built **Memory KB Superpower Plugin** — your agent's memory as auditable Scheme code.

🧵 ↓

**1/ The problem**

Agents forget. Or worse — they "remember" things that were never true. Vector embeddings give fuzzy retrieval, no guarantees, no way to review what your agent believes.

**2/ Memory should be source code**

Facts and rules live in plain Scheme files:
- inspectable — open them in any editor
- diffable — every change shows up in `git diff`
- versionable — `git revert` undoes a bad memory

**3/ Deterministic inference**

A tail-recursive forward-chaining engine on MIT Scheme. Same KB → same answers, every time. No hallucinated memories. No retrieval drift.

**4/ Write-time validation**

`remember-fact.sh` checks a new fact against the existing KB *before* accepting it. Functional constraints (like "user prefers Chinese") reject conflicting updates instead of silently overwriting old knowledge.

**5/ Action gating**

`before-action` tests a planned action against remembered constraints and returns OK / REDUNDANT / REJECT. Stops rule violations *before* they happen — not explains them afterwards.

**6/ Explainability on demand**

Every derivation records provenance. Normal output stays concise; ask `explain` and you get the full fact-and-rule evidence chain.

**7/ MCP-native**

The whole KB is exposed through MCP tools, so Claude Code (or any MCP client) gets durable, validated memory out of the box.

Repo: <link — fill in after making repo public>

Try it, break it, tell us what your agent remembered.
