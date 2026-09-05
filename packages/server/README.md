# @forge/server

The Forge HTTP server — the backbone of the client/server architecture. It exposes a
Hono API (with CORS, logging, error-handling, and request-validation middleware) over the
core session store, agent executor, tool registry, config loader, and an SSE event hub.

Part of the Forge monorepo (Phase 73 — Stage 6).

## Routes

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/health` | Liveness probe (status, version, uptime, service flags). |
| GET | `/health/ready` | Readiness probe. |
| GET/POST | `/api/sessions` | Session list / create. |
| GET/DELETE | `/api/sessions/:id` | Fetch or delete a session. |
| GET | `/api/sessions/:id/events` | Replay a session's event log from an index. |
| GET | `/api/sessions/search?q=` | Search sessions by query. |
| POST | `/api/prompts/:sessionId` | Submit a prompt; runs the agent loop for that session. |
| GET | `/api/tools` | List available tools. |
| GET | `/api/tools/:name` | Inspect a single tool. |
| POST | `/api/tools/execute` | Execute a tool directly (read/write/edit/bash/glob/grep/…). |
| GET/POST/DELETE | `/api/config[/:key]` | Read, set, or delete config keys (scoped: global/project/local). |
| GET | `/api/config/default` | The built-in default config. |
| GET | `/api/auth` | Provider authentication status (no secrets exposed). |
| GET | `/api/sse/events` | SSE stream of live server events. |
| POST | `/api/sse/broadcast` | Broadcast an event to connected SSE clients (internal). |
| GET | `/api/sse/stats` | Connected-client stats. |
| GET | `/api/openapi.json` | The OpenAPI 3.1 spec document. |
| GET | `/docs` | Interactive API reference (Scalar) generated from the spec. |

The SSE stream emits typed event frames (`text_delta`, `thinking_delta`, `tool_call`, `tool_call_delta`, `tool_result`, `turn`, `usage`, `agent_done`, `agent_error`, `steering`) mapped from the agent loop by `SSEBridge`.

## Architecture

- **`server.ts`** — `ForgeServer` with a private constructor and a static async
  `ForgeServer.create(options)` factory (handles async dir/store init). Wires the
  `SessionStore`, `SessionManager`, `SSEHub`, and `AgentExecutor`.
- **`services/`**
  - `session-manager.ts` — CRUD over `SessionStore` + `SessionLog`.
  - `agent-executor.ts` — runs `runAgentLoop`, maps loop events to session events,
    broadcasts via the SSE hub. Fully dependency-injected (model resolver + tools).
  - `model-resolver.ts` — maps `provider/name` to an ai `Model` (preset factories +
    a `forge-free` OpenAI-compatible adapter).
  - `tool-registry.ts` — builds the core tool registry and adapts it to loop tools.
  - `sse-hub.ts` — in-process SSE pub/sub hub.
- **`middleware/`** — `cors`, `logging`, `error-handler`, `validation` (zod).
- **`routes/`** — one factory per resource area.

## Usage

```ts
import { ForgeServer } from '@forge/server'

const server = await ForgeServer.create({
  baseDir: './.forge',
  port: 8787,
  // For tests, inject a mock executor to avoid real providers:
  // agentExecutor: myMockExecutor,
})
await server.start()
```

## Testing

```sh
bun test
```

Tests boot a real `ForgeServer` (with an injected mock `AgentExecutor`) against a
temp directory and assert on HTTP responses, CORS headers, validation errors, and
config round-trips.
