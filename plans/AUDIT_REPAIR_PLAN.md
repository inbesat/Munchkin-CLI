# Audit Repair Plan

**Last updated:** 2026-10-16  
**State:** Approved bounded repairs in progress; not an acceptance report.  
**Current phase:** 86, implemented-under-repair. Phase 87 remains pending.

## Scope and guardrails

- Audit all 12 existing workspace packages; repair demonstrated defects only. No new roadmap features, architecture guesses, or Phase 87 implementation.
- Preserve unrelated working changes. No reset/restore, blanket rewrites, commits, or test/coverage weakening. Do not delete assertions, skip failing tests to pass, or suppress diagnostics instead of fixing root causes.
- Use deterministic local fixtures and injected fake providers; no paid API calls or real provider credentials. Record unavailable environment capabilities separately from implementation failures.
- Dependency/security repairs may use compatible advisory-driven upgrades only. Record direct/transitive ownership, advisory evidence, manifest/lockfile changes, and fresh verification. Escalate changes requiring breaking upgrades.
- Initial backup: `C:\Users\Lenovo\AppData\Local\Temp\opencode\forge-repair-a667cfec8a874e098b81819afb10547b` (241 copied files, coordinator-reported). Do not modify this evidence copy.
- This documentation worker owns only `plans/PLAN.md`, `plans/DECISIONS_LOG.md`, this file, and [AUDIT_REPAIR_STATUS.md](AUDIT_REPAIR_STATUS.md). Other workers own source repairs; do not edit `AGENTS.md` here.

## Executable checklist

### 1. Preserve evidence and recover documentation

- [x] Read project rules, architecture, stack, roadmap, and decision registry before edits.
- [x] Verify recovery commit `4ceddd1f24c4dc214a233c7429ace6fa6ccef218` using `git rev-parse HEAD` and `git show`.
- [x] Recover all 154 roadmap phase headings from the 2,792-line historical document using a scoped patch; remove the 44-line Python-script overwrite.
- [x] Retain every historical ADR heading/body, including duplicate ADR-034 and historical caveats. Reconstruct ADR-041–044 from supplied session facts with explicit provenance, not invented original text.
- [x] Preserve current ADR-045 verbatim, then qualify its disproven completion claim. Mark Phases 84–86 implemented-under-repair and Phase 87 pending.
- [ ] Run structural preservation, count, Python-overwrite, and local-link checks; record results in the status ledger.

### 2. Run the initial parallel repair streams

- [ ] **Context/core worker:** reproduce ineffective model-context compaction using existing context tests and `packages/core/src/context/repairs.test.ts`; fix only the demonstrated Phase 83–86 defects and their consumers.
  - Check `context/budget.ts`, `compaction.ts`, `compact-command.ts`, `microcompact.ts`, `session/hydration.ts`, and `agent/context.ts` under `packages/core/src/`.
  - Assert summary + recent context replaces old model-visible history while raw events remain unchanged; preserve tool-call/result pairs and identifiers.
  - Assert manual compaction works below the automatic threshold, propagates focus, updates usage, and handles empty/error/expanding summaries. Assert pruning returns usable shortened context and does not grow short results.
  - Run `bun test src/context` from `packages/core`, then the full core suite, package typecheck and lint; retain exact outputs/counts.
- [ ] **Server worker:** reproduce Phase 82 failures before repair. Inspect both `packages/server/src/integration.test.ts` and `packages/server/tests/integration.test.ts` so duplicate suites do not hide different provider/auth setup.
  - Investigate config write/read/schema mismatch in `src/routes/config.ts` and core config loader/schema; test valid config round-trips and explicit unsupported-key behavior without weakening the contract.
  - Separate missing-auth 401 from authenticated missing-resource 404; inspect actual request headers before changing auth middleware.
  - Verify string/byte SSE chunks, docs/OpenAPI access, lifecycle cleanup, and Windows tool execution using existing auth, SSE, OpenAPI, and integration tests.
  - Ensure prompt tests use injected deterministic executors/providers before running `bun test` from `packages/server`; run package typecheck/lint afterward.
- [ ] **Dependencies/security worker:** triage inherited critical/high advisories and identify compatible fixes; inspect lockfile and all manifests, apply only scoped dependency changes, then re-audit and run affected checks. Do not assert vulnerability closure from installation alone.

### 3. Complete the 12-package bounded audit

For each package: inspect scripts/entry points and affected code, record defects with file/test evidence, write regression tests before source fixes, run available package checks, and hand off remaining blockers. Mark a package verified only with fresh results; a placeholder package passing tests does not prove future features exist.

| Package | Required focus | Initial ownership / verification state |
| --- | --- | --- |
| `core` | Context projection, budgets, event preservation, permission/tool regressions | Context/core worker; pending acceptance |
| `server` | Config, auth, SSE, docs/OpenAPI, offline integration | Server worker; pending acceptance |
| `ai` | Provider boundaries, catalog/cost behavior with fixtures | Coordinator follow-up; pending |
| `gateway` | Relay/quota tests, CLI encoding and checked scripts | Coordinator follow-up; pending |
| `sdk` | HTTP/SSE client compatibility, existing Python subprocess SDK tests | Coordinator follow-up; pending |
| `tui` | Existing rendering/state/keyboard tests and Windows/native constraints | Coordinator follow-up; pending |
| `plugin-kernel` | Existing loader/hook contracts and current tests | Coordinator follow-up; pending |
| `mcp` | Existing client/server boundaries, offline transport tests | Coordinator follow-up; pending |
| `sandbox` | Platform-specific execution behavior; no false cross-platform claims | Coordinator follow-up; pending |
| `git` | Existing checkpoint/worktree behavior in isolated fixture repos | Coordinator follow-up; pending |
| `evals` | Existing harness regression fixtures; no paid benchmark runs | Coordinator follow-up; pending |
| `dashboard` | Existing package surface only; no future fleet implementation | Coordinator follow-up; pending |

### 4. Integrate and verify without lowering the bar

- [ ] Review worker diffs against assigned ownership and preserve unrelated modifications. Re-run tests after integration, not only inside worker sessions.
- [ ] Run each affected package's `bun test`, then available `bun run typecheck` / `bun run lint`. `tui` currently declares neither script: record that gap and use installed TypeScript/Biome directly if the coordinator approves; do not invent successful script runs.
- [ ] After offline setup is checked, run root `bun run typecheck`, `bun run lint`, `bun run build`, and `bun run test`. Record command, scope, exit status, pass/fail/skip counts, and environment limitations separately. A cached result is not evidence that changed code was tested afresh.
- [ ] Re-run the security audit after dependency edits and report remaining advisories, including inherited ones.
- [ ] Validate all four documentation files against Git history/current evidence; retain reconstruction labels and historical caveats.
- [ ] Coordinator reviews all 12 package outcomes and records final acceptance or remaining blockers in the ledger. Do not claim project success, release readiness, or Phases 84–86 complete while verification remains open.

## Handoff contract

Workers report concrete files, reproduced failure/root cause, regression test names/commands, fresh output counts, unresolved blockers, and any compatibility/security impact. Do not invent task signatures or infer completion from a file's existence. Report environmental limitations honestly without silently skipping critical flows.

Related: [Roadmap](PLAN.md), [Decision history](DECISIONS_LOG.md), [Repair status](AUDIT_REPAIR_STATUS.md).
