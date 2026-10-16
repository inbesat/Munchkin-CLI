---
name: code-formatter
description: Normalize style and formatting across touched files.
triggers:
  - format code
  - clean up style
  - normalize formatting
---

## Formatting protocol

1. Identify the project formatter (prettier/biome/ruff/gofmt) from lockfile or config; prefer its defaults.
2. Run the formatter on changed files only ? never reformat unrelated files.
3. If no formatter exists, apply the style of the surrounding code: indentation, quote style, import order.
4. Do not change behavior, rename identifiers, or reorder exports. Formatting only.
5. Report: files touched, tool (or "house style"), and whether any behavior-affecting diff appeared (must be none).
