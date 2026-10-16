---
name: test
description: Run the project test suite and report results with a fix-ranked summary
triggers:
  - run the tests
  - run tests
  - test suite
---

Run the project's test suite and report results.

## Protocol

1. Detect the runner from the lockfile / package scripts (bun test, vitest, jest, pytest, cargo test); prefer the project's own `test` script.
2. Run the narrowest scope first (tests touching changed files), then the full suite if the narrow run passes.
3. For every failure capture: test name, assertion diff, and the smallest reproducing input.
4. Classify each failure: real regression / stale fixture / flaky (re-run once) / environment limitation.
5. Report `<passed>/<total>` plus failures ranked by fix impact. Never claim green without fresh command output; paste the failing command so it can be re-run.
