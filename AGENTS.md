# AGENTS.md — Master AI Instruction File

**Every AI coding session for this project MUST read this file first.**
This is the single source of truth for what this project is, how it's built, and what rules every agent must follow.

---

## What This Project Is

A from-scratch, fully customizable, open-source CLI coding agent — a Claude Code alternative with extra features, a sexy terminal UI, and a plugin-everything architecture. Built in TypeScript + Bun. TUI powered by OpenTUI (SolidJS bindings). Codename: **forge**.

**Core thesis:** The agent loop is small (~100 lines, proven by mini-swe-agent). Everything else is UX, extensibility, and polish. The value is not the loop — it's the runtime, the tooling ecosystem, and the UX around it.

## Critical Rules for Every AI Session

1. **NEVER copy Claude Code source code.** Use clean-room specs only. The behavioral spec lives in `plans/PLAN.md` and `plans/ARCHITECTURE.md`. If you need to understand how Claude Code behaves, read the spec — never reverse-engineer its TypeScript source.

2. **NEVER guess at architecture decisions.** All decisions are logged in `plans/DECISIONS_LOG.md`. If something isn't decided, ask the human before proceeding.

3. **ALWAYS read these files before making changes:**
   - `AGENTS.md` (this file) — project rules
   - `plans/PLAN.md` — current phase and overall roadmap
   - `plans/ARCHITECTURE.md` — system architecture and data flows
   - `plans/STACK.md` — technology choices and lock-in rules
   - `plans/DECISIONS_LOG.md` — decision history

4. **Preserve the monorepo structure.** All code lives under `packages/` in separate workspace packages. Never create loose files outside the workspace structure.

5. **TypeScript everywhere.** Bun runtime. No Python except for the optional subprocess SDK (which lives in its own package). No Go. No Rust unless performance-critical and approved via DECISIONS_LOG.

6. **Every package must have:** `tsconfig.json`, `package.json` with workspace deps, at least one test file, and a README.md.

7. **Commit atomic changes only.** Each commit should be one logical change. Use conventional commits: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`.

8. **Test before you claim done.** Run `bun test` in the affected package. If no test exists for the new code, write one first.

9. **Context management:** If you're approaching 80% context usage, run `/compact` or save state to `plans/DECISIONS_LOG.md` before continuing. Never lose context mid-phase.

10. **When resuming a session:** Read `plans/PLAN.md` to find the current phase. Read the last 10 entries in `plans/DECISIONS_LOG.md` for recent context. Then proceed.

## Project Structure

```
/
├── AGENTS.md                      # THIS FILE — master instructions
├── plans/                         # All project documentation
│   ├── PLAN.md                    # Full roadmap (150 elaborated phases)
│   ├── ARCHITECTURE.md            # System architecture + diagrams
│   ├── STACK.md                   # Tech choices + rationale
│   ├── REPOS.md                   # Reference repos to study
│   ├── FEATURE_MATRIX.md          # Competitive analysis
│   ├── CONNECTORS_AND_MCPS.md     # MCP servers + connectors
│   ├── DECISIONS_LOG.md           # Decision history
│   └── RISKS.md                   # Risk assessment
├── packages/
│   ├── core/                      # Event log, sessions, agent loop, tools, permissions
│   ├── ai/                        # Provider layer, model catalog, cost engine
│   ├── gateway/                   # Free-model gateway (OpenAI-compatible relay, quotas)
│   ├── server/                    # Hono API + SSE + RPC/stdio
│   ├── sdk/                       # Generated TS SDK + Python subprocess SDK
│   ├── tui/                       # @opentui/solid terminal UI
│   ├── plugin-kernel/             # Plugin loader + hook engine + marketplace
│   ├── mcp/                       # MCP client + our MCP server
│   ├── sandbox/                   # Seatbelt/Landlock/ACL/Docker/E2B providers
│   ├── git/                       # Checkpoints, rewind, worktrees, PR flows
│   ├── evals/                     # SWE-bench-lite runner + regression suites
│   └── dashboard/                 # Web fleet view (Stage 16+)
├── turbo.json                     # Turborepo config
├── bun.lock                       # Lockfile
└── package.json                   # Root workspace config
```

## Current Phase Status

- **Current phase:** Phase 132 - Rewind Conversation + Code (Complete); Phases 87-132 implemented
  - Completed this engagement: audit repair (all packages), then Phases 87-132 - Stages 7-11 closed, Stage 12 (Git Deep Integration, 131-136) 2/6 done
- **Next action:** Phase 133 - Smart Commit/PR Tools (Stage 12)
- **Blockers:**
  - Config key persistence (GET after POST returns 404)
  - Revoked key GET returns 401 instead of 404
  - Config key DELETE returns 401 instead of 404
  - Test environment limitations (OpenAI API key, bash on Windows)
  - SSE TextDecoder expects ArrayBuffer
  - Scalar docs returns 401/500

## How to Update This File

When starting a new phase:
1. Update the "Current Phase Status" section above
2. Add a note to `plans/DECISIONS_LOG.md` if any decision was made
3. If the phase changes architecture, update `plans/ARCHITECTURE.md`
4. If a new technology is introduced, update `plans/STACK.md`

## Key Design Principles

1. **Everything is a plugin.** Providers, tools, sandboxes, storage, UI — all swappable via config without touching core source.
2. **Client/server split.** The TUI is one client. The server is the product. IDE extensions, web dashboards, bots are all first-class citizens.
3. **Event-sourced state.** One append-only log is the source of truth. Resume, fork, replay, share, telemetry — all built on this single stream.
4. **Provider-agnostic.** Anthropic, OpenAI, Google, DeepSeek, Ollama, Bedrock, Vertex — all work identically. Switch by changing two lines of config.
5. **Permission-first.** Every tool call goes through a permission engine. Users control exactly what the agent can do.
6. **Progressive disclosure.** Load only what's needed. Skills load when relevant, MCP tools load lazily, subagents run in isolation.

## Communication Style

When presenting to the human:
- Be concise. Direct. No preamble.
- Use file path:line_number for code references.
- Run lint/typecheck after every code change.
- Never commit unless explicitly asked.
- One logical change per commit.
