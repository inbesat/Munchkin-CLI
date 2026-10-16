---
name: commit-linter
description: Conventional-commit validation and atomic splitting.
triggers:
  - commit this
  - split commits
  - fix commit message
---

## Commit protocol

1. One logical change per commit. Mixed refactor + feature + docs means: split it.
2. Conventional prefixes: feat:, fix:, refactor:, test:, docs:, chore:. Scope optional, e.g. `fix(core):`.
3. Subject line: imperative mood, <= 72 chars, no trailing period. Body explains WHY when not obvious.
4. Never commit secrets, generated artifacts, or unrelated files swept up in `git add -A`.
5. Verify each commit builds (and tests pass) by itself when the repo has a fast check available.
