---
name: test-runner
description: Discover, run, and summarize the project test suite.
triggers:
  - run tests
  - test suite
  - why is the test failing
---

## Test protocol

1. Detect the runner from package.json scripts / lockfile (bun test, vitest, jest, pytest, cargo test).
2. Run the narrowed scope first (changed files), then the full suite if the narrow run passes.
3. For each failure capture: test name, assertion diff, and the smallest reproducing input.
4. Classify: real regression, stale fixture, flaky (re-run once before reporting), or environment limitation.
5. Summarize as `<passed>/<total>` plus a ranked fix-list; do not claim green without fresh command output.
