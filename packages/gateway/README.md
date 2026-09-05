# @forge/gateway

Free-model gateway: an OpenAI-compatible relay that fronts free/cheap upstream providers (NVIDIA build.nvidia, Groq free tier, Cerebras, OpenRouter `:free`) behind one endpoint with quotas, rate limits, and abuse control. Stage 2.5 (Phases 29-32) of the Forge roadmap.

Part of the Forge monorepo.

## Features

- **`POST /v1/chat/completions`** — OpenAI-compatible relay with streaming passthrough, per-route model-rewrite (`identity` / `strip-prefix` / `append-free`), and 5xx alternate failover
- **`GET /v1/models`** — model listing (from upstream presets or a models.dev catalog sync)
- **`GET /health`** and **`GET /metrics`** — health probe + Quota/limit/kill-switch counters
- **Auth** — `anonymous` (default) or shared bearer token (`GATEWAY_MODE` / `GATEWAY_TOKEN`)
- **Abuse control** — per-IP sliding-window rate limit (60/min), SQLite-backed daily token/cost quotas, and a persistent kill-switch per upstream

## Run

```sh
bun install            # from repo root
bun run start          # built-in CLI (src/cli.ts); port from --port or PORT
```

Configure with environment variables (see [.env.example](./.env.example)):

```sh
cp .env.example .env
# fill in the optional upstream keys (NVIDIA_API_KEY, GROQ_API_KEY, ...)
bun run start
curl http://localhost:8787/health
```

Docker:

```sh
docker compose up --build
```

systemd: see [deploy/systemd/forge-gateway.service](./deploy/systemd/forge-gateway.service).

## Client side

Point any OpenAI-compatible client at `http://localhost:8787/v1` (or use the
`forge-free` provider preset in `@forge/ai`, which reads `FORGE_GATEWAY_URL`
and optionally `FORGE_GATEWAY_TOKEN`). Model IDs are gateway-prefixed, e.g.
`groq/llama-3.3-70b-versatile`, `nvidia/llama-3.1-nemotron-70b-instruct`,
`openrouter/meta-llama/llama-3.3-70b-instruct:free` — the router strips the
prefix before forwarding.

## Development

```sh
bun test        # 40+ unit tests
bun run lint
bun run typecheck
```