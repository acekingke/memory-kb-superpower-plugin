# Memory KB Superpower Plugin Specification

## 1. Goal

Build a general-purpose memory and reasoning plugin that lets an AI assistant maintain a Scheme-based knowledge base, model business domains, and check future actions against remembered constraints.

The plugin is not domain-specific. Examples such as courses, MySQL, lesson branches, or permission systems are only examples. The plugin itself must provide abstract memory, modeling, reasoning, and workflow capabilities.

## 2. Core Idea

The large language model is responsible for understanding natural language and generating structured knowledge.

MIT Scheme is responsible for deterministic reasoning:

- deriving facts from rules
- detecting contradictions
- checking invariants
- rejecting unsafe actions
- explaining why an action is blocked

The knowledge base is treated as source code. The model may propose edits to `kb.scm`, but those edits must be checked before they are accepted.

## 3. Runtime Requirement

Use MIT Scheme as the Scheme interpreter.

Expected command style:

```sh
mit-scheme --quiet --batch-mode < script.scm
```

The plugin should provide wrappers so the AI does not call raw Scheme scripts directly in normal use.

## 4. Knowledge Categories

The generic plugin should support these categories.

### 4.1 Environment Knowledge

Runtime and session context:

- current date
- timezone
- working directory
- current repository
- current branch
- current session
- user language preference

Example:

```scheme
(fact! '(today "2026-06-27"))
(fact! '(timezone Asia/Shanghai))
(fact! '(cwd "/path/to/workspace"))
(fact! '(current-repo my-repo))
(fact! '(user-language zh-CN))
```

Environment knowledge is usually ephemeral or session-scoped.

### 4.2 Task Knowledge

Tasks, plans, status, dependencies, constraints, and completion conditions.

Example:

```scheme
(fact! '(task design-plugin "Design generic memory reasoning plugin"))
(fact! '(status design-plugin in-progress))
(fact! '(dep implement-plugin design-plugin))
(fact! '(constraint design-plugin no-modify-reference-dir))
```

Tasks should support:

- `task`
- `status`
- `dep`
- `constraint`
- `done`
- `blocked`
- `ready`
- completion conditions

### 4.3 Entity and Relation Knowledge

Generic representation of real or conceptual things.

Example:

```scheme
(fact! '(entity user-1))
(fact! '(type user-1 user))
(fact! '(attribute user-1 language zh-CN))
(fact! '(relation owns user-1 project-1))
```

The plugin should prefer stable abstract predicates:

- `entity`
- `type`
- `attribute`
- `relation`
- `references`

Domain-specific predicates may be generated when useful, but they should remain scoped to the relevant domain.

### 4.4 User Preference

Long-term, project-level, or temporary user preferences.

Example:

```scheme
(fact! '(prefers user language zh-CN))
(fact! '(prefers user answer-style concise))
(fact! '(prefers user confirmation-before destructive-action))
```

Preference conflicts should be detected before accepting new preferences.

### 4.5 Business Model

Business modeling is a required workflow step for non-trivial product or system requests.

The model should extract:

- business entities
- entity types
- relationships
- hierarchy
- roles and permissions
- actions
- states and transitions
- dependencies
- quantity constraints
- forbidden relations
- business invariants

Example:

```scheme
(fact! '(domain permission-system))
(fact! '(domain-entity permission-system general-manager role))
(fact! '(domain-entity permission-system department-manager role))
(fact! '(domain-entity permission-system project-lead role))
(fact! '(domain-relation permission-system higher-than general-manager department-manager))
(fact! '(domain-relation permission-system higher-than department-manager project-lead))
(fact! '(domain-action permission-system approve-budget))
(fact! '(domain-capability permission-system general-manager approve-budget))
(fact! '(domain-invariant permission-system no-upward-permission))
```

The purpose of business modeling is to turn natural language requirements into checkable business constraints before code is generated.

### 4.6 Rules and Constraints

Rules are action-affecting memory. They should use generic conclusions:

- `do`
- `avoid`
- `must`
- `ask-user`
- `contradiction`

Example:

```scheme
(rule! 'reject-forbidden-action
       '((do ?action ?target)
         (forbidden ?action ?target))
       '((contradiction "Forbidden action" ?action ?target)))
```

Hard safety or correctness rules should produce `contradiction`.

Soft guidance should produce `do`, `avoid`, `must`, or `ask-user`.

### 4.7 Source and Scope

Every memory should preserve provenance and scope.

Example:

```scheme
(fact! '(memory-node preference mem-001))
(fact! '(source mem-001 user-message))
(fact! '(source-text mem-001 "Please answer in Chinese by default."))
(fact! '(scope mem-001 global))
(fact! '(created-at mem-001 "2026-06-27"))
```

Required scopes:

- `global`
- `project`
- `repo`
- `session`
- `domain`

### 4.8 Lifecycle

Memory lifecycle controls when a memory should be used.

Recommended lifecycle values:

- `ephemeral`
- `session`
- `project`
- `long-term`
- `archived`

Example:

```scheme
(fact! '(lifecycle mem-001 long-term))
(fact! '(lifecycle mem-002 session))
```

## 5. Knowledge Base Authoring Model

The model may generate Scheme facts and rules directly.

However, writes must use a safe protocol:

1. Generate a candidate patch.
2. Apply the patch to a temporary candidate KB.
3. Run MIT Scheme checks.
4. If checks pass, apply the patch to the real KB.
5. If checks fail, explain the conflict and ask the user how to proceed.

