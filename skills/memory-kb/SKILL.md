---
name: memory-kb
description: Use when the user asks to remember information, recall prior context, model business domains, or check planned actions against remembered constraints using the Scheme-backed knowledge base.
---

# Memory KB

This skill provides a generic memory and reasoning workflow backed by MIT Scheme.

Use it when:

- the user asks the assistant to remember something
- the user asks what is known about a topic, task, entity, preference, or project
- the user asks to build a non-trivial business system
- a planned action may violate remembered constraints
- a user correction should become future guidance

## Core Rule

The knowledge base is source code. The model may propose Scheme facts and rules, but candidate changes must be checked before they are accepted.

## Required Workflow

1. Recall before thinking.
2. Model before building.
3. Check before acting.
4. Explain before blocking.
5. Summarize before forgetting.

## Knowledge Categories

Represent generic knowledge only:

- environment knowledge: date, timezone, cwd, repo, session
- task knowledge: task, plan, status, dependencies, constraints, completion conditions
- entities and relations: entity, type, attribute, relation, references
- user preferences: long-term, project, repo, or session preferences
- business models: domains, entities, actions, states, transitions, invariants
- rules and constraints: do, avoid, must, ask-user, contradiction
- source and scope: where a memory came from and where it applies
- lifecycle: ephemeral, session, project, long-term, archived

Do not hard-code domain examples into the generic plugin. Domain-specific facts belong in scoped memory records.

## MIT Scheme Commands

Run from the plugin root:

```sh
scripts/check-kb.sh
scripts/recall.sh "(predicate ?name ?arity)"
scripts/recall.sh "(prefers ?who ?key ?value)"
scripts/remember-fact.sh "(prefers user language zh-CN)"
scripts/explain.sh "(contradiction ?message ?x ?y)"
```

Before drilling into specific facts, run `recall.sh "(predicate ?name ?arity)"` to enumerate the predicates that currently exist in the KB — this sees both literal `fact!` predicates and rule-derived ones. Do not `Read` `kb/kb.scm` to discover structure.

`remember-fact.sh` only accepts a single Scheme fact expression. More complex changes should be generated as a patch and checked against a candidate KB before applying.

MIT Scheme folds unescaped symbols to lowercase. Use strings or vertical-bar symbols for case-sensitive values such as language tags, file paths, acronyms, or IDs.

## Slash Command Convention

Do not show provenance by default. When the user explicitly asks for evidence,
why a result was derived, or uses a slash command, expand the evidence chain.

Recognize:

```text
/memory-kb-explain <pattern-or-last-result>
```

Use `scripts/explain.sh` to show matching facts and the rule/premise chain that produced them.

## Business Modeling

Before implementing a business system, extract:

- domain name
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
- invariants

Then express the model as Scheme facts and rules and run `scripts/check-kb.sh`.

## Safe Write Protocol

For new memory:

1. Decide scope and lifecycle.
2. Generate candidate `fact!` and `rule!` forms.
3. Preserve source metadata.
4. Check with MIT Scheme.
5. Apply only if no contradiction is found.
6. If rejected, explain the contradiction and ask the user whether to cancel, replace old memory, narrow scope, or add an exception.

## Before Action Protocol

For a planned action:

1. Convert the action into a temporary fact, usually `(do ...)`.
2. Test it with the current KB.
3. If it derives `contradiction`, stop and explain.
4. If it derives `ask-user`, ask for confirmation.
5. If it derives `avoid`, adjust the plan.
6. If no issues are found, continue.
