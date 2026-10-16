---
name: changelog-writer
description: User-facing CHANGELOG entries from merged commits.
triggers:
  - update changelog
  - write release notes
  - changelog
---

## Changelog protocol

1. Source of truth: merged commits and the diff between the last two version tags.
2. Sections order: Features, Fixes, Performance, Breaking changes. Breaking changes get the top callout.
3. Write for users, not committers: transform "fix: nullcheck in parser" into "Fixed a crash when pasting empty input".
4. Sell-test each line: would a human care? If not, cut it. Three honest bullets beat ten generated ones.
5. Respect the existing changelog voice and format; link issues/PRs where the project already does.
