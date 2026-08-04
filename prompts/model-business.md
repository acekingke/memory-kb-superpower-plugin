# Model Business Prompt

Before implementing a business feature, extract a domain model.

Identify:

- domain name
- business entities
- entity types
- relationships
- hierarchy
- actions
- roles and permissions
- states and transitions
- dependencies
- quantity constraints
- forbidden relations
- invariants

Represent the result as generic Scheme facts and rules.

Hard business invariants should become rules that derive `contradiction`.

The output must remain domain-scoped and must not modify global plugin defaults.
