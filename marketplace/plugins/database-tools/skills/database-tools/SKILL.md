---
name: database-tools
description: Schema inspection, query review, safe migration planning.
triggers:
  - review query
  - migration plan
  - inspect schema
---

## Database protocol

1. Inspect actual schema before advising (information_schema, pg_catalog, or SHOW CREATE) ? never from memory.
2. Query review: check index usage, N+1 patterns, locking, and pagination strategy; measure, do not guess.
3. Migrations follow expand/contract: additive first, backfill, then removal ? never drop in the same change.
4. Every migration must state its rollback and have been rehearsed against a representative dataset.
5. Destructive operations (DROP, TRUNCATE, DELETE without WHERE) always require explicit user confirmation.
