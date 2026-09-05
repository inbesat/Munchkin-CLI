# DEPENDENCIES.md — Forge Dependency Manifest

**Runtime:** Bun 1.3.11
**Node:** >=22
**Generated:** 2026-08-26

---

## Root (forge)

| Package | Version | Type | Purpose |
|---------|---------|------|---------|
| `turbo` | ^2.4.0 | dev | Monorepo task orchestration |
| `typescript` | ^5.7.0 | dev | TypeScript compiler |
| `@biomejs/biome` | ^1.9.0 | dev | Linting + formatting |
| `@types/bun` | ^1.2.0 | dev | Bun type definitions |

---

## packages/ai — Provider Layer

| Package | Version | Type | Purpose |
|---------|---------|------|---------|
| `ai` | ^7.0.0 | prod | Vercel AI SDK core (multi-provider LLM abstraction) |
| `@ai-sdk/anthropic` | ^4.0.0 | prod | Anthropic provider adapter |
| `@ai-sdk/openai` | ^4.0.0 | prod | OpenAI provider adapter |

---

## packages/server — Hono API Server

| Package | Version | Type | Purpose |
|---------|---------|------|---------|
| `hono` | ^4.0.0 | prod | HTTP framework (Web Standards API) |
| `@hono/node-server` | ^2.0.0 | prod | Node.js adapter for Hono |

---

## packages/mcp — MCP Client + Server

| Package | Version | Type | Purpose |
|---------|---------|------|---------|
| `@modelcontextprotocol/sdk` | ^1.30.0 | prod | MCP protocol SDK (client + server) |

---

## Shared Dev Dependencies (all packages)

| Package | Version | Type | Purpose |
|---------|---------|------|---------|
| `typescript` | ^5.7.0 | dev | TypeScript compiler |
| `@biomejs/biome` | ^1.9.0 | dev | Linting + formatting |

---

## packages/core — Event Log, Sessions, Agent Loop

| Package | Version | Type | Purpose |
|---------|---------|------|---------|
| `zod` | ^4.4.3 | prod | Schema validation (config, tool inputs, events) |
## Packages With No External Dependencies

These packages currently have no runtime dependencies (scaffolded with placeholders):

- `packages/sdk` — Generated TS SDK + Python subprocess SDK
- `packages/tui` — OpenTUI (SolidJS bindings) terminal UI
- `packages/plugin-kernel` — Plugin loader + hook engine + marketplace
- `packages/sandbox` — Seatbelt/Landlock/ACL/Docker/E2B providers
- `packages/git` — Checkpoints, rewind, worktrees, PR flows
- `packages/evals` — SWE-bench-lite runner + regression suites
- `packages/dashboard` — Web fleet view (Stage 16+)

---

## Future Dependencies (planned per PLAN.md)

These will be added as each package is implemented:

### packages/core
- `drizzle-orm` + `drizzle-kit` — SQLite ORM for metadata queries
- `better-sqlite3` — SQLite driver (Bun-compatible)
- `nanoid` — Unique ID generation
- `pino` — Structured logging (or Bun built-in logger)

### packages/ai
- `@ai-sdk/google` — Google/Gemini provider
- `@ai-sdk/bedrock` — AWS Bedrock provider
- `@ai-sdk/vertex` — Google Vertex AI provider
- `@ai-sdk/deepseek` — DeepSeek provider

### packages/tui
- `@opentui/solid` — SolidJS bindings for OpenTUI terminal renderer

### packages/plugin-kernel
- `cosmiconfig` — Config file discovery (if not using custom loader)

### packages/sandbox
- `@docker/dockerode` — Docker API client (optional)

### packages/mcp
- (already has `@modelcontextprotocol/sdk`)

### packages/server
- (already has `hono` + `@hono/node-server`)
- `@hono/cors` — CORS middleware
- `@hono/swagger-ui` — OpenAPI docs UI

### packages/sdk
- `@stainless-api/stl` — SDK codegen (if using Stainless pattern)

### packages/evals
- (no external deps expected — runs benchmarks via subprocess)

### packages/dashboard
- `hono` — Web framework for dashboard routes
- (or static SPA served by server package)

---

## Lock File

- `bun.lock` — Bun lockfile (committed to repo)
- Lock file strategy: `--frozen-lockfile` in CI to ensure reproducible installs
