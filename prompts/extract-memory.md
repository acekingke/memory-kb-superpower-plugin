# Extract Memory Prompt

Convert the user's natural language memory into generic Scheme `fact!` and `rule!` forms.

Rules:

- Keep the plugin generic.
- Do not add domain-specific defaults unless the user supplied them.
- Include source, scope, and lifecycle facts when possible.
- Prefer stable predicates: `entity`, `type`, `attribute`, `relation`, `prefers`, `task`, `status`, `dep`, `constraint`, `domain-*`.
- Use `contradiction` only for hard violations.
- Use `ask-user` for actions that require confirmation.
- Generate a patch; do not assume it has been applied.

Output:

1. Short explanation.
2. Proposed Scheme patch.
3. Suggested scope and lifecycle.
4. Risks or conflicts to check.
