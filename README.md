<p align="center">
  <img src="packages/landing/public/demos/help.gif" alt="forge --help demo" width="100%" style="max-width: 960px;">
</p>

<h1 align="center">forge</h1>

<p align="center">
  A from-scratch, fully customizable, open-source CLI coding agent.<br>
  TypeScript on Bun · event-sourced sessions · permission-first tooling · plugin everything.
</p>

<p align="center">
  <a href="https://github.com/inbesat/Munchkin-CLI/actions/workflows/ci.yml"><img src="https://github.com/inbesat/Munchkin-CLI/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/inbesat/Munchkin-CLI/actions/workflows/release.yml"><img src="https://github.com/inbesat/Munchkin-CLI/actions/workflows/release.yml/badge.svg" alt="Release"></a>
  <a href="https://bun.sh"><img src="https://img.shields.io/badge/bun-%E2%89%A51.2-f472b6" alt="Bun >= 1.2"></a>
  <a href="https://www.typescriptlang.org"><img src="https://img.shields.io/badge/TypeScript-strict-3178c6" alt="TypeScript"></a>
  <a href="https://github.com/inbesat/Munchkin-CLI/pulls"><img src="https://img.shields.io/badge/PRs-welcome-3fb950" alt="PRs welcome"></a>
</p>

<p align="center">
  <a href="https://inbesat.github.io/Munchkin-CLI/">Documentation</a> ·
  <a href="https://github.com/inbesat/Munchkin-CLI/releases">Releases</a> ·
  <a href="https://github.com/inbesat/Munchkin-CLI/tree/main/marketplace/plugins">Plugin marketplace</a> ·
  <a href="docs/privacy.md">Privacy</a>
</p>

---

## Get started

```sh
# 1. install: download a prebuilt binary from Releases (checksums.txt included)
#    https://github.com/inbesat/Munchkin-CLI/releases
#    …or build from source (Bun >= 1.2):
bun install && bun run build:binary

# 2. configure provider → API key → model → theme → permission mode
forge setup

# 3. run
forge -p "explain this repository"    # one-shot print mode
forge                                  # interactive TUI
forge serve --port 8787                # HTTP API (OpenAPI at /api/openapi.json, Scalar UI at /docs)
```

`forge doctor` verifies the installation; `forge update` checks for newer releases (cached 24h, `FORGE_NO_UPDATE_CHECK=1` disables it).

## What you get

| | |
| --- | --- |
| **Event-sourced sessions** | One append-only log per session — resume, fork, replay, search and trajectory browsing are all derived views. |
| **Permission-first tooling** | Six modes (`default`/`acceptEdits`/`plan`/`auto`/`bypass`/`dontAsk`) + layered allow/deny/ask rules. Every tool call passes the engine. |
| **Provider-agnostic models** | Anthropic, OpenAI and Google wired today; DeepSeek, Ollama, Bedrock and Vertex adapters share the config shape. |
| **Plugin everything** | `forge.plugin.json` manifests, a hook engine, and a bundled marketplace — providers, tools, storage and UI hooks are all swappable. |
| **MCP, both ways** | Attach any MCP server's tools as a client; expose forge itself as an MCP server over stdio. |
| **Server-first API** | Hono HTTP server with SSE streaming, OpenAPI spec and Scalar docs; generated TypeScript and Python SDKs. |
| **Git built in** | Checkpoints and rewind over the event log, worktree flows, GitHub App PR review automation. |
| **Evals & observability** | SWE-bench-lite runner with a per-release regression gate, `forge doctor` diagnostics, usage stats, opt-in telemetry. |
| **Sandboxed execution** | Windows ACL restricted tokens, macOS Seatbelt, Linux Landlock (bubblewrap), Docker/Podman, and E2B/Daytona remotes behind one interface. |

<p align="center">
  <img src="packages/landing/public/demos/setup.gif" alt="forge setup demo" width="100%" style="max-width: 720px;">
</p>

## Architecture

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
   append-only event log  ──►  resume / fork / replay / search
```

The agent loop is deliberately tiny (~100 lines, mini-swe-agent style) — the
value is the runtime around it, and every layer of that runtime is swappable
without forking:

| Package | Role |
| --- | --- |
| `packages/core` | Event log, sessions, agent loop, built-in tools, permission engine |
| `packages/ai` | Provider layer, model catalog, cost engine |
| `packages/gateway` | Self-hosted OpenAI-compatible relay with quotas |
| `packages/server` | Hono API + SSE + RPC/stdio + the `forge` CLI |
| `packages/tui` | Terminal UI |
| `packages/plugin-kernel` | Plugin loader, hook engine, marketplace |
| `packages/mcp` | MCP client + forge's own MCP server |
| `packages/sandbox` | Seatbelt / Landlock / ACL / Docker / E2B providers |
| `packages/git` | Checkpoints, rewind, worktrees, PR flows |
| `packages/evals` | SWE-bench-lite runner + regression suites |

The full build history (~150 phased work items with test evidence) lives in
[`plans/`](https://github.com/inbesat/Munchkin-CLI/tree/main/plans).

<p align="center">
  <img src="packages/landing/public/demos/doctor.gif" alt="forge doctor demo" width="100%" style="max-width: 720px;">
</p>

## Plugins

Every layer is a plugin. A plugin is a directory with a `forge.plugin.json`
manifest and hook handlers:

```json
{
  "name": "my-plugin",
  "version": "0.1.0",
  "hooks": { "afterToolExecute": "hooks/after-tool.ts" }
}
```

Bundled starters (security review, formatting, testing) live in
[`marketplace/plugins/`](https://github.com/inbesat/Munchkin-CLI/tree/main/marketplace/plugins),
with generated reference docs at
[`/plugins/` on the docs site](https://inbesat.github.io/Munchkin-CLI/plugins/).
See the [plugin guide](https://inbesat.github.io/Munchkin-CLI/docs/guide/plugins.html) for the full walkthrough.

## Status

- **Ships today:** binaries via the [release workflow](https://github.com/inbesat/Munchkin-CLI/actions/workflows/release.yml) (cut on `v*` tags), docs site, plugin docs, package-manager manifests under [`packaging/`](https://github.com/inbesat/Munchkin-CLI/tree/main/packaging).
- **Pre-release notes:** the npm package is prepared but publication is pending a rename (the unscoped `forge` name is occupied); the interactive TUI is in preview; local model wiring (Ollama) is next.

## Contributing

Issues and PRs welcome — read [AGENTS.md](AGENTS.md) for the repo rules and
[plans/PLAN.md](https://github.com/inbesat/Munchkin-CLI/blob/main/plans/PLAN.md)
for the phased roadmap. Run `bun install`, then `bun test`, `bunx turbo lint`
and `bunx turbo typecheck` before submitting.

## Community

- Roadmap: [ROADMAP.md](ROADMAP.md)
- Plugin bounty program: [docs/bounty.md](docs/bounty.md)
- Docs: <https://inbesat.github.io/Munchkin-CLI/>
- Privacy (telemetry is opt-in and off by default): [docs/privacy.md](docs/privacy.md)