The plugin should not blindly append unvalidated Scheme to `kb.scm`.

## 6. Suggested File Layout

```text
memory-kb-superpower-plugin/
  .codex-plugin/
    plugin.json
  docs/
    spec.md
  kb/
    engine.scm
    kb.scm
    schema.scm
    run.scm
  prompts/
    extract-memory.md
    model-business.md
    propose-kb-patch.md
  tools/
    recall
    remember
    model_business
    before_action
    check_kb
    explain
  storage/
    global/
    project/
    repo/
    session/
    domain/
    archive/
  tests/
    test-engine.scm
    test-consistency.scm
    test-business-model.scm
```

The existing prototype files can be reorganized into this layout later.

## 7. Tool Interface

The plugin should expose AI-friendly tools.

### 7.1 `recall(query)`

Find relevant memories, facts, rules, and derived conclusions.

Input may be natural language or a structured pattern.

### 7.2 `remember(text, scope?)`

Convert natural language memory into candidate facts/rules.

Then run the safe write protocol.

### 7.3 `model_business(requirement_text, scope?)`

Extract business entities, relations, states, permissions, constraints, and invariants.

This should be called before implementing non-trivial business systems.

### 7.4 `propose_kb_patch(text)`

Generate a patch without applying it.

Useful for review and debugging.

### 7.5 `apply_kb_patch_checked(patch)`

Apply a generated patch only after Scheme checks pass.

### 7.6 `check_kb()`

Run consistency, structure, duplicate, dangling-reference, and invariant checks.

### 7.7 `before_action(action)`

Convert a planned action into a temporary fact, run inference, and block or adjust the action if it violates known constraints.

Example action:

```scheme
(do grant project-lead approve-budget)
```

### 7.8 `explain(item)`

Explain why a fact was derived or why an action was rejected.

This requires provenance support in the inference engine.

Explanations should be opt-in. The default workflow should report concise
results only. If the user asks for evidence or uses the slash-style command
`/memory-explain`, the plugin should show the provenance chain.

Suggested convention:

```text
/memory-explain <pattern-or-last-result>
```

## 8. Core Workflows

### 8.1 Session Startup

1. Read environment.
2. Determine current workspace, repo, and session.
3. Recall relevant global, project, repo, and session memories.
4. Generate a compact working context.
5. Avoid loading the entire KB into the model context.

### 8.2 Remembering New Knowledge

1. User says something that should be remembered.
2. Determine scope and lifecycle.
3. Extract facts and rules.
4. Generate candidate KB patch.
5. Check with MIT Scheme.
6. Apply if valid.
7. Explain conflict if invalid.

### 8.3 Business Modeling Before Building

1. User asks for a business system or feature.
2. Extract business model.
3. Identify invariants and constraints.
4. Write candidate model facts/rules.
5. Check model consistency.
6. Use the model to guide implementation.
7. Re-check generated design or code against the model.

### 8.4 Before Action Check

1. Convert planned action to a Scheme fact.
2. Temporarily add it to the KB.
3. Run forward-chaining inference.
4. Check contradictions and required confirmations.
5. Continue, adjust, ask the user, or stop.

### 8.5 Task Completion

1. Summarize completed work.
2. Update task status.
3. Record stable project knowledge.
4. Ask whether useful session knowledge should become long-term memory.
5. Archive or discard ephemeral memory.

### 8.6 Periodic Maintenance

1. Run full KB check.
2. Find duplicates.
3. Find dangling references.
4. Find expired memories.
5. Find rules that never match.
6. Suggest cleanup patches.

## 9. Inference Engine Requirements

The Scheme engine should support:

- variable matching
- template instantiation
- forward chaining
- fixpoint derivation
- contradiction detection
- structural checks
- duplicate detection
- dangling-reference detection

Future engine improvements:

- provenance tracking
- explanation graph
- scoped inference
- built-in comparisons
- cardinality checks
- negation-as-failure or explicit absence checks
- incremental inference

## 10. Business Constraint Example

For a generic permission hierarchy:

```scheme
(fact! '(role-level general-manager 3))
(fact! '(role-level department-manager 2))
(fact! '(role-level project-lead 1))

(fact! '(permission-level approve-budget 3))
(fact! '(permission-level approve-department-budget 2))
(fact! '(permission-level assign-task 1))

(fact! '(greater-than 3 2))
(fact! '(greater-than 3 1))
(fact! '(greater-than 2 1))

(rule! 'reject-role-permission-above-level
       '((role-permission ?role ?perm)
         (role-level ?role ?role-level)
         (permission-level ?perm ?perm-level)
         (greater-than ?perm-level ?role-level))
       '((contradiction "Role has permission above its level" ?role ?perm)))
```

If the model proposes:

```scheme
(fact! '(role-permission project-lead approve-budget))
```

The engine derives:

```scheme
(contradiction "Role has permission above its level" project-lead approve-budget)
```

The plugin must reject or ask for user confirmation before proceeding.

## 11. Design Principles

- Keep the plugin generic.
- Let the LLM extract facts and rules from natural language.
- Let MIT Scheme validate, infer, and reject contradictions.
- Model business constraints before implementing business systems.
- Check before acting.
- Explain before blocking.
- Preserve source, scope, and lifecycle for every memory.
- Never treat generated KB edits as valid until checked.

## 12. Short Motto

```text
Recall before thinking.
Model before building.
Check before acting.
Explain before blocking.
Summarize before forgetting.
```
