# Architecture

A condensed map of the monorepo. Full detail lives in [`plans/ARCHITECTURE.md`](https://github.com/inbesat/Munchkin-CLI/blob/main/plans/ARCHITECTURE.md) — keep this page for orientation.

::: warning
Corrections welcome — if a package's description disagrees with its README, the README wins. Please open an issue rather than trusting this page over code.
:::

## The loop is small; the value is the runtime

The agent loop is deliberately tiny (~100 lines, mini-swe-agent style). Everything else is runtime, tooling, and UX:

| Package | Role |
| --- | --- |
| `core` | Event log, sessions, agent loop, built-in tools, permission engine |
| `ai` | Provider layer, model catalog, cost engine |
| `gateway` | Experimental free-model relay (OpenAI-compatible, quotas) |
| `server` | Hono API + SSE + RPC/stdio, CLI dispatch (`forge`) |
| `sdk` | Generated TypeScript SDK + Python subprocess SDK |
| `tui` | Terminal UI (OpenTUI / SolidJS bindings) |
| `plugin-kernel` | Plugin loader, hook engine, marketplace |
| `mcp` | MCP client + forge's own MCP server |
| `sandbox` | Seatbelt / Landlock / ACL / Docker / E2B providers |
| `git` | Checkpoints, rewind, worktrees, PR flows |
| `evals` | SWE-bench-lite runner + regression suites |
| `dashboard` | Web fleet view |

## Data flow

```
stdin / TUI / SDK / HTTP client
        │
        ▼
   forge server (Hono)  ──►  permission engine  ──►  tool registry
        │                                                    │
        │  ◄── SSE hub (streams every event) ──┐             │
        ▼                                      ▼             ▼
   agent loop  ──►  provider adapters (Anthropic/OpenAI/Google/…)
        │                                       
        ▼
   append-only event log (sessions)  ──►  resume / fork / replay / search
```

## Design principles

1. **Event-sourced state.** One append-only log is the source of truth; resume, fork, replay, share, telemetry are all derived views.
2. **Client/server split.** TUI, IDE extensions, dashboards, and bots are peers over the same API.
3. **Provider-agnostic.** Switching providers is a two-line config change.
4. **Permission-first.** Every tool call passes the permission engine.
5. **Progressive disclosure.** Skills load when relevant, MCP tools lazily, subagents isolated.
6. **Everything is a plugin.** Swappable without core edits.
