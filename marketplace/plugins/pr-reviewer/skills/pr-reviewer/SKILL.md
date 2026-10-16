---
name: pr-reviewer
description: Pre-landing review for spec conformance and risk.
triggers:
  - review this pr
  - review the diff
  - pre-landing review
---

## PR review protocol

1. Review the diff against its base branch; read surrounding source, not just the diff.
2. Two axes: Standards (does it follow repo rules?) and Spec (does it do what the issue asked?).
3. Check structural risks: SQL safety, trust-boundary violations, conditional side effects, partial migrations.
4. Rank findings: blocker / should-fix / nit. Blockers state the failure mode, not just preference.
5. Verify tests: does the change come with failing-then-passing tests? Flag untested branches explicitly.
