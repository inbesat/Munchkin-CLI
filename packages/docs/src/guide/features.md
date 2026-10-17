# Features

What ships in the box today. Everything listed here is implemented in the monorepo — this page describes the codebase, not a roadmap.

## Tools

The agent's built-in tool set (in `packages/core/src/tools`):

| Tool | Purpose |
| --- | --- |
| `Read` / `Write` / `Edit` / `NotebookEdit` | File access with path-boundary enforcement |
| `Glob` / `Grep` | File discovery and content search |
| `Bash` | Shell access in a **bash manager** session (background support) |
| `TodoWrite` | Task lists via the todo manager |
| `Parallel` | Run independent tool calls concurrently |
| `WebFetch` / `WebSearch` | Fetch pages / search the web (search providers: **Brave**, **Exa**) |
| `Freshness` | Detects when file state has drifted underneath the agent |

## Sessions and the event log

Every session is an append-only event stream — the single source of truth. Resume, fork, replay, search (`GET /api/sessions/search`), and trajectory browsing (`GET /trajectory/:id`) are all built on that one log.

## Permission engine

Six modes (default / acceptEdits / plan / auto / bypass / dontAsk), layered allow/deny/ask rules, and per-call risk classification. See [Configuration](/guide/configuration).

## Client / server split

`forge serve` starts a Hono HTTP server:

- OpenAPI spec at `GET /api/openapi.json`, interactive Scalar UI at `/docs`
- **SSE hub** for live event streaming to any client (TUI, dashboard, scripts)
- Generated **TS SDK** (`packages/sdk`) and a Python subprocess SDK

## Model providers

Resolver activates Anthropic, OpenAI, and Google today; adapter layer covers DeepSeek, Ollama, Bedrock, and Vertex for the same config shape. The experimental **free-model gateway** (`packages/gateway`) serves an OpenAI-compatible relay with quotas when self-hosted.

## MCP and connectors

Act as an MCP **client** (attach any MCP server's tools to a session) and expose forge itself as an MCP **server** over stdio (`forge rpc`).

## Git integration

Checkpoints and rewind over the event log, worktree management (`forge worktree list/create/merge/remove`), GitHub App integration for PR review automation (`packages/git`, `packages/server/src/github`).

## Plugins

Everything is a plugin: providers, tools, storage, UI hooks. Manifests (`forge.plugin.json`), a marketplace of bundled plugins (`marketplace/plugins`), hook engine, and generated plugin docs. See [Plugins](/guide/plugins).

## Skills and evals

Progressive-disclosure skill packs (this site's own building process is scripted by them) plus an eval harness (`packages/evals`) with an SWE-bench-lite runner, wired through `forge eval`.

## Observability

Structured logging, per-key usage stats (`forge stats`, `/api/auth/keys/usage`), environment diagnostics (`forge doctor`), opt-in telemetry, and an update checker (`forge update`, 24h-cached).
