---
name: doc-generator
description: Generate documentation using the Diataxis framework.
triggers:
  - write docs
  - generate documentation
  - update readme
---

## Documentation protocol (Diataxis)

1. Read the module or feature fully before writing a word. Docs describe what IS, never what was planned.
2. Classify each doc need: tutorial (first success), how-to (specific task), reference (API facts), explanation (why).
3. Reference sections must contain only verifiable facts: signatures, defaults, errors. Verify each against source.
4. Update, do not duplicate: extend existing README/docs rather than creating parallel documents.
5. Finish by re-reading the doc and marking every claim you could not verify with source as [UNVERIFIED].
