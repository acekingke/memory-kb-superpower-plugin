# Scoped Storage

Memory KB isolates each tenant's facts under `storage/users/<user_id>/`.
The shared engine (`kb/engine.scm`) and generic rule base (`kb/kb.scm`)
are common to all tenants.

## Layout

    storage/users/<user_id>/
      global.scm                       # user-global facts
      repos/<repo_key>/kb.scm          # facts scoped to (user, repo)
      projects/<project_id>/kb.scm     # facts scoped to (user, project)
      sessions/<session_id>/kb.scm     # facts scoped to (user, session)

`<repo_key>` is `context.repo_id` if provided, else
`path.basename(context.repo_path)`, sanitised to `[A-Za-z0-9._-]`.

## Load Order

For each tool call, the runtime composes a temporary KB by concatenating:

    kb/kb.scm                          # shared generic rules
    storage/users/<u>/global.scm       (if exists)
    storage/users/<u>/repos/<r>/kb.scm     (if context has repo)
    storage/users/<u>/projects/<p>/kb.scm  (if context has project_id)
    storage/users/<u>/sessions/<s>/kb.scm  (if context has session_id)

The engine (`kb/engine.scm`) and CLI entrypoints (`kb/run.scm`) are loaded
around this composed KB by the runtime.

## Write Target

`memory_kb_remember_fact` writes to the most specific scope present in
`context`:

    session > project > repo > user-global

`target_scope` overrides the choice. Requesting a scope without the
matching context field returns an error.

## Identity

- **HTTP transport:** the bearer token in `Authorization: Bearer <token>`
  is looked up in `config/tokens.json`. The resolved `user_id` overrides
  any `context.user_id` the client sends.
- **stdio transport:** `MEMORY_KB_USER` env var, falling back to the OS
  username.
