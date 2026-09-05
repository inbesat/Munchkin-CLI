# @forge/sdk

Typed TypeScript SDK for the Forge server API. Generated from the OpenAPI 3.1
spec served at `/api/openapi.json` (Phase 74). Phase 76 ships the client;
the Python subprocess SDK lands in Phase 79.

## Install

Part of the Forge monorepo. Workspace consumers add:

```jsonc
"dependencies": {
  "@forge/sdk": "workspace:*"
}
```

## Usage

```ts
import { ForgeClient, ForgeApiError } from '@forge/sdk'

const client = new ForgeClient({
  baseUrl: 'http://127.0.0.1:3845',
  token: process.env.FORGE_TOKEN, // optional
})

// Sessions
const session = await client.sessions.create({ cwd: process.cwd(), model: 'auto' })

// Prompts (runs the agent loop synchronously and returns the final response)
const result = await client.prompts.submit(session.id, { prompt: 'Summarize the repo' })
console.log(result.response)

// Tools
const tools = await client.tools.list()
const out = await client.tools.execute({ name: 'bash', args: { command: 'ls' } })

// Config (dotted keys supported)
await client.configConfig.set({ key: 'theme.name', value: 'light', scope: 'project' })
const got = await client.configConfig.get('theme.name')

// SSE: subscribe to live agent-loop events
const stream = client.sse.stream({ sessionIds: [session.id] })
for await (const frame of stream) {
  // frame.event ∈ 'text_delta' | 'thinking_delta' | 'tool_call' | 'tool_result'
  //                  | 'turn' | 'usage' | 'agent_done' | 'agent_error' | 'steering' | 'connected'
  // frame.data is the parsed JSON payload
  if (frame.event === 'agent_done') break
}
```

## Errors

- `ForgeApiError` — server returned a non-2xx with the typed error envelope.
  Carries `.status`, `.code`, `.message`, `.details`.
- `ForgeTransportError` — network-level failure, malformed body, missing fetch
  implementation, etc.

## SSE

- `SSEParser` — stateful per-spec SSE wire-format parser (`event:`, `data:`,
  `id:`, `retry:`, comments). Used internally by `streamSSE`.
- `streamSSE(baseUrl, opts)` / `client.sse.stream(opts)` — async generator over
  parsed frames. Cancel with `AbortSignal` or by returning `false` from a
  callback `handler`.
- `parseSSEData(payload)` — JSON-decode a `data:` payload; falls back to the
  raw string.

## Design Notes

- **Zero runtime deps.** Uses the platform `fetch` (override via `fetchImpl`).
  The CLI is for environments that already have it (Bun, Node 22+, modern
  browsers).
- **Hand-rolled, not codegen.** A `tsc --noEmit` check + a `forge-types-codegen`
  would be overkill for ~20 routes. Types are mirrored from the OpenAPI
  spec (Phase 74); if a route shape drifts, update `src/types.ts` and the
  `openapi.ts` definition together.
- **Tests use an in-process `app.request()` transport** (no sockets), so
  CI runs without port allocation. Real-network integration belongs in a
  higher-level smoke test.

## Part of the Forge Monorepo

- Spec: `plans/PLAN.md` (Phase 76)
- Architecture: `plans/ARCHITECTURE.md` (Client/Server split, SDK layer)
- Decisions: `plans/DECISIONS_LOG.md` (ADR-035)