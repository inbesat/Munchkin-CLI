# FEATURE_MATRIX.md — Competitive Analysis & Gap Targets

What Claude Code has, what competitors have, and what we're building that nobody has.

---

## Core Agent Capabilities

| Feature | Claude Code | opencode | DeepSeek Harness | Claurst | **Forge (Us)** |
|---|---|---|---|---|---|
| Open Source | Proprietary | MIT | MIT | GPL v3 | MIT |
| Multi-Provider | Anthropic only | Any (75+) | Any (via pi-ai) | Any (15+) | Any (75+ via models.dev) |
| Client/Server | No (monolithic) | Yes | Yes | No | Yes |
| TUI | Ink (React) | OpenTUI (Zig+Solid) | Web + headless | Ratatui (Rust) | OpenTUI (Zig+Solid) |
| Plugin System | Plugins + Marketplace | Hooks + Plugins | Cordis (everything) | Basic | Hooks → full plugin kernel |
| Event-Sourced Log | Checkpoints only | SQLite events | Append-only log | Checkpoints | Append-only dual-path |
| Session Forking | Yes (`/branch`) | Yes | Yes (replay) | Yes (`/share`) | Yes (fork + replay + share) |
| Built-in Evals | No | No | Yes (BENCHMARK.md) | No | Yes (SWE-bench-lite runner) |

## Permission Modes

| Mode | Claude Code | opencode | Forge |
|---|---|---|---|
| Default (ask) | Yes | Yes | Yes |
| Accept Edits | Yes | Yes | Yes |
| Plan (read-only) | Yes | Yes | Yes |
| Auto | Yes (research preview) | Yes | Yes |
| DontAsk | Yes | No | Yes |
| Bypass | Yes | No | Yes |

## Extensibility

| Feature | Claude Code | opencode | Forge |
|---|---|---|---|
| Hooks (lifecycle events) | 29 events | 10+ hooks | 29+ events (parity) |
| Skills (SKILL.md) | Yes | Yes (different format) | Yes |
| Subagents | Yes (6 built-in) | Yes | Yes (6+ built-in) |
| Agent Teams | Experimental | No | Yes (polished) |
| Plugins (bundled) | Yes | Yes (npm-based) | Yes (npm + git + local) |
| Plugin Marketplace | Yes | No | Yes |
| TUI Plugins | Yes (commands/agents) | Yes (routes/keybinds) | Yes (routes/keybinds/commands) |
| Custom Tools | Via MCP only | Via MCP + plugin tools | Via MCP + plugin tools + custom |

## Context Management

| Feature | Claude Code | opencode | Forge |
|---|---|---|---|
| Auto-compaction | Yes (summarization) | Yes | Yes |
| Microcompact | Yes | No | Yes |
| Manual `/compact` | Yes | No | Yes |
| Token accounting | Yes | Yes | Yes |
| Context visualization | Yes (`/context` grid) | No | Yes |
| Memory files (CLAUDE.md) | Yes (nested dirs) | Yes (different format) | Yes (AGENTS.md/CLAUDE.md) |

## Git Integration

| Feature | Claude Code | opencode | Forge |
|---|---|---|---|
| Checkpoints | Yes (shadow snapshots) | No | Yes |
| Rewind | Yes (code + conversation) | No | Yes |
| Worktrees | Yes | Yes (git worktree) | Yes |
| PR creation | Via MCP (GitHub) | Via tools | Via tools + MCP |
| GitHub Actions | Yes (label-triggered) | No | Yes |
| GitLab CI | Yes | No | Yes |

## Sandboxing

| Feature | Claude Code | DeepSeek Harness | Forge |
|---|---|---|---|
| Linux Landlock | Yes | Yes | Yes |
| macOS Seatbelt | Yes | Yes | Yes |
| Windows ACL | Unknown | Yes | Yes |
| Docker/Podman | Unknown | No | Yes |
| Remote (E2B/Daytona) | No | No | Yes |

---

## Features ONLY We Have (Differentiators)

### 1. Cross-Agent Delegation
Spawn Claude Code, Codex, or any ACP-compatible agent as a subagent. "Hey Forge, have Claude Code review this diff while you work on the next feature."

### 2. Web Dashboard Fleet View
All sessions visible in a browser. Steer from your phone. See subagent activity in real-time. (OpenHands Agent Canvas style.)

### 3. Semantic Codebase Search
Embeddings-based search that understands code meaning, not just text. "Find all authentication-related code" returns relevant results even if the word "auth" isn't in the code.

### 4. Built-in Eval Harness
Run SWE-bench-lite against your own config. Measure how good your setup is. Compare models. Track regressions per release.

### 5. Code-Mode Batching
Instead of 5 sequential tool calls, generate a TypeScript SDK for the task and let the model write a program that executes all 5 at once. (DeepSeek Harness pioneered this.)

### 6. Automation Server
Cron/webhook-triggered agents. "Every night at 2am, run security scan and post results to Slack." (OpenHands automation pattern.)

### 7. Verification Gates
Before marking a task "done," run `verify_goal` — concrete evidence (files exist, commands exit 0, expected output present) must back every completion claim. No more hallucinated "task complete."

### 8. Plugin Composition Pipeline
Plugins compose: a single plugin can ship a skill, a hook, a subagent, an MCP server config, and a slash command. Install one plugin, get five capabilities. Versioned with rollback.

### 9. Session Sharing via Gists
`/share` generates an unlisted GitHub Gist of the conversation. Share with teammates. No server required — GitHub hosts the data.

### 10. Cost Dashboard Per Provider
See exactly how much you spent on Anthropic vs OpenAI vs local Ollama. Per-session, per-day, per-month breakdowns.

---

## Features We're Matching (Parity Targets)

These are features Claude Code has that we MUST implement:

1. Agent loop with streaming (text + thinking + tool calls)
2. Plan mode (read-only exploration)
3. Permission modes (default/acceptEdits/plan/auto/dontAsk/bypass)
4. Subagents with isolated context
5. Hooks at ~29 lifecycle events
6. Skills (SKILL.md format)
7. Plugins + marketplace
8. CLAUDE.md-style memory files
9. MCP client (all transports + OAuth)
10. LSP integration (post-edit type checking)
11. Context compaction (auto + manual)
12. Checkpointing + rewind
13. Git worktrees
14. Background tasks
15. Slash commands (40+)
16. Cost tracking
17. Headless `-p` mode
18. Theme system (dark/light/daltonized)
19. Keyboard navigation (full TUI, no mouse required)
20. Auto-update mechanism

---

## Features We're Skipping (Intentionally)

1. **Web sessions** (claude.ai/code) — We're a local-first tool. Web sessions require a hosted backend.
2. **Desktop app** (Tauri/Electron) — Overkill. TUI + web dashboard covers all use cases.
3. **Voice input** — Nice-to-have, not essential for v1.
4. **Code review bot** — Available via MCP (GitHub) + hooks. Not a built-in feature.
5. **Analytics dashboard** (enterprise) — Post-launch, if traction justifies.
6. **SSO/SCIM** — Enterprise features. Post-launch.
