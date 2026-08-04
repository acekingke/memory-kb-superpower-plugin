# Scoped Storage

Memory KB can support multi-user and multi-project isolation by composing a
temporary knowledge base from scoped files.

MCP tools may receive an optional `context` object:

```json
{
  "user_id": "kyc",
  "project_id": "AlphaZero",
  "repo_path": "/Users/kyc/homework/tmp/AlphaZero",
  "session_id": "session-20260728"
}
```

The server should load scoped files in this order:

```text
kb/engine.scm
kb/kb.scm
storage/users/<user_id>/global.scm
storage/repos/<repo_id-or-repo-basename>/kb.scm
storage/projects/<project_id>/kb.scm
storage/sessions/<session_id>/kb.scm
kb/run.scm
```

Missing scoped files are skipped.

`memory_kb_remember_fact` should write to the most specific available scope by
default:

```text
session > project > repo > user
```

This keeps the Scheme engine pure. The MCP server owns context selection,
storage isolation, and temporary KB composition.
