# HTTP API

`forge serve` exposes a Hono HTTP server. Point any HTTP client at it — the TUI, the dashboard, IDE extensions, and bots are all peers over this surface.

- **OpenAPI spec:** `GET /api/openapi.json` (machine-readable, generated from the same zod schemas the routes validate against)
- **Interactive docs:** `/docs` (Scalar UI served by the running server)

Unless noted, responses are JSON. Set `Authorization` on protected endpoints if you started the server with `--auth-token` (API keys are managed under `/api/auth/keys`).

## Health

| Method | Path | Description |
| --- | --- | --- |
| GET | `/health` | Liveness + version + uptime + service checks |
| GET | `/health/ready` | Readiness probe |

## Sessions

| Method | Path | Description |
| --- | --- | --- |
| POST | `/api/sessions` | Create a session |
| GET | `/api/sessions` | List sessions |
| GET | `/api/sessions/search` | Search the global session index |
| GET | `/api/sessions/:id` | Get one session |
| GET | `/api/sessions/:id/events` | Read the session's event log |
| DELETE | `/api/sessions/:id` | Delete a session |

## Prompts

| Method | Path | Description |
| --- | --- | --- |
| POST | `/api/prompts/:sessionId` | Run an agent turn in the session (streams; also consumed via SSE) |

## Tools

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/tools` | List registered tools |
| GET | `/api/tools/:name` | Describe one tool |
| POST | `/api/tools/execute` | Execute a tool server-side (validation middleware; built-ins `read`/`write`/`edit`/`bash`/`glob`/`grep`) |

## Config

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/config` | Merged effective config |
| POST | `/api/config` | Write a config value |
| GET | `/api/config/default` | Default config value for a key |
| GET | `/api/config/defaults/all` | All defaults, enumerated |
| GET | `/api/config/:key` | Read one key |
| DELETE | `/api/config/:key` | Remove one key |

## SSE (live events)

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/sse/events` | Subscribe to the live event stream |
| GET | `/api/sse/sessions` | List sessions with live subscribers |
| POST | `/api/sse/replay` | Replay persisted events onto a stream |
| POST | `/api/sse/broadcast` | Broadcast an event to subscribers |
| GET | `/api/sse/stats` | Hub statistics |
| POST | `/api/sse/sessions/:id/attach` / `…/detach` | Attach/detach a session's presence |
| GET | `/api/sse/sessions/:id/presence` | Presence state for a session |

## Auth

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/auth` | Auth surface info |
| GET | `/api/auth/keys` | List API keys |
| POST | `/api/auth/keys` | Create an API key (`--name/--env/--scope/--rate` mirror `forge auth create`) |
| GET | `/api/auth/keys/:id` | Get one key |
| GET | `/api/auth/keys/usage` | Per-key usage stats |
| DELETE | `/api/auth/keys/:id` | Revoke a key |

## GitHub + trajectories

| Method | Path | Description |
| --- | --- | --- |
| POST | `/api/github/webhook` | GitHub App webhook (mounted only when `--github-app` is configured) |
| GET | `/trajectory/:id` | Server-rendered session trajectory browser |

## Example

```sh
curl -s localhost:8787/health
# {"status":"ok","version":"...","uptime":...,"timestamp":...}

curl -s localhost:8787/api/sessions | head -c 300
```

For the authoritative request/response shapes, prefer the live spec at
`GET /api/openapi.json` on your running server — this page is a human-readable
map of the same surface and may lag during fast development.
