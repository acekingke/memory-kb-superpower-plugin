# Propose KB Patch Prompt

Generate a minimal patch to `kb/kb.scm`.

Patch requirements:

- Preserve existing facts and rules.
- Append user memories between `MANUAL MEMORY START` and `MANUAL MEMORY END` when possible.
- Include comments with source, scope, lifecycle, and creation date.
- Do not overwrite generic defaults.
- Do not apply the patch until Scheme checks pass.
