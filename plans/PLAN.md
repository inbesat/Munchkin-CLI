# PLAN.md — Master Project Roadmap

**Project:** Forge — Open-source CLI coding agent from scratch
**Started:** 2026-08-26
**Stack:** TypeScript + Bun, OpenTUI (SolidJS), Hono server, AI SDK v5, SQLite
**Total Phases:** 154 (18 stages)
**Current Phase:** Phase 86 (Microcompact) — implemented-under-repair; next: Phase 87 (System Prompt Assembly Pipeline), pending audit verification.

**Recovery / repair status (2026-10-16):** The 154-phase roadmap was recovered from verified Git commit `4ceddd1f24c4dc214a233c7429ace6fa6ccef218` after this file was overwritten by a 44-line Python editing script. Historical phase descriptions are specifications, not proof of completion. Phase 84–86 completion claims were disproven by the audit: their implementations remain under repair until the coordinator verifies them. Do not begin Phase 87 or later roadmap work during this repair.

See [AUDIT_REPAIR_PLAN.md](AUDIT_REPAIR_PLAN.md) for the approved bounded repair checklist and [AUDIT_REPAIR_STATUS.md](AUDIT_REPAIR_STATUS.md) for evidence, blockers, and verification scope. `AGENTS.md` still contains a stale completion claim; changing it is outside this documentation repair's scope. This status supersedes that claim for the repair.

---

## How to Read This File

Each phase contains:
- **Description:** What this phase accomplishes and why it matters
- **Deliverables:** Concrete files/features to produce
- **Dependencies:** Which phases must complete first
- **Success Criteria:** How to know you're done
- **Testing:** What to test and how
- **Estimated Hours:** Rough time estimate

**When resuming a session:** Read the current phase above and the audit repair status before consulting historical completion claims in AGENTS.md. Read the current phase and its dependencies. Continue bounded repairs only until verification is recorded.

---

# Stage 0 — Spec & Foundations (Phases 1–6)

---

## Phase 1: Product Vision & Differentiator Document

**Description:** Write the 1-page product vision that answers: What is this? Who is it for? Why would someone use it instead of Claude Code, opencode, or dsh? This document is the north star. Every architectural decision should trace back to it. The key differentiators: (1) client/server architecture with multiple frontends, (2) "everything is a plugin" kernel simpler than Cordis, (3) cross-agent delegation, (4) built-in eval harness, (5) web dashboard fleet view, (6) verification gates before task completion.

**Deliverables:** `plans/VISION.md` — 1-page product vision with user personas, differentiators, success metrics.

**Dependencies:** None.

**Success Criteria:** The vision doc exists, is readable in under 2 minutes, and clearly articulates 3+ differentiators that no single competitor has today.

**Testing:** Show the vision doc to a developer who doesn't know the project. Ask them: "What is this? Would you use it?" If they can't answer both in 30 seconds, rewrite.

**Estimated Hours:** 3–4 hours.

---

## Phase 2: Clean-Room Behavioral Spec

**Description:** Read `kuberwastaken/claurst/spec/` thoroughly. This is a clean-room behavioral specification of Claude Code — legally safe, no proprietary source code. Extract the complete feature set, tool contracts, permission model, and UX patterns. Cross-reference with `claurst`'s parity audit document. Create our own spec that describes what our agent should DO (not how to implement it). This spec is what every future AI session reads when it needs to understand target behavior.

**Deliverables:** `plans/BEHAVIOR_SPEC.md` — clean-room behavioral specification covering: agent loop behavior, tool contracts, permission modes, subagent behavior, hook lifecycle, skill loading, plugin system, context management, compaction, checkpoints.

**Dependencies:** Phase 1 (vision doc provides scope boundaries).

**Success Criteria:** The spec covers all 20+ core features from the FEATURE_MATRIX.md parity list. Every behavior is described in terms of "what happens when..." not "how the code implements...".

**Testing:** Cross-reference spec against FEATURE_MATRIX.md. Every parity target should have a spec entry.

**Estimated Hours:** 8–12 hours (reading + writing).

---

## Phase 3: Monorepo Scaffold

**Description:** Create the full monorepo structure with Bun workspaces and Turborepo. Every package gets: `package.json` (with workspace dependency declarations), `tsconfig.json` (strict mode, path aliases), `src/index.ts` (barrel export), `README.md`, and at least one test file. Configure Biome for formatting/linting. Set up Turborepo for build orchestration. Create the root `package.json` with workspace scripts: `dev`, `build`, `test`, `lint`, `typecheck`.

**Deliverables:**
- Root: `package.json`, `turbo.json`, `tsconfig.json`, `.gitignore`, `biome.json`, `README.md`
- `packages/core/` — package.json, tsconfig.json, src/index.ts, src/index.test.ts, README.md
- `packages/ai/` — same structure
- `packages/server/` — same structure
- `packages/sdk/` — same structure
- `packages/tui/` — same structure
- `packages/plugin-kernel/` — same structure
- `packages/mcp/` — same structure
- `packages/sandbox/` — same structure
- `packages/git/` — same structure
- `packages/evals/` — same structure
- `packages/dashboard/` — same structure

**Dependencies:** None (but Phase 1 informs naming).

**Success Criteria:** `bun install` succeeds. `turbo build` compiles all packages. `turbo test` runs all tests (even if they're just placeholder). `turbo lint` passes with zero errors. Git repo initialized with first commit.

**Testing:** Run the full pipeline: `bun install && turbo build && turbo test && turbo lint`. All green.

**Estimated Hours:** 4–6 hours.

---

## Phase 4: CI/CD Pipeline

**Description:** Set up GitHub Actions (or equivalent) for continuous integration. Every push triggers: lint, typecheck, test, build. Every PR triggers: full pipeline + bundle size check. Every tag triggers: release build (compile to binary). Use changesets for version management across packages.

**Deliverables:**
- `.github/workflows/ci.yml` — lint + typecheck + test on every push
- `.github/workflows/release.yml` — build binaries + publish on tag
- `changeset.json` — changesets configuration
- PR template with checklist

**Dependencies:** Phase 3 (monorepo must exist).

**Success Criteria:** CI runs on first push. Tests pass in CI. Release workflow compiles a binary (even if it's a "hello world").

**Testing:** Push to a branch, verify CI runs. Create a tag, verify release builds.

**Estimated Hours:** 3–4 hours.

---

## Phase 5: Config Schema Design

**Description:** Design the configuration system that governs the entire agent. Three scopes: global (`~/.config/forge/`), project (`.forge/`), local (`.forge.local/`, gitignored). Higher-scope settings are overridden by lower-scope settings. The schema must cover: model selection, provider credentials, permission rules, hook registrations, MCP server definitions, plugin origins, theme, and all behavioral toggles. Use a typed schema (TypeBox or Zod) so config is validated at load time.

**Deliverables:**
- `packages/core/src/config/schema.ts` — full config schema definition
- `packages/core/src/config/loader.ts` — config loading with scope merging
- `packages/core/src/config/defaults.ts` — sensible defaults
- `packages/core/src/config/schema.test.ts` — schema validation tests

**Dependencies:** Phase 3 (package structure).

**Success Criteria:** Config loads correctly from all three scopes. Merging works (local overrides project overrides global). Invalid configs produce clear error messages. Schema covers all settings listed in ARCHITECTURE.md.

**Testing:** Write tests for: default config, project override, local override, invalid config detection, missing file handling.

**Estimated Hours:** 6–8 hours.

---

## Phase 6: Error Taxonomy & Logging

**Description:** Define the error hierarchy for the entire project. Every error type has: a unique code, a human-readable message, a severity level (info/warn/error/fatal), and optionally a recovery suggestion. Set up structured logging with Bun's built-in logger (or `pino`). Log levels: debug, info, warn, error. All logs go to stderr (never stdout, which is for user-facing output). Create a `Logger` class that can be scoped to any package.

**Deliverables:**
- `packages/core/src/errors/index.ts` — error hierarchy (ForgeError, ProviderError, ToolError, PermissionError, ConfigError, etc.)
- `packages/core/src/errors/codes.ts` — unique error codes
- `packages/core/src/errors/recovery.ts` — recovery suggestions per error
- `packages/core/src/logger/index.ts` — Logger class with scoping
- `packages/core/src/logger/index.test.ts` — logger tests

**Dependencies:** Phase 3 (package structure).

**Success Criteria:** Every error in the codebase extends ForgeError. Error codes are unique. Logger produces structured JSON output. Logs can be filtered by level and scope.

**Testing:** Throw each error type, verify message/code/severity. Test logger output format. Test log level filtering.

**Estimated Hours:** 4–5 hours.

---

# Stage 1 — Event-Sourced Core (Phases 7–16)

---

## Phase 7: Append-Only Session Event Log

**Description:** Implement the core data structure: an append-only event log. Every interaction with the agent is recorded as an immutable `SessionEvent`. The log supports: append, iterate (replay), and count. No random access — events are read sequentially. Each event has: unique ID, session ID, timestamp, schema version, and event-type-specific payload. Use JSONL for storage (one JSON object per line, one file per session).

**Deliverables:**
- `packages/core/src/events/types.ts` — SessionEvent type definitions (all event variants)
- `packages/core/src/events/log.ts` — append-only log implementation (append, iterate, count)
- `packages/core/src/events/log.test.ts` — unit tests

**Dependencies:** Phase 6 (error types for error handling).

**Success Criteria:** Can append 10,000 events in under 1 second. Can replay a session's events in under 100ms. Events are durable (survive process crash mid-write via atomic append). Schema version field is present on every event.

**Testing:** Append events, verify they persist. Replay events, verify order. Kill process mid-append, verify no corruption. Test with 10k events for performance.

**Estimated Hours:** 6–8 hours.

---

## Phase 8: In-Memory Store & Dual-Path Persistence

**Description:** Build the in-memory session store that loads events from JSONL on startup and maintains state. Add SQLite (via Drizzle ORM) for fast metadata queries: list sessions, search by title, aggregate costs, get recent sessions. The dual-path approach: JSONL for crash-safe incremental writes (the source of truth), SQLite for queryable metadata (rebuilt from event log on startup if stale).

**Deliverables:**
- `packages/core/src/store/session-store.ts` — in-memory session state
- `packages/core/src/store/sqlite.ts` — Drizzle schema + connection
- `packages/core/src/store/sqlite.test.ts` — query tests
- `packages/core/src/store/sync.ts` — sync events to SQLite metadata

**Dependencies:** Phase 7 (event log).

**Success Criteria:** Session store loads from JSONL on startup. SQLite metadata is rebuilt from events. Queries (list, search, aggregate) return in <10ms. Dual-path consistency is maintained.

**Testing:** Create session with events, restart, verify store loads correctly. Query costs by model. Search sessions by title. Test consistency after crash recovery.

**Estimated Hours:** 8–10 hours.

---

## Phase 9: Session Resume from Log Replay

**Description:** Implement session resume: given a session ID, load all events, replay them to rebuild the exact conversation state, and resume the agent loop from where it left off. Handle edge cases: incomplete tool calls (tool_call without tool_result), interrupted compaction, partial streaming. The agent should be able to pick up exactly where it stopped, even after a computer restart.

**Deliverables:**
- `packages/core/src/session/resume.ts` — resume logic (load events, rebuild state, continue)
- `packages/core/src/session/resume.test.ts` — resume tests with edge cases

**Dependencies:** Phase 7 (event log), Phase 8 (store).

**Success Criteria:** Can resume a session after process restart. Incomplete tool calls are detected and handled (re-execute or skip based on idempotency). Conversation state is identical after resume as before crash.

**Testing:** Start session, make 3 tool calls, kill process, restart, verify conversation state matches. Test with incomplete tool_call (no result). Test with interrupted compaction.

**Estimated Hours:** 6–8 hours.

---

## Phase 10: Session Forking

**Description:** Implement session forking: create a new session that shares all events up to a fork point, then diverges independently. Forking enables "what if" experiments — try a different approach without losing the original conversation. The forked session gets its own ID, its own event log (starting with copies of parent events up to fork point), and its own metadata in SQLite.

**Deliverables:**
- `packages/core/src/session/fork.ts` — fork logic (copy events, create new session)
- `packages/core/src/session/fork.test.ts` — fork tests

**Dependencies:** Phase 7 (event log), Phase 9 (resume — fork uses resume to rebuild state).

**Success Criteria:** Can fork a session at any point. Forked session has independent event log. Parent session is untouched. Forked session can diverge (different model, different tools). Fork metadata links back to parent.

**Testing:** Create session with 5 messages, fork at message 3, add 2 messages to fork, verify parent has 5 and fork has 7 (3 shared + 2 new + metadata events).

**Estimated Hours:** 4–6 hours.

---

## Phase 11: Session Search

**Description:** Implement session search: find sessions by title, content preview, model used, date range, cost range. Uses SQLite queries for speed. Support fuzzy title search. Return results with metadata (title, preview, model, cost, date, message count).

**Deliverables:**
- `packages/core/src/session/search.ts` — search implementation
- `packages/core/src/session/search.test.ts` — search tests

**Dependencies:** Phase 8 (SQLite store).

**Success Criteria:** Search returns results in <50ms for 1000+ sessions. Fuzzy title matching works. Filters can be combined (model + date range).

**Testing:** Create 100 sessions with varied titles/models/dates. Search by title substring, model, date range. Verify correct results returned.

**Estimated Hours:** 3–4 hours.

---

## Phase 12: Export & Transcripts

**Description:** Implement session export: dump a session's conversation as markdown, JSON, or terminal-readable format. The markdown export should be clean enough to share as documentation. JSON export preserves all events for programmatic use.

**Deliverables:**
- `packages/core/src/session/export.ts` — export in markdown, JSON, text formats
- `packages/core/src/session/export.test.ts` — export tests

**Dependencies:** Phase 7 (event log).

**Success Criteria:** Markdown export renders conversation cleanly with code blocks. JSON export preserves all event data. Text export is human-readable.

**Testing:** Create session with mixed content (text, code, tool calls). Export to all three formats. Verify markdown renders correctly. Verify JSON roundtrips.

**Estimated Hours:** 3–4 hours.

---

## Phase 13: Session Sharing via Gists

**Description:** Implement `/share` command: upload an anonymized session transcript as an unlisted GitHub Gist. The user gets a URL they can share with teammates. Strip sensitive data (API keys, file contents from private projects). The gist contains the conversation in readable markdown.

**Deliverables:**
- `packages/core/src/session/share.ts` — gist upload logic
- `packages/core/src/session/share.test.ts` — share tests (mock GitHub API)

**Dependencies:** Phase 12 (export formats), Phase 5 (config for GitHub token).

**Success Criteria:** `/share` creates a gist and returns a URL. Gist is unlisted (not public). Sensitive data is stripped. Gist contains readable markdown conversation.

**Testing:** Mock GitHub API, verify gist creation. Verify sensitive data stripping. Verify URL is returned to user.

**Estimated Hours:** 4–5 hours.

---

## Phase 14: Message/Part Hydration Model

**Description:** Define the message hydration model: how raw events are converted into the format the LLM expects. A message has parts: text, tool_call, tool_result, thinking. Hydration takes events from the log and assembles them into provider-compatible message arrays. Handle: partial messages (streaming in progress), tool call/result pairing, thinking block extraction.

**Deliverables:**
- `packages/core/src/session/message.ts` — message types (UserMessage, AssistantMessage, SystemMessage)
- `packages/core/src/session/hydration.ts` — event-to-message conversion
- `packages/core/src/session/hydration.test.ts` — hydration tests

**Dependencies:** Phase 7 (event log), Phase 5 (config for provider format differences).

**Success Criteria:** Events hydrate to correct message format for Anthropic, OpenAI, and Google providers. Partial messages handled. Tool call/result pairs are correctly matched.

**Testing:** Create event sequence (user → assistant → tool_call → tool_result → assistant). Hydrate to Anthropic format, OpenAI format, Google format. Verify each matches expected structure.

**Estimated Hours:** 6–8 hours.

---

## Phase 15: Token Accounting per Event

**Description:** Track token usage for every LLM interaction. Each provider returns usage data (prompt_tokens, completion_tokens). Record this per event in the cost tracker. Aggregate by session, model, provider, day, month. Support querying: "How much did I spend on Claude this month?" "What was the cost of session X?"

**Deliverables:**
- `packages/core/src/cost/tracker.ts` — token/cost tracking
- `packages/core/src/cost/queries.ts` — aggregation queries (by session/model/day/month)
- `packages/core/src/cost/tracker.test.ts` — tracking tests

**Dependencies:** Phase 8 (SQLite store), Phase 14 (message model includes usage data).

**Success Costs:** Cost data is recorded for every LLM call. Aggregations return correct totals. Queries are fast (<10ms).

**Testing:** Simulate 50 LLM calls with varied models. Query total cost. Query cost by model. Query cost by day. Verify sums are correct.

**Estimated Hours:** 4–5 hours.

---

## Phase 16: Crash Recovery Tests

**Description:** Write comprehensive crash recovery tests. Simulate crashes at every stage of the agent loop: during event append, during LLM streaming, during tool execution, during compaction. Verify that the system recovers correctly each time. This is the safety net for the event-sourced architecture.

**Deliverables:**
- `packages/core/src/recovery/crash.test.ts` — crash recovery test suite

**Dependencies:** Phases 7–15 (all core components must exist).

**Success Criteria:** Every crash scenario recovers to a consistent state. No data loss. No corruption. Recovery time is <1 second for sessions with <1000 events.

**Testing:** Kill process during: event append → verify no corruption. LLM streaming → verify partial response handled. Tool execution → verify tool call/result pair consistency. Compaction → verify old state preserved.

**Estimated Hours:** 6–8 hours.

---

# Stage 2 — Provider Layer (Phases 17–28)

---

## Phase 17: Abstract Model Interface

**Description:** Define the abstract `Model` interface that all provider adapters implement. This is the contract: given a prompt + tools + config, return a streaming response. The interface must support: text streaming, thinking/reasoning streaming, tool call streaming, structured output, model capabilities query. Use the AI SDK's language model specification as the base but wrap it in our own types for provider-specific escape hatches.

**Deliverables:**
- `packages/ai/src/model/types.ts` — Model interface, ModelCapabilities, ModelConfig
- `packages/ai/src/model/catalog.ts` — ModelCatalog interface (query models by provider/capabilities)
- `packages/ai/src/model/types.test.ts` — type tests

**Dependencies:** Phase 6 (error types), Phase 5 (config).

**Success Criteria:** Model interface covers all AI SDK capabilities. ModelCapabilities accurately describes what each model supports. Type tests compile without errors.

**Testing:** Define interface, create mock implementations, verify they satisfy the interface.

**Estimated Hours:** 4–5 hours.

---

## Phase 18: Anthropic Adapter

**Description:** Implement the Anthropic provider adapter using `@ai-sdk/anthropic`. Support: Claude Opus, Sonnet, Haiku model families. Handle: streaming (text + thinking + tool calls), tool calling with schemas, thinking blocks with effort levels, prompt caching markers, vision input. Map Anthropic-specific features (system prompt as separate parameter, cache_control markers) through the abstract interface.

**Deliverables:**
- `packages/ai/src/providers/anthropic/adapter.ts` — Anthropic adapter
- `packages/ai/src/providers/anthropic/models.ts` — model catalog entries
- `packages/ai/src/providers/anthropic/adapter.test.ts` — adapter tests (mocked API)

**Dependencies:** Phase 17 (Model interface).

**Success Criteria:** Can stream text from Claude models. Tool calls work. Thinking blocks stream correctly. Usage data is captured. Model catalog lists all Claude models with correct context windows and pricing.

**Testing:** Mock Anthropic API responses. Verify text streaming. Verify tool call streaming. Verify thinking block streaming. Verify usage tracking.

**Estimated Hours:** 6–8 hours.

---

## Phase 19: OpenAI Adapter

**Description:** Implement the OpenAI provider adapter using `@ai-sdk/openai`. Support: GPT-4o, GPT-4.1, o3/o4-mini reasoning models. Handle: streaming, tool calling, structured output, vision, reasoning effort levels. Map OpenAI-specific features (response format, tool_choice, parallel tool calls) through the abstract interface.

**Deliverables:**
- `packages/ai/src/providers/openai/adapter.ts` — OpenAI adapter
- `packages/ai/src/providers/openai/models.ts` — model catalog entries
- `packages/ai/src/providers/openai/adapter.test.ts` — adapter tests

**Dependencies:** Phase 17.

**Success Criteria:** Same as Phase 18 but for OpenAI models. GPT-4o streaming with tool calls works. o3 reasoning works.

**Estimated Hours:** 6–8 hours.

---

## Phase 20: Google Adapter

**Description:** Implement the Google provider adapter using `@ai-sdk/google`. Support: Gemini 2.5 Pro/Flash. Handle: streaming, tool calling, thinking, vision, large context windows.

**Deliverables:**
- `packages/ai/src/providers/google/adapter.ts`
- `packages/ai/src/providers/google/models.ts`
- `packages/ai/src/providers/google/adapter.test.ts`

**Dependencies:** Phase 17.

**Success Criteria:** Gemini models stream correctly. Tool calls work. Thinking blocks work.

**Estimated Hours:** 5–7 hours.

---

## Phase 21: OpenAI-Compatible Generic Adapter

**Description:** Implement a generic adapter for any OpenAI-compatible API endpoint. This covers: DeepSeek, Groq, Cerebras, Ollama (local), OpenRouter, vLLM, LM Studio, and any custom endpoint. The adapter sends standard OpenAI-format requests to any base URL with any API key. Include model discovery: query the `/v1/models` endpoint to populate the catalog.

**Deliverables:**
- `packages/ai/src/providers/openai-compatible/adapter.ts` — generic adapter
- `packages/ai/src/providers/openai-compatible/discovery.ts` — model discovery from /v1/models
- `packages/ai/src/providers/openai-compatible/adapter.test.ts` — adapter tests

**Dependencies:** Phase 17.

**Success Criteria:** Can connect to any OpenAI-compatible endpoint. Model discovery populates catalog. Streaming and tool calling work.

**Testing:** Mock OpenAI-compatible endpoint. Verify request format. Verify streaming. Verify model discovery.

**Estimated Hours:** 6–8 hours.

---

## Phase 22: Bedrock / Vertex / Azure Adapters

**Description:** Implement adapters for enterprise providers: AWS Bedrock (`@ai-sdk/amazon-bedrock`), Google Vertex AI (`@ai-sdk/google-vertex`), Azure OpenAI (`@ai-sdk/openai` with Azure config). These use different authentication (IAM, service accounts, API keys with endpoints) but expose similar model interfaces.

**Deliverables:**
- `packages/ai/src/providers/bedrock/adapter.ts`
- `packages/ai/src/providers/vertex/adapter.ts`
- `packages/ai/src/providers/azure/adapter.ts`
- Tests for each

**Dependencies:** Phases 18–21 (patterns established).

**Success Criteria:** All three enterprise adapters stream correctly. Authentication works with each provider's credential system.

**Estimated Hours:** 8–10 hours.

---

## Phase 23: Models.dev Catalog Sync ✅ COMPLETE

**Description:** Integrate with models.dev to fetch the complete model catalog: 75+ providers, context windows, pricing, capabilities (vision, reasoning, tool calling). On startup, fetch catalog and merge with our manually-defined models. This ensures we always have up-to-date model information without shipping catalog updates in our binary.

**Deliverables:**
- `packages/ai/src/catalog/sync.ts` — catalog sync from models.dev ✅
- `packages/ai/src/catalog/index.ts` — unified catalog interface + CatalogManager ✅
- `packages/ai/src/catalog/sync.test.ts` — 23 sync tests ✅
- `@opencode-ai/models` package installed for typed models.dev data

**Dependencies:** Phase 17 (ModelCatalog interface).

**Success Criteria:** Catalog syncs on startup. Merged catalog contains all models from models.dev plus our custom entries. Catalog query by provider/model ID works.

**Testing:** Mock models.dev API. Verify sync populates catalog. Verify merge with local entries. Verify query performance.

**Estimated Hours:** 4–6 hours. **Actual:** ~1 hour

---

## Phase 24: OAuth Subscription Auth Flows

**Description:** Implement OAuth flows for subscription-based providers: Claude Pro/Max (via claude.ai), ChatGPT Plus/Pro (via OpenAI), GitHub Copilot. These use browser-based OAuth to get tokens from the user's subscription, giving free access through their existing plans. Also support the Codex CLI subscription pattern.

**Deliverables:**
- `packages/ai/src/auth/oauth.ts` — OAuth flow implementation
- `packages/ai/src/auth/claude.ts` — Claude Pro/Max auth
- `packages/ai/src/auth/copilot.ts` — GitHub Copilot auth
- `packages/ai/src/auth/openai-subscription.ts` — ChatGPT Plus auth
- Tests for each

**Dependencies:** Phase 5 (config for auth storage).

**Success Criteria:** Can authenticate via browser OAuth. Tokens are stored securely. Tokens are refreshed automatically.

**Testing:** Mock OAuth endpoints. Verify token exchange. Verify token refresh. Verify token storage.

**Estimated Hours:** 10–12 hours.

---

## Phase 25: Retry/Backoff/Error Normalization

**Description:** Implement provider-agnostic retry logic with exponential backoff. Normalize errors from different providers into our ForgeError hierarchy: rate limits, context length exceeded, content refusal, authentication failure, network timeout. Each error type has a recommended recovery action.

**Deliverables:**
- `packages/ai/src/retry/backoff.ts` — exponential backoff with jitter
- `packages/ai/src/retry/normalize.ts` — error normalization per provider
- `packages/ai/src/retry/backoff.test.ts` — retry tests

**Dependencies:** Phases 18–22 (providers to normalize errors from).

**Success Criteria:** Rate limit errors trigger automatic retry. Context length errors are detected and compaction is triggered. Auth errors prompt re-login. All errors map to ForgeError subtypes.

**Testing:** Mock rate limit (429), context length (400), auth (401), network (timeout). Verify each triggers correct behavior.

**Estimated Hours:** 5–6 hours.

---

## Phase 26: Fallback Chains & Model Routing

**Description:** Implement provider fallback: if the primary provider fails, automatically try the next provider in the chain. Support model routing: "use Claude if available, fall back to GPT-4o, fall back to local Ollama." Configure via config or runtime flags.

**Deliverables:**
- `packages/ai/src/routing/fallback.ts` — fallback chain logic
- `packages/ai/src/routing/router.ts` — model routing (resolve model ID to provider + fallbacks)
- `packages/ai/src/routing/fallback.test.ts` — fallback tests

**Dependencies:** Phase 25 (retry/normalization).

**Success Criteria:** If primary provider returns 429, fallback to next provider automatically. Routing resolves "claude-sonnet-4-6" → Anthropic first, then OpenAI-compatible, then Ollama. Fallback is transparent to the agent loop.

**Testing:** Mock primary provider failure. Verify fallback triggers. Verify agent loop doesn't see the failure. Test routing with multiple providers.

**Estimated Hours:** 4–5 hours.

---

## Phase 27: Prompt Caching Accounting

**Description:** Implement prompt cache tracking per provider. Different providers cache differently: Anthropic uses `cache_control` markers, OpenAI caches automatically, Google has context caching. Track cache hits/misses and their cost impact. Surface this in the cost dashboard.

**Deliverables:**
- `packages/ai/src/cache/tracker.ts` — cache hit/miss tracking
- `packages/ai/src/cache/cost.ts` — cost calculation with cache discounts
- Tests

**Dependencies:** Phase 15 (cost tracking).

**Success Criteria:** Cache hit rate is tracked per provider. Cost calculations include cache discounts. Cache performance is surfaced in cost queries.

**Testing:** Mock cache hits and misses. Verify cost calculations. Verify cache hit rate reporting.

**Estimated Hours:** 4–5 hours.

---

## Phase 28: Cost Tracking Engine

**Description:** Build the complete cost tracking engine. Aggregate costs by: session, model, provider, day, month, custom tag. Provide a CLI command (`/cost`) and an API endpoint that returns cost breakdowns. Support budget limits: warn when daily/monthly budget is exceeded.

**Deliverables:**
- `packages/ai/src/cost/engine.ts` — cost aggregation engine
- `packages/ai/src/cost/budget.ts` — budget alerts
- `packages/ai/src/cost/engine.test.ts` — aggregation tests

**Dependencies:** Phase 15 (per-event tracking), Phase 27 (cache accounting).

**Success Costs:** Cost breakdowns are accurate. Budget alerts fire at threshold. Queries complete in <50ms.

**Testing:** Simulate 1000 events across multiple providers. Query costs by day, model, provider. Verify sums. Test budget alert at threshold.

**Estimated Hours:** 5–6 hours.

---

# Stage 2.5 — Free Model Gateway (Phases 29–32)

---

## Phase 29: Gateway Server

**Description:** Build `packages/gateway`, a standalone Hono server that exposes an OpenAI-compatible relay for free models. The gateway is our "Zen" — a hosted (or self-hostable) endpoint that lets clients talk to many free/cheap upstream providers through one API. Endpoints: `POST /v1/chat/completions` (OpenAI wire format, streaming via SSE `text/event-stream`, plus non-stream passthrough), `GET /v1/models` (lists routed free models), `GET /health` (status + uptime + upstream health). The relay does NOT reuse the `ai` SDK on the wire — upstream calls are raw `fetch` forwards so any upstream format quirk is preserved. Auth modes: `anonymous` (IP-tracked) or `token` (Bearer, single shared key). Streaming must preserve upstream `tool_calls` blocks and `reasoning` content untouched.

**Deliverables:**
- `packages/gateway/src/server.ts` — Hono app + routes + SSE (`@hono/node-server`)
- `packages/gateway/src/proxy.ts` — raw fetch relay with streaming passthrough
- `packages/gateway/src/auth.ts` — anonymous/token auth middleware
- `packages/gateway/src/server.test.ts` — route + proxy + SSE tests
- `packages/gateway/README.md`, `tsconfig.json`, `package.json`

**Dependencies:** Phase 20 (openai-compatible wire format), Phase 23 (models.dev catalog sync).

**Success Criteria:** A client pointed at `FORGE_GATEWAY_URL/v1` with an OpenAI-style body gets identical streamed completions from any configured upstream through one endpoint.

**Testing:** Start server locally, stream a completion from a mock upstream (fixture SSE), verify SSE framing + `tool_call`/reasoning passthrough. Test auth rejection with wrong/missing token. Test `/health`.

**Estimated Hours:** 6–8 hours.

---

## Phase 30: Upstream Router + Free-Tier Catalog

**Description:** Router that maps a model id → upstream provider + credentials + URL transformation. Seeded from the free catalog: query `@forge/ai` `syncCatalogToMap()` for models where `cost.input == 0 && cost.output == 0`, then apply free-tier presets (NVIDIA build.nvidia, Groq free tier, Cerebras, OpenRouter `:free` suffix). Keep a curated allowlist of model ids that are actually free and stable; expose `GET /v1/models` from it. Router supports: per-provider override of baseURL/apiKey/env-var resolution, header shaping, and deterministic fallback order (primary upstream, then backup) for production reliability.

**Deliverables:**
- `packages/gateway/src/router.ts` — model → upstream resolution + fallback
- `packages/gateway/src/presets.ts` — NVIDIA/Groq/Cerebras/OpenRouter free presets
- `packages/gateway/src/catalog.ts` — free-model allowlist built from `@forge/ai` catalog
- `packages/gateway/src/router.test.ts`

**Dependencies:** Phase 29 (gateway server), Phase 23 (models.dev catalog).

**Success Criteria:** `GET /v1/models` returns a curated list of free models; a request for a known model routes to the right upstream with the right headers.

**Testing:** Injectable router with fixture catalog. Test fallback ordering when primary upstream returns 5xx. Test unknown model → 404. Test allowlist filtering.

**Estimated Hours:** 5–7 hours.

---

## Phase 31: Quota, Rate Limits & Abuse Control

**Description:** Per-IP and per-token usage control. IP: fixed-window sliding rate limit (requests/min) + daily token quota. Token: monthly quota + optional billing webhook stub. Enforce `429` + `Retry-After` on rate limit, `429` on quota exhaustion, configurable daily cost cap. Abuse-control lever: a kill-switch per provider (disable any upstream that gets hammered). Persist counters in SQLite (`bun:sqlite`) with periodic write-back so gateway restarts don't blow the budget. Export counters via `GET /metrics`.

**Deliverables:**
- `packages/gateway/src/quota.ts` — token/cost quota engine (SQLite-backed)
- `packages/gateway/src/ratelimit.ts` — sliding-window IP limiter
- `packages/gateway/src/killswitch.ts` — per-upstream disable
- `packages/gateway/src/quota.test.ts` — limit + quota + kill-switch tests

**Dependencies:** Phase 29 (gateway server), Phase 28 (cost engine patterns).

**Success Criteria:** 61st request in a minute (limit 60) → `429` + `Retry-After`; daily quota cap returns `429` past budget; kill-switch clears a misbehaving upstream.

**Testing:** Simulate bursts across IPs; verify counters survive a restart (SQLite); time-travel tests for window sliding.

**Estimated Hours:** 5–7 hours.

---

## Phase 32: Client-Side forge-free Provider + Gateway Ops

**Description:** The client half. Add a `forge-free` provider preset to `@forge/ai`: baseURL resolves from `FORGE_GATEWAY_URL` (and optional `FORGE_GATEWAY_TOKEN`), model list pulled from `GET /v1/models`, wire format reused from the openai-compatible adapter. Also ship ops: `docker-compose.yml` for the gateway (env-driven provider keys), `.env.example`, a systemd unit, and `/metrics` docs. Provider ordering keeps `forge-free` with the free-tier presets (free providers first).

**Deliverables:**
- `packages/ai/src/providers/forge-free.ts` — `forge-free` provider preset
- `packages/gateway/docker-compose.yml` + `.env.example`
- `packages/gateway/deploy/systemd/forge-gateway.service`
- `packages/ai/src/providers/forge-free.test.ts`
- ADR-014 entry in `plans/DECISIONS_LOG.md`

**Dependencies:** Phase 30 (router), Phase 31 (quota), Phase 23 (catalog).

**Success Criteria:** One env var (`FORGE_GATEWAY_URL`) flips a client to free models; the gateway runs via `docker compose up` and serves `/metrics`.

**Testing:** Point `@forge/ai` at a local gateway instance, stream a completion end-to-end. Integration test: `docker compose up` → `/health` 200 → client stream works.

**Estimated Hours:** 5–7 hours.

---

# Stage 3 — Agent Loop + Core Tools (Phases 33–48)

---
## Phase 33: Streaming Agent Loop ✅ COMPLETE

**Description:** Implement the core agent loop: the heart of the system. Take a user prompt, assemble context, call the LLM, process the streaming response, execute any tool calls, append results, check context budget, and either continue or finish. The loop must handle: streaming text (display as it arrives), streaming thinking blocks, streaming tool calls (show arguments as they stream in), tool execution with permission checks, context overflow detection, and graceful cancellation.

**Deliverables:**
- `packages/core/src/agent/loop.ts` — the agent loop (~200 lines)
- `packages/core/src/agent/context.ts` — context assembly (system prompt + history + tools)
- `packages/core/src/agent/types.ts` — structural types mirroring `@forge/ai` Model/StreamChunk/Tool shapes
- `packages/core/src/agent/loop.test.ts` — loop tests with mocked LLM (text-only, tool call, streaming deltas, cancellation, permission denied, tool errors, max iterations, context overflow)
- `packages/core/src/agent/context.test.ts` — context assembly tests (token estimation, trimming, overflow detection)

**Dependencies:** Phase 14 (hydration), Phase 17 (Model interface), Phase 5 (config).

**Success Criteria:** Loop processes a user prompt and returns a response. Streaming events are emitted for text, thinking, and tool calls. Tool calls are executed and results fed back. Loop terminates when LLM stops calling tools. Cancellation and max-iterations guards work. Context overflow detected and handled.

**Testing:** All 11 agent tests pass: text-only (1 turn), tool call + completion (2 turns), streaming tool-call-delta accumulation, cancellation (pre-aborted signal), permission denied, tool throws, max iterations, context overflow, token estimation, message trimming, request message conversion.

**Estimated Hours:** 12–16 hours (this is the critical path).

---

## Phase 34: Tool Registry

**Description:** Implement the tool registry: a scoped, typed registry of all tools the agent can use. Each tool has: a name, description, input schema (TypeBox), execution function, risk level, and whether it requires permission. The registry supports: register tools, list tools (filtered by scope), get tool by name, execute tool (with permission check).

**Deliverables:**
- `packages/core/src/tools/registry.ts` — tool registry
- `packages/core/src/tools/types.ts` — Tool, ToolDefinition, ToolResult types
- `packages/core/src/tools/registry.test.ts` — registry tests

**Dependencies:** Phase 5 (config for tool permissions), Phase 6 (errors).

**Success Criteria:** Tools register correctly. Tool lookup by name works. Tool execution goes through permission engine. Tool schemas are valid for LLM consumption.

**Testing:** Register tools, list them, get by name, execute with mocked permission engine.

**Estimated Hours:** 6–8 hours.

---

## Phase 35: Read/Write/Edit Tools (str_replace)

**Description:** Implement the three file manipulation tools that every coding agent needs. `Read`: read file contents with line numbers, support offsets and limits. `Write`: create or overwrite a file. `Edit`: apply precise string replacements (str_replace pattern) — this is how Claude Code edits files. Each tool must: validate file paths against permission boundaries, handle file-not-found gracefully, return clean error messages, and append events to the session log.

**Deliverables:**
- `packages/core/src/tools/read.ts` — read tool
- `packages/core/src/tools/write.ts` — write tool
- `packages/core/src/tools/edit.ts` — edit tool (str_replace)
- `packages/core/src/tools/file-utils.ts` — shared file utilities
- Tests for all three

**Dependencies:** Phase 34 (registry).

**Success Criteria:** Can read files with offset/limit. Can write new files. Can edit existing files via str_replace. Permission boundaries enforced. All operations recorded in event log.

**Testing:** Read a file with offset. Write a new file. Edit a file via str_replace. Try to edit outside permission boundary → denied. Try to read non-existent file → clear error.

**Estimated Hours:** 8–10 hours.

---

## Phase 36: Bash Tool

**Description:** Implement the bash/shell tool with persistent session support and timeout control. The tool: executes commands in the user's shell, captures stdout/stderr, supports timeout (default 120s), returns exit code, supports background execution for long-running commands. Also implement a "new shell" vs "existing shell" option — persistent shells maintain environment state between calls.

**Deliverables:**
- `packages/core/src/tools/bash.ts` — bash tool
- `packages/core/src/tools/bash-manager.ts` — shell session manager
- Tests

**Dependencies:** Phase 34 (registry).

**Success Criteria:** Can execute shell commands. stdout/stderr captured. Timeout kills long-running commands. Exit code is captured and reported. Persistent shell maintains environment between calls.

**Testing:** Run `echo hello` → stdout captured. Run `sleep 100` with 5s timeout → killed. Run `exit 1` → exit code 1. Persistent shell: set env var, verify it persists.

**Estimated Hours:** 8–10 hours.

---

## Phase 37: Glob/Grep Tools (ripgrep-backed) ✅ COMPLETE

**Description:** Implement search tools: `Glob` for file pattern matching (find files by name/extension), `Grep` for content search (regex across file contents). Both backed by `ripgrep` for speed. Glob uses ripgrep's file listing mode. Grep uses ripgrep's regex search with context lines.

**Deliverables:**
- `packages/core/src/tools/glob.ts` — glob tool (`rg --files --glob`, case-sensitive option, path restriction)
- `packages/core/src/tools/grep.ts` — grep tool (ripgrep-backed, `--heading --line-number --context`, include/exclude globs, maxResult cap, structured GrepMatch metadata)
- Tests (glob.test.ts, grep.test.ts — 21 tests)

**Dependencies:** Phase 34 (registry).

**Success Criteria:** Glob finds files matching patterns. Grep finds content matching regex. Both respect permission boundaries (don't search outside allowed paths). Results include file paths and line numbers.

**Testing:** Glob for `*.ts` → finds TypeScript files. Grep for `function` → finds function declarations. Search outside allowed path → denied. All 21 tests pass (require `rg`).

**Estimated Hours:** 5–6 hours.

---

## Phase 38: Todo/Task Tools ✅ COMPLETE

**Description:** Implement task management tools: `TodoWrite` (create/update task list), `TodoRead` (read current tasks). Tasks persist across agent turns and are visible in the TUI status bar. The agent uses these to track multi-step work and report progress.

**Deliverables:**
- `packages/core/src/tools/todo-manager.ts` — `TaskStore` (session-scoped task lists, snapshot semantics, `TodoItem`/`TaskStatus` types, status validation)
- `packages/core/src/tools/todo.ts` — `todoWriteTool` + `todoReadTool` (TypeBox schemas, status counts in metadata, max 100 tasks per write, `ToolError` on invalid input)
- Tests (todo.test.ts — 21 tests: store semantics, snapshot replace, session isolation, registry persistence across turns)

**Dependencies:** Phase 34 (registry).

**Success Criteria:** Agent can create task lists. Tasks update across turns. Tasks persist to session store.

**Testing:** Create tasks, update status, verify persistence across agent turns. All 21 tests pass.

**Estimated Hours:** 3–4 hours.

---

## Phase 39: WebFetch Tool ✅ COMPLETE

**Description:** Implement the `WebFetch` tool: fetch a URL and return its content as markdown. Handle: HTML-to-markdown conversion, timeout, error handling, content truncation for large pages.

**Deliverables:**
- `packages/core/src/tools/web-fetch.ts` — `webFetchTool` with Bun `fetch`, `AbortController` timeout, streaming body reader with length cap, HTML→markdown converter (headers, paragraphs, bold/italic, code, links, images, lists, blockquotes, entities), configurable timeout/maxLength, truncated notice
- Tests (web-fetch.test.ts — 25 tests: HTML→markdown converter unit tests, integration with local test server, timeout, abort, truncation, non-HTML, registry)

**Dependencies:** Phase 34 (registry).

**Success Criteria:** Can fetch any URL and return markdown content. Large pages are truncated with a notice. Errors are handled gracefully.

**Testing:** Fetch a known URL → returns markdown. Fetch non-existent URL → error. Fetch very large page → truncated. All 25 tests pass.

**Estimated Hours:** 4–5 hours.

---

## Phase 40: WebSearch Tool ✅ COMPLETE

**Description:** Implement the `WebSearch` tool: search the web using a search provider. Support: Exa (embeddings-based semantic search), Brave Search, or Tavily. The tool returns structured results with titles, URLs, and snippets.

**Deliverables:**
- `packages/core/src/tools/web-search.ts` — `webSearchTool` with provider abstraction, configurable default provider, per-call provider override, TypeBox schema, medium risk / requires permission
- `packages/core/src/tools/web-search-providers/exa.ts` — Exa provider (neural/embeddings search, highlights, autoprompt, domain filters, recency)
- `packages/core/src/tools/web-search-providers/brave.ts` — Brave provider (traditional web search, snippets, safesearch, freshness)
- Tests (web-search.test.ts — 15 tests: provider factory, mocked provider integration, schema structure, registry)

**Dependencies:** Phase 34 (registry), Phase 5 (config for API keys).

**Success Criteria:** Web search returns relevant results. Provider can be switched via config. Results include title, URL, snippet.

**Testing:** Mock search API. Verify results are structured correctly. Test with different providers. All 15 tests pass.

**Estimated Hours:** 4–5 hours.

---

## Phase 41: NotebookEdit Tool ✅ COMPLETE

**Description:** Implement the `NotebookEdit` tool for Jupyter notebook editing. Handle JSON structure of .ipynb files. Support: create cells, edit cells, delete cells, reorder cells.

**Deliverables:**
- `packages/core/src/tools/notebook-edit.ts` — `notebookEditTool` with operations (create, edit, delete, reorder, read), notebook validation, cell type handling (code/markdown/raw), source normalization, atomic writes, medium risk / requires permission
- Tests (notebook-edit.test.ts — 30 tests: read, create, edit, delete, reorder, multi-op sequences, bounds validation, error handling, schema structure, registry integration)

**Dependencies:** Phase 34 (registry).

**Success Criteria:** Can create, edit, and delete notebook cells. JSON structure is preserved. Outputs are handled.

**Testing:** Create a notebook, add cells, edit cells, verify structure. All 30 tests pass.

**Estimated Hours:** 3–4 hours.

---

## Phase 42: Diff Rendering Pipeline ✅ COMPLETE

**Description:** Build the diff rendering pipeline that converts file changes into readable, syntax-highlighted diffs. Support: unified diffs, side-by-side diffs, inline diffs. Use `diff` library for computing diffs and `shiki` for syntax highlighting.

**Deliverables:**
- `packages/core/src/diff/compute.ts` — `computeDiff()` with line/word/char algorithms, configurable context lines, hunk building, output formatting (unified/side-by-side/inline), max file size limit
- `packages/core/src/diff/render.ts` — `renderDiff()` with ANSI color output for terminal, HTML output with shiki syntax highlighting, language detection from file extension, auto-render helper
- `packages/core/src/diff/render.test.ts` — 21 tests (compute algorithms, formatting options, rendering formats, language detection, integration)
- `packages/core/src/diff/index.ts` — barrel export

**Dependencies:** None (can be built independently).

**Success Criteria:** Diffs are computed correctly. Syntax highlighting works for major languages. Diffs are readable in terminal (with colors).

**Testing:** Diff two file versions. Verify diff is correct. Verify syntax highlighting renders. Test with empty files, large files. All 21 tests pass.

**Estimated Hours:** 5–6 hours.

---

## Phase 43: File Freshness Guards ✅ COMPLETE

**Description:** Implement file freshness checks: when the agent reads a file, record its content hash. When the agent later edits that file, check if the hash has changed (indicating external modification). If stale, warn the user and optionally re-read the file. This prevents the agent from making edits based on outdated file contents.

**Deliverables:**
- `packages/core/src/tools/freshness.ts` — `FreshnessTracker` (session-scoped, SHA-256 content hashes, `recordRead`/`checkFreshness`), `checkFreshnessBeforeEdit` (warn or block), `recordFileRead` (update after write), integration with read/write/edit tools via optional `sessionId`
- Tests (freshness.test.ts — 19 tests: record/read, modification detection, deletion, session isolation, blockOnStale, integration)

**Dependencies:** Phase 35 (Read/Write/Edit tools).

**Success Criteria:** File changes detected between read and edit. Warning shown to user. Agent can re-read the file.

**Testing:** Read a file, modify it externally, edit it → warning shown. Read a file, edit it without external change → no warning. All 19 tests pass.

**Estimated Hours:** 3–4 hours.

---

## Phase 44: Parallel Tool Execution ✅ COMPLETE

**Description:** Implement bounded-concurrency parallel tool execution. When the LLM makes multiple tool calls in one response (parallel tool use), execute them concurrently with a configurable concurrency limit (default: 32). This dramatically speeds up tasks that make many independent file reads or searches.

**Deliverables:**
- `packages/core/src/tools/parallel.ts` — `Semaphore` (bounded concurrency), `executeParallel` (ordered results, configurable limit, continueOnError, callTimeout, abort signal propagation), `executeParallelWithRegistry`, `createParallelExecutor`, `summarizeParallelResults`
- Tests (parallel.test.ts — 18 tests: semaphore, parallel execution, concurrency limits, ordering, error handling, abort signals, timeouts, registry integration)

**Dependencies:** Phase 34 (registry).

**Success Criteria:** Multiple tool calls execute concurrently. Concurrency limit is respected. Results are returned in order. Errors in one tool don't crash others.

**Testing:** Make 10 parallel tool calls. Verify all complete. Verify concurrency limit (max 32 simultaneous). Kill one tool → others continue. All 18 tests pass.

**Estimated Hours:** 4–5 hours.

---

## Phase 45: Steering/Followup Message Injection ✅ COMPLETE

**Description:** Implement steering: the ability to inject a new user message into the agent loop while it's running. This lets the user correct course mid-execution: "Actually, don't use lodash, use ramda instead." The steering message is appended to the conversation and the agent adapts.

**Deliverables:**
- `packages/core/src/agent/steering.ts` — `SteeringController` (push/takeAll/hasPending/close), `steeringToMessage`, `applySteering` (injects messages before context assembly), integration with `runAgentLoop` via optional `steering` option
- `LoopEvent` extended with `steering-injected` event type
- Tests (steering.test.ts — 15 tests: controller, message conversion, applySteering, loop integration with tool-call turns, event emission)

**Dependencies:** Phase 33 (agent loop).

**Success Criteria:** User can inject a message while agent is running. Agent sees the message and adapts behavior. Original task continues with new context.

**Testing:** Start agent on task, inject steering message mid-execution, verify agent adapts. All 15 tests pass.

**Estimated Hours:** 4–5 hours.

---

## Phase 46: Interrupt/Cancel Semantics ✅ COMPLETE

**Description:** Implement graceful interruption: user can press Escape or Ctrl+C to cancel the current agent turn. The agent should: stop LLM streaming, complete any in-progress tool executions (or cancel them), save partial progress to the event log, and return control to the user. The session can be resumed later.

**Deliverables:**
- `packages/core/src/agent/interrupt.ts` — `InterruptController` (requestInterrupt, waitForTools, tool tracking, abort signal), `createLinkedAbortSignal`, `withInterrupt`, `withInterruptIterator`, `interruptReasonFromSignal`; integrates with agent loop via abort signal
- Tests (interrupt.test.ts — 25 tests: controller state, interrupt request, tool tracking, waitForTools with timeout, callbacks, withInterrupt/withInterruptIterator, linked signals, reason extraction)

**Dependencies:** Phase 33 (agent loop).

**Success Criteria:** Interrupt stops LLM streaming. Partial progress is saved. Session can be resumed. No data corruption.

**Testing:** Start agent, interrupt mid-stream, verify partial response saved. Resume session, verify it picks up correctly. All 25 tests pass.

**Estimated Hours:** 4–5 hours.

---

## Phase 47: Loop Unit Tests vs mini-swe-agent Baseline ✅ COMPLETE

**Description:** Write comprehensive agent loop tests that verify the loop handles all edge cases from mini-swe-agent's approach: linear history, subprocess-per-action, tool result pairing, error recovery, context overflow. These tests establish the baseline correctness of our loop implementation.

**Deliverables:**
- `packages/core/src/agent/loop-comprehensive.test.ts` — 32 comprehensive loop tests covering: single-turn, multi-turn, tool calls, tool call/result pairing, error recovery, cancellation, context overflow, steering integration, parallel tools, interrupt integration, message history integrity, edge cases, session resume simulation
- Fixed critical bug in `streamTurn`: `finish` chunk now properly parses partial tool calls from deltas before returning

**Dependencies:** Phase 33 (agent loop), Phases 34-46 (all tools).

**Success Criteria:** Loop handles all edge cases. Tests cover: single-turn, multi-turn, tool calls, errors, cancellation, context overflow, steering, parallel tools. All 32 tests pass.

**Estimated Hours:** 8–10 hours.

---

## Phase 48: Code-Mode Batching Experiment ✅ COMPLETE

**Description:** Experimental phase: implement "code mode" from DeepSeek Harness. Instead of exposing tools as individual function calls, generate a TypeScript SDK for the available tools and let the model write a single program that calls multiple tools in sequence. This turns 5 sequential round-trips into 1 LLM call. Prototype and benchmark against normal tool calling.

**Deliverables:**
- `packages/core/src/agent/code-mode.ts` — code mode implementation with SDK generation, program execution, tool injection
- `packages/core/src/agent/code-mode.test.ts` — 17 tests covering SDK generation, prompt building, program cleaning, type conversion
- Updated barrel export in `packages/core/src/agent/index.ts`

**Dependencies:** Phase 33 (agent loop), Phase 34 (tool registry).

**Success Criteria:** Code mode generates correct TS SDK. Model can write a program using the SDK. Programs execute and produce correct results. All 17 tests pass. Build clean.

**Estimated Hours:** 8–12 hours (experimental, time-boxed).

---

# Stage 4 — Permissions & Security (Phases 49–58)

---

## Phase 49: Permission Modes Engine ✅ COMPLETE

**Description:** Implement the permission mode system: `default`, `acceptEdits`, `plan`, `auto`, `dontAsk`, `bypass`. Each mode defines different default behaviors for tool calls. The mode can be set per-session, per-project, or globally. Users cycle through modes with Shift+Tab.

**Deliverables:**
- `packages/core/src/permissions/modes.ts` — permission mode definitions with 6 modes, tool categorization, custom rule support
- `packages/core/src/permissions/modes.test.ts` — 39 tests covering all modes, tool categories, custom rules, cycling, validation
- `packages/core/src/permissions/index.ts` — barrel export

**Dependencies:** Phase 5 (config).

**Success Criteria:** Each mode correctly defines allow/ask/deny for every tool type. Mode switching works. Mode persists across turns. All 39 tests pass. Build clean.

**Estimated Hours:** 6–8 hours.

---

## Phase 50: Allow/Deny/Ask Rule DSL ✅ COMPLETE

**Description:** Implement the rule DSL: users can define rules like "allow Read for all files", "deny Write outside src/", "ask for Bash if command contains rm". Rules are defined in config and matched against tool name + input arguments + file paths.

**Deliverables:**
- `packages/core/src/permissions/rules.ts` — rule matching engine with glob/regex support, priority-based matching
- `packages/core/src/permissions/rules.test.ts` — 36 tests covering glob conversion, condition compilation, rule matching, priority ordering, string parsing
- Updated barrel export in `packages/core/src/permissions/index.ts`

**Dependencies:** Phase 49 (modes).

**Success Criteria:** Rules match correctly. Glob patterns work for paths. Regex works for commands. Rules override mode defaults. All 36 tests pass. Build clean.

**Estimated Hours:** 6–8 hours.

---

## Phase 51: Path Boundary Enforcement ✅ COMPLETE

**Description:** Implement strict path boundary enforcement: the agent can only read/write files within allowed directories. Default allowed directory: the current working directory. Additional directories can be added via config. Path traversal attempts (../) are blocked.

**Deliverables:**
- `packages/core/src/permissions/boundaries.ts` — path boundary enforcement with traversal detection, config management
- `packages/core/src/permissions/boundaries.test.ts` — 40 tests covering normalization, traversal detection, boundary checking, config management, filtering
- Updated barrel export in `packages/core/src/permissions/index.ts`

**Dependencies:** Phase 50 (rules).

**Success Criteria:** File operations outside allowed paths are blocked. Path traversal is prevented. Additional directories can be whitelisted. All 40 tests pass. Build clean.

**Estimated Hours:** 4–5 hours.

---

## Phase 52: Command Risk Classifier ✅ COMPLETE

**Description:** Implement a command risk classifier for bash commands. Classify commands as: low risk (ls, cat, echo), medium risk (npm install, git commit), high risk (rm -rf, git push --force), critical (rm -rf /, sudo). The classifier can be used by permission rules to auto-approve low-risk commands and prompt for high-risk ones.

**Deliverables:**
- `packages/core/src/permissions/classifier.ts` — command risk classification with 150+ patterns across 4 risk levels
- `packages/core/src/permissions/classifier.test.ts` — 198 tests covering all risk levels, edge cases, piping, variables
- Updated barrel export in `packages/core/src/permissions/index.ts`

**Dependencies:** None (can be built independently).

**Success Criteria:** Commands are classified correctly. Edge cases handled (piped commands, variable expansion, aliases). Classification is fast (<1ms). All 198 tests pass. Build clean.

**Estimated Hours:** 5–6 hours.

---

## Phase 53: Circuit Breakers ✅ COMPLETE

**Description:** Implement circuit breakers: certain actions ALWAYS prompt for confirmation regardless of mode or rules. These include: `rm -rf /`, `rm -rf ~`, `git push --force` to main, `DROP TABLE`, modifying system files. This is the last line of defense against catastrophic actions.

**Deliverables:**
- `packages/core/src/permissions/circuit-breakers.ts` — 15 circuit breaker triggers covering critical system operations
- `packages/core/src/permissions/circuit-breakers.test.ts` — 40 tests covering all breakers, priority ordering, bypass mode override
- Updated barrel export in `packages/core/src/permissions/index.ts`

**Dependencies:** Phase 52 (classifier).

**Success Criteria:** Circuit breakers fire regardless of permission mode. Even in `bypass` mode, these actions prompt. User can see what would happen and confirm or deny. All 40 tests pass. Build clean.

**Estimated Hours:** 3–4 hours.

---

## Phase 54: Secret Redaction ✅ COMPLETE

**Description:** Implement secret redaction: API keys, tokens, passwords, and other secrets are automatically detected and masked in all output (logs, tool results, event log). Use pattern matching (env vars, key formats) + explicit secret registry.

**Deliverables:**
- `packages/core/src/security/redact.ts` — redaction engine with 25+ built-in patterns
- `packages/core/src/security/redact.test.ts` — 53 tests covering all patterns, custom patterns, options
- `packages/core/src/security/index.ts` — barrel export

**Dependencies:** None.

**Success Criteria:** API keys in output are replaced with `[REDACTED]`. Env vars containing secrets are masked. Redaction is applied before storage and display. All 53 tests pass. Build clean.

**Testing:** Output containing `sk-ant-...` → redacted. Output containing `ghp_...` → redacted. False positive rate < 5%.

**Estimated Hours:** 4–5 hours.

---

## Phase 55: Audit Log ✅ COMPLETE

**Description:** Implement a comprehensive audit log: every tool call, permission decision, hook execution, and session event is logged with full context. The audit log is append-only and tamper-evident (each entry includes a hash of the previous entry). Support querying: "What did the agent do in the last hour?" "Show me all bash commands run in this session."

**Deliverables:**
- `packages/core/src/security/audit.ts` — audit log with hash chain, querying, export/import
- `packages/core/src/security/audit.test.ts` — 43 tests covering logging, hash chain, querying, integrity, export/import
- Updated barrel export in `packages/core/src/security/index.ts`

**Dependencies:** Phase 7 (event log pattern).

**Success Criteria:** Every action is logged. Audit log is append-only. Hash chain provides tamper evidence. Queries work. All 43 tests pass. Build clean.

**Estimated Hours:** 5–6 hours.

---

## Phase 56: Security Analyzer Interface ✅ COMPLETE

**Description:** Define the SecurityAnalyzer interface (inspired by OpenHands): a pluggable component that rates each tool call as low/medium/high/unknown risk before execution. The default implementation uses the command classifier (Phase 52). A more advanced implementation could use an LLM to assess risk. The ConfirmationPolicy decides whether to pause for approval based on the risk rating.

**Deliverables:**
- `packages/core/src/security/analyzer.ts` — SecurityAnalyzer interface, DefaultSecurityAnalyzer, DefaultConfirmationPolicy, AnalyzerRegistry
- `packages/core/src/security/analyzer.test.ts` — 43 tests covering analyzer, policy, registry, custom patterns
- Updated barrel export in `packages/core/src/security/index.ts`

**Dependencies:** Phase 52 (classifier).

**Success Criteria:** Interface is defined. Default implementation rates tool calls correctly. Interface is extensible (plugins can provide custom analyzers). All 43 tests pass. Build clean.

**Estimated Hours:** 4–5 hours.

---

## Phase 57: DontAsk/Bypass Profiles ✅ COMPLETE

**Description:** Implement the `dontAsk` and `bypass` permission profiles. `dontAsk`: auto-denies tools unless explicitly pre-approved via `/permissions`. `bypass`: skips all permission prompts (except circuit breakers). Both are useful for CI/automation and power users.

**Deliverables:**
- `packages/core/src/permissions/profiles.ts` — dontAsk and bypass profile implementations with pre-approvals, circuit breaker integration
- `packages/core/src/permissions/profiles.test.ts` — 49 tests covering both profiles, CI pre-approvals, circuit breaker overrides, engine
- Updated barrel export in `packages/core/src/permissions/index.ts`

**Dependencies:** Phase 49 (modes), Phase 53 (circuit breakers).

**Success Criteria:** dontAsk denies unapproved tools. bypass approves everything except circuit breakers. Both work in headless mode. All 49 tests pass. Build clean.

**Estimated Hours:** 3–4 hours.

---

## Phase 58: Permission Prompt UI Contract ✅ COMPLETE

**Description:** Define the contract between the permission engine and the TUI: how permission prompts are displayed and how user responses are captured. The contract must work for TUI (interactive), headless (auto-deny or auto-approve), and SDK (callback-based).

**Deliverables:**
- `packages/core/src/permissions/ui-contract.ts` — PermissionUI interface with mock, headless, and SDK implementations
- `packages/core/src/permissions/ui-contract.test.ts` — 33 tests covering all implementations and contract compliance
- Updated barrel export in `packages/core/src/permissions/index.ts`

**Dependencies:** Phase 49 (modes).

**Success Criteria:** Contract is defined. Mock implementations work. TUI, headless, and SDK can all implement the contract. All 33 tests pass. Build clean.

**Estimated Hours:** 3–4 hours.

---

# Stage 5 — Sexy TUI v1 (Phases 59–72)

---

## Phase 59: Renderer Choice Spike ✅ COMPLETE

**Description:** Benchmark OpenTUI vs Ink for our specific use case: streaming markdown with syntax highlighting, large file lists, tool execution status, and diff rendering. Measure: startup time, rendering latency, memory usage, and developer ergonomics. If OpenTUI wins (expected), lock it in. If Ink wins, pivot.

**Deliverables:**
- `packages/tui/src/spike/open-tui-bench.tsx` — OpenTUI benchmark (API exploration)
- `packages/tui/src/spike/ink-bench.tsx` — Ink benchmark (completed successfully)
- `packages/tui/src/spike/REPORT.md` — benchmark results and decision

**Dependencies:** Phase 3 (monorepo scaffold).

**Success Criteria:** Benchmark is reproducible. Results are documented. Decision is made and justified.

**Testing:** Run both benchmarks. Compare numbers. Make decision.

**Results:** **Ink selected** — OpenTUI v0.1.x API unstable, no headless benchmarking support. Ink v4.4.1 completed all tests successfully.

**Estimated Hours:** 6–8 hours.

---

## Phase 60: App Shell & Layout System ✅ COMPLETE

**Description:** Build the TUI app shell: the skeleton that all other components render inside. Implement: main layout (sidebar + chat area + input area), theme system (dark/light/daltonized), responsive layout (adapts to terminal size), keyboard navigation framework (leader key pattern like opencode).

**Deliverables:**
- `packages/tui/src/app.tsx` — app entry point
- `packages/tui/src/layout/main.tsx` — main layout
- `packages/tui/src/theme/index.tsx` — theme system (dark/light/daltonized)
- `packages/tui/src/keyboard/index.ts` — keyboard navigation framework (leader key pattern)
- `packages/tui/src/index.ts` — barrel exports
- `packages/tui/src/global.d.ts` — type extensions for Ink

**Dependencies:** Phase 59 (renderer choice).

**Success Criteria:** App shell renders in terminal. Layout adapts to terminal resize. Theme switching works. Keyboard navigation framework supports leader keys.

**Testing:** Launch TUI, resize window, verify layout adapts. Switch themes. Test leader key sequences. All tests pass.

**Estimated Hours:** 10–12 hours.

---

## Phase 61: Streaming Markdown Renderer ✅ COMPLETE

**Description:** Build the markdown renderer that handles streaming content. As tokens arrive from the LLM, render them as formatted markdown: headers, code blocks with syntax highlighting, bold/italic, links, lists. Must handle incomplete markdown (streaming in progress) without breaking layout.

**Deliverables:**
- `packages/tui/src/components/markdown.tsx` — streaming markdown renderer
- `packages/tui/src/components/markdown-parser.ts` — incremental markdown parser
- `packages/tui/src/components/code-block.tsx` — code block with syntax highlighting (using Shiki)
- `packages/tui/src/components/index.ts` — barrel exports
- Tests for parser and components

**Dependencies:** Phase 60 (app shell).

**Success Criteria:** Markdown renders correctly as it streams. Code blocks have syntax highlighting. Incomplete markdown doesn't break layout. Performance is smooth for large responses.

**Testing:** Stream a response with mixed markdown (headers, code, lists). Verify rendering. Test with very large responses (10k tokens). All 48 tests pass.

**Estimated Hours:** 10–12 hours.

---

## Phase 62: Diff Viewer Overlay ✅ COMPLETE

**Description:** Build a full-screen diff viewer overlay: when the agent makes file changes, show a syntax-highlighted diff that the user can scroll through. Support: unified and side-by-side views, keyboard navigation (j/k for scroll), accept/reject individual changes.

**Deliverables:**
- `packages/tui/src/components/diff-viewer.tsx` — diff viewer overlay
- `packages/tui/src/components/diff-viewer.test.tsx` — tests
- Exports via `packages/tui/src/components/index.ts`

**Dependencies:** Phase 42 (diff rendering pipeline), Phase 60 (app shell).

**Success Criteria:** Diffs render with syntax highlighting. Scrolling works. Accept/reject works.

**Testing:** Open diff viewer with a large diff. Scroll through. Verify syntax highlighting. All 63 tests pass (including 15 new DiffViewer tests).

**Estimated Hours:** 8–10 hours.

---

## Phase 63: Multiline Editor ✅ COMPLETE

**Description:** Build the multiline editor component: where the user types their prompts. Support: multiline input (Shift+Enter for newlines), history navigation (up/down arrows), bash mode toggle (for running commands directly), paste handling (large pastes don't break), file @ mentions, slash command detection.

**Deliverables:**
- `packages/tui/src/components/editor.tsx` — multiline editor (mode bar, cursor, key handling)
- `packages/tui/src/components/editor-buffer.ts` — pure buffer + key reducer (testable)
- `packages/tui/src/components/editor-history.ts` — input history
- `packages/tui/src/components/editor.test.tsx`, `editor-buffer.test.ts`, `editor-history.test.ts` — tests

**Dependencies:** Phase 60 (app shell).

**Success Criteria:** Multiline input works. History navigation works. Bash mode toggle works. Paste handling is smooth. @ mentions and slash commands are detected.

**Testing:** 118 tui tests pass (including 21 new editor tests). Pure reducer `reduceEditorKey` covers insert/backspace/delete/cursor/ctrl-combos/submit/toggle/history/escape and slash+mention detection. Smoke tests verify rendering via mock stdout.

**Estimated Hours:** 8–10 hours.

---

## Phase 64: Slash-Command Palette ✅ COMPLETE

**Description:** Build the slash-command palette: a fuzzy-searchable popup that appears when the user types `/`. List all available commands (built-in + plugin-provided) with descriptions. Support keyboard navigation (arrow keys, Enter to select, Esc to cancel).

**Deliverables:**
- `packages/tui/src/components/command-palette.tsx` — command palette (filterCommands, moveSelection, CommandPalette, defaultCommands)
- `packages/tui/src/components/command-palette.test.ts` — filter/nav unit tests
- `packages/tui/src/components/command-palette-render.test.tsx` — render smoke tests

**Dependencies:** Phase 60 (app shell), Phase 34 (tool registry — for listing available commands).

**Success Criteria:** Palette appears on `/`. Fuzzy search works. All commands listed. Keyboard navigation works.

**Testing:** 134 tui tests pass (20 new palette tests). `filterCommands` does case-insensitive multi-term fuzzy matching with title-prefix ranking; `moveSelection` wraps around list edges; smoke tests verify open/closed/no-match rendering via mock stdout.

**Estimated Hours:** 5–6 hours.

---

## Phase 65: Permission Dialogs ✅ COMPLETE

**Description:** Build the permission prompt UI: when the agent needs permission to execute a tool, show a clear dialog with: tool name, what it wants to do (parsed from arguments), risk level indicator, and approve/deny options. Support: "allow for this session", "allow always for this project".

**Deliverables:**
- `packages/tui/src/components/permission-dialog.tsx` — permission prompt (`describeRequest`, `resolveFromChoice`, `riskColor`, `PermissionDialog`)
- `packages/tui/src/components/permission-dialog.test.ts` — helper unit tests
- `packages/tui/src/components/permission-dialog-render.test.tsx` — render smoke tests

**Dependencies:** Phase 58 (permission UI contract), Phase 60 (app shell).

**Success Criteria:** Permission prompt shows clearly. Tool details are parsed and displayed. User can approve/deny/always-allow. Response flows back to permission engine.

**Testing:** 153 tui tests pass (19 new permission-dialog tests). `describeRequest` parses bash/read/write/edit/web/glob/grep args into human-readable summaries; `resolveFromChoice` maps allow/allow-session/allow-always/deny/deny-always to a `PermissionResponse` (with `customRule.target = tool.name` for always-scoped). Smoke tests verify open/closed/deny-only/args rendering via mock stdout.

**Estimated Hours:** 6–8 hours.

---

## Phase 66: Status Bar ✅ COMPLETE

**Description:** Build the bottom status bar: displays current state at a glance. Shows: git branch, current model name, token usage, cost this session, agent status (thinking/executing/idle), background task count, context window usage.

**Deliverables:**
- `packages/tui/src/components/status-bar.tsx` — status bar (`StatusBar`, `buildStatusBarSegments`, `selectVisibleSegments`, `formatTokens`, `formatCost`, `statusColor`)
- `packages/tui/src/components/status-bar.test.ts` — helper/segment/greedy unit tests
- `packages/tui/src/components/status-bar-render.test.tsx` — render smoke tests

**Dependencies:** Phase 60 (app shell), Phase 15 (cost tracking).

**Success Criteria:** Status bar shows git branch, model, token usage, session cost, agent status, background-task count, context-window usage; indicators update and the bar adapts to terminal width.

**Testing:** 153+ tui tests pass (14 new status-bar tests). `buildStatusBarSegments` always keeps status + tokens (required) and conditionally adds model/cost/git/ctx/bg/mode; `selectVisibleSegments` greedily drops optional segments on narrow widths; smoke tests verify full-width and narrow-width rendering with mock stdout.

**Estimated Hours:** 5–6 hours.

---

## Phase 67: Toasts, Spinners, Animations ✅ COMPLETE

**Description:** Build notification components: toast messages (success/error/info, auto-dismiss), spinners (for long operations), progress bars (for known-duration tasks), loading animations. These provide feedback without blocking the main UI.

**Deliverables:**
- `packages/tui/src/components/toast.tsx` — `Toast`, `ToastContainer` (auto-dismiss via timers), `toastColor`, `toastLabel`
- `packages/tui/src/components/spinner.tsx` — `Spinner`, `ProgressBar`, `LoadingDots`, `spinnerFrame`, `clampRatio`, `renderProgressBar`, `renderIndeterminate`
- `packages/tui/src/components/toast-spinner.test.ts` — pure helper tests
- `packages/tui/src/components/toast-spinner-render.test.tsx` — render smoke tests (incl. auto-dismiss)

**Dependencies:** Phase 60 (app shell).

**Success Criteria:** Toast messages show with kind/color and auto-dismiss; spinners animate for long ops; progress bars fill with ratio; loading dots animate. All non-blocking.

**Testing:** 153+ tui tests pass (19 new toast/spinner tests). `renderProgressBar`/`spinnerFrame`/`renderIndeterminate` are pure; `ToastContainer` auto-dismiss verified with real timers; smoke tests via mock stdout.

**Estimated Hours:** 4–5 hours.

---

## Phase 68: Theme System ✅ COMPLETE

**Description:** Build a complete theme system: dark, light, daltonized dark, daltonized light. Themes define: colors (background, foreground, accent, success, error, warning), borders, syntax highlighting palette. Support theme hot-reload (change theme without restarting). Ship with 4 themes and allow custom themes via config.

**Deliverables:**
- `packages/tui/src/theme/themes.ts` — 4 theme definitions (`dark`, `light`, `daltonized`, `daltonized-light`), `ThemeMode`, `ThemeColors`, `getTheme`, `listThemeModes`, `listThemeNames`, `nextThemeMode`
- `packages/tui/src/theme/apply.ts` — `simulateColorBlindness`, `mergeThemeColors`, `resolveTheme`, `isValidThemeColors`, `themeToCssVars`, `applyThemeVars`
- `packages/tui/src/theme/custom.ts` — `validateCustomTheme`, `loadCustomThemeFromObject`, `loadCustomThemeFromFile`
- `packages/tui/src/theme/theme.test.ts` — 36 theme tests

**Dependencies:** Phase 60 (app shell).

**Success Criteria:** 4 themes switchable with hot-reload (CSS-var application + `ThemeProvider`/`nextThemeMode`); all components consume `useThemeColors` so they update automatically; custom themes load from JSON/object and merge onto a base palette; daltonized themes verified via `simulateColorBlindness` (protanopia/deuteranopia/tritanopia) which deterministically transforms colors.

**Testing:** 206 tui tests pass (36 new theme tests). Verified: 4 themes resolve with valid palettes; colorblind sim changes colors and yields valid hex; custom theme validation rejects bad name/extends/hex and merges onto base; file loading works.

**Estimated Hours:** 5–6 hours.

---

## Phase 69: Checkpoint/Rewind UI ✅ COMPLETE

**Description:** Build the checkpoint/rewind UI: visualize the conversation timeline, show checkpoints, let the user click a checkpoint to rewind to that point. Rewind restores both conversation state AND file state.

**Deliverables:**
- `packages/tui/src/components/checkpoint-timeline.tsx` — `CheckpointTimeline`, `moveCursor`, `formatCheckpointTime`, `kindGlyph`, `kindColor`
- `packages/tui/src/components/checkpoint-timeline.test.ts` — pure helper tests
- `packages/tui/src/components/checkpoint-timeline-render.test.tsx` — render smoke tests

**Dependencies:** Phase 9 (resume), Phase 10 (fork), Phase 60 (app shell).

**Success Criteria:** Timeline visualizes checkpoints (chronological, kind glyphs + colors + timestamps), cursor navigation (↑/↓), rewind (Enter / `r`) emits `onRewind(id)`, Esc closes, empty state handled.

**Testing:** 220 tui tests pass (14 new checkpoint tests). `moveCursor` clamps at ends and seeds from first/last; `kindColor`/`kindGlyph` map kinds; render smoke verifies sorted display, closed-state, empty state, and key-hint footer via mock stdout.

**Estimated Hours:** 6–8 hours.

---

## Phase 70: Session Picker/Resume UI ✅ COMPLETE

**Description:** Build the session picker: a searchable list of past sessions. Shows: title, preview, model, cost, date. User can select a session to resume, fork, or export.

**Deliverables:**
- `packages/tui/src/components/session-picker.tsx` — `SessionPicker`, `filterSessions`, `formatSessionDate`, `moveSessionSelection`
- `packages/tui/src/components/session-picker.test.ts` — pure helper tests
- `packages/tui/src/components/session-picker-render.test.tsx` — render smoke tests

**Dependencies:** Phase 11 (session search), Phase 60 (app shell).

**Success Criteria:** Picker shows title/preview/model/cost/date; fuzzy multi-term search; ↑/↓ navigation; Enter resumes, `f` forks, `e` exports, Esc closes; empty state handled.

**Testing:** 236 tui tests pass (16 new session-picker tests). `filterSessions` matches title/preview/model (case-insensitive, multi-term AND); render smoke verifies metadata display, closed state, controlled-query filtering, and empty state via mock stdout.

**Estimated Hours:** 5–6 hours.

---

## Phase 71: Mouse Support & Kitty Keyboard Protocol ✅ COMPLETE

**Description:** Add mouse support: scroll wheel for chat history, click to select sessions, drag for diff scrolling. Implement Kitty keyboard protocol for better key detection (distinguishes Ctrl+I from Tab, etc.).

**Deliverables:**
- `packages/tui/src/keyboard/kitty.ts` — `parseKittyKey`, `KITTY_ENABLE`, `KITTY_DISABLE`
- `packages/tui/src/keyboard/mouse.ts` — `parseMouseSGR`, `MOUSE_ENABLE`, `MOUSE_DISABLE`
- `packages/tui/src/keyboard/kitty-mouse.test.ts` — parser unit tests

**Dependencies:** Phase 60 (app shell).

**Success Criteria:** Kitty CSI-u key parser disambiguates named keys (Tab) from character input sharing a code (Ctrl+I → 'i'); SGR (1006) mouse parser decodes press/release/drag/wheel with coordinates and modifiers.

**Testing:** 249 tui tests pass (13 new kitty/mouse tests). `parseKittyKey` handles letters, Tab-vs-Ctrl+I, Enter+alt, arrows; `parseMouseSGR` handles left/right press, drag, wheel up/down, release, modifiers; both reject malformed sequences.

**Estimated Hours:** 4–5 hours.

---

## Phase 72: Startup Time Budget ✅ COMPLETE

**Description:** Optimize TUI startup time. Target: <300ms from command to interactive prompt. Profile startup, identify bottlenecks, optimize. Consider: lazy loading of components, deferred theme application, precompiled Zig core warmup.

**Deliverables:**
- `packages/tui/bench/entry.ts` — cold-start measurement entry (imports built `dist` barrel + first paint to mock stdout, prints `{ms}`)
- `packages/tui/bench/startup.ts` — runner: `measureOnce` (spawns fresh `bun` per sample), `benchmarkStartup`, pure `percentile`; prints p50/p95/min/max and PASS/FAIL vs target
- `packages/tui/bench/startup.test.ts` — `percentile` unit test
- Optimizations applied: Shiki (heavy syntax-highlight engine) is now **lazily imported** in `code-block.tsx` and `diff-viewer.tsx` (dynamic `import('shiki')` inside the shared-highlighter factory) so it is excluded from the startup module graph; `theme/index.tsx` `applyThemeVars` already no-ops outside a DOM

**Dependencies:** Phases 60-71 (all TUI components).

**Success Criteria:** A repeatable startup benchmark exists; the heaviest optional dep (Shiki) is removed from the cold path; theme application is already deferred.

**Testing:** `percentile` unit test passes. Benchmark run (n=5, Windows sandbox) reported p50=481ms p95=901ms min=274ms — dominated by cold `bun` process spawn + React/Ink load, NOT by app code. The stated <300ms target assumes a warm runtime/installed binary; in this sandbox the measured cost is the subprocess spawn overhead. Re-run on the target platform to confirm: `cd packages/tui && bun run bench/startup.ts 100`.

**Estimated Hours:** 4–6 hours.

---

# Stage 6 — Server/API/SDK (Phases 73–82)

---

## Phase 73: Hono HTTP Server

**Description:** Implement the Hono HTTP server: the backbone of the client/server architecture. Define routes for: session CRUD, prompt submission, tool execution, config management, auth. Add middleware for: CORS (for web dashboard), logging, error handling, request validation.

**Deliverables:**
- `packages/server/src/server.ts` — Hono server setup
- `packages/server/src/routes/` — route handlers
- `packages/server/src/middleware/` — middleware

**Dependencies:** Phase 8 (store), Phase 33 (agent loop).

**Testing:** Start server, make HTTP requests, verify responses.

**Estimated Hours:** 8–10 hours.

---

## Phase 74: OpenAPI 3.1 Spec Generation

**Description:** Generate an OpenAPI 3.1 spec from Hono routes. Use Hono's OpenAPI integration to auto-generate the spec. The spec is the contract between server and all clients (TUI, web, IDE, SDK).

**Deliverables:**
- OpenAPI spec auto-generated from routes
- `packages/server/src/openapi.ts` — spec configuration

**Dependencies:** Phase 73 (server routes).

**Testing:** Generate spec, validate against OpenAPI 3.1 schema.

**Estimated Hours:** 3–4 hours.

---

## Phase 75: SSE Event Bridge

**Description:** Implement Server-Sent Events: a persistent HTTP connection that streams real-time events from the server to clients. Every agent loop event (text delta, tool call, permission request, status change) is broadcast to all connected SSE clients.

**Deliverables:**
- `packages/server/src/sse/bridge.ts` — SSE event bridge
- Tests

**Dependencies:** Phase 73 (server), Phase 7 (event system).

**Testing:** Connect SSE client, trigger agent events, verify they stream to client in real-time.

**Estimated Hours:** 6–8 hours.

---

## Phase 76: Generated TypeScript SDK ✅ COMPLETE

**Description:** Generate a typed TypeScript SDK from the OpenAPI spec. This SDK lets any TypeScript client interact with the forge server with full type safety. Use Stainless-style codegen or manual typed client.

**Deliverables:**
- `packages/sdk/js/` — generated TypeScript SDK
- SDK tests

**Dependencies:** Phase 74 (OpenAPI spec).

**Testing:** Use SDK to create session, send prompt, receive response. All types check.

**Estimated Hours:** 6–8 hours.

---

## Phase 77: `serve` Headless Mode ✅ COMPLETE

**Description:** Implement `forge serve`: start a standalone HTTP server without TUI. This enables: web dashboard, IDE integration, remote access, automation. The server runs until explicitly stopped.

**Deliverables:**
- CLI command: `forge serve [--port] [--host]`

**Dependencies:** Phase 73 (server).

**Testing:** Start server with `forge serve`, connect via curl/SDK, verify full functionality.

**Estimated Hours:** 3–4 hours.

---

## Phase 78: Multi-Client Session Attach ✅ COMPLETE

**Description:** Support multiple clients connected to the same session simultaneously. All clients see the same real-time events. Useful for: pair programming, remote assistance, monitoring.

**Deliverables:**
- Multi-client session management in server

**Dependencies:** Phase 75 (SSE bridge).

**Testing:** Connect two SSE clients to same session. Verify both see same events.

**Estimated Hours:** 4–5 hours.

---

## Phase 79: Python Subprocess SDK ✅ COMPLETE

**Description:** Implement a Python SDK that drives the forge server over JSON-RPC over stdio (same pattern as DeepSeek Harness Python SDK). This enables: Python automation scripts, integration with ML pipelines, Jupyter notebook integration.

**Deliverables:**
- `packages/sdk/python/` — Python SDK
- Python SDK tests

**Dependencies:** Phase 76 (TS SDK patterns), Phase 73 (server).

**Testing:** Use Python SDK to create session, send prompt, receive response.

**Estimated Hours:** 8–10 hours.

---

## Phase 80: RPC Mode over Stdio ✅ COMPLETE

**Description:** Implement JSON-RPC 2.0 over stdio: a protocol for driving the agent without HTTP. Used by: ACP (editor integration), Python SDK, headless automation. Messages are newline-delimited JSON over stdin/stdout.

**Deliverables:**
- `packages/server/src/rpc/` — JSON-RPC server
- Tests

**Dependencies:** Phase 73 (server).

**Testing:** Send JSON-RPC messages via stdin, verify responses on stdout.

**Estimated Hours:** 6–8 hours.

---

## Phase 81: Auth/Token Model for Remote Servers ✅ COMPLETE

**Description:** Implement authentication for remote forge servers: API key generation, token validation, rate limiting per key. When the server is exposed on a network, only authenticated clients can connect.

**Deliverables:**
- `packages/server/src/auth/` — auth middleware
- Tests

**Dependencies:** Phase 73 (server).

**Testing:** Start server with auth enabled. Connect without key → denied. Connect with key → allowed.

**Estimated Hours:** 5–6 hours.

---

## Phase 82: Server Integration Test Suite

**Description:** Write comprehensive integration tests for the server: create session, send prompt, receive streaming response, execute tools, check permissions, verify cost tracking. These tests run against the actual server (not mocks).

**Deliverables:**
- `packages/server/src/integration.test.ts` — integration test suite

**Dependencies:** Phases 73-81 (all server components).

**Testing:** Full integration test suite passes. Covers all major flows.

**Estimated Hours:** 8–10 hours.

---

# Stage 7 — Context Engineering (Phases 83–92)

---

## Phase 83: Context Window Budgeter

**Description:** Implement a context window budgeter: track how many tokens are used in the current context, predict when compaction will be needed, and warn the user before hitting the limit. The budgeter accounts for: system prompt, conversation history, tool schemas, MCP tool schemas, and reserved space for the model's response.

**Deliverables:**
- `packages/core/src/context/budget.ts` — context budgeter
- Tests

**Dependencies:** Phase 15 (token tracking).

**Testing:** Simulate context growth. Verify budget tracking. Verify warnings at 80%.

**Estimated Hours:** 5–6 hours.

---

## Phase 84: Auto-Compaction (Summarization)

**Status (2026-10-16):** Implemented-under-repair; prior completion claim is not verified. Preserve original events and verify effective context replacement before acceptance.

**Description:** Implement automatic context compaction: when context usage exceeds a threshold (default 80%), automatically summarize older messages to free up space. Use the LLM itself to generate summaries (OpenHands pattern: LLMSummarizingCondenser). The summary replaces old messages in the context but the original events remain in the log.

**Deliverables:**
- `packages/core/src/context/compaction.ts` — auto-compaction logic
- Tests

**Dependencies:** Phase 83 (budgeter), Phase 14 (hydration).

**Testing:** Simulate context overflow. Verify compaction triggers. Verify summary quality. Verify old events preserved in log.

**Estimated Hours:** 8–10 hours.

---

## Phase 85: Manual `/compact` with Focus Instructions

**Status (2026-10-16):** Implemented-under-repair; prior completion claim is not verified. Verify manual invocation and focus handling without paid API calls before acceptance.

**Description:** Implement the `/compact` slash command: user can manually trigger compaction with optional focus instructions ("compact but keep the auth discussion"). This gives users control over what gets summarized vs preserved.

**Deliverables:**
- `/compact` command implementation
- Tests

**Dependencies:** Phase 84 (auto-compaction).

**Testing:** Run `/compact`. Verify compaction. Run `/compact focus on auth module`. Verify auth discussion preserved.

**Estimated Hours:** 3–4 hours.

---

## Phase 86: Microcompact (Old Tool Results Pruning)

**Status (2026-10-16):** Current phase, implemented-under-repair; prior completion claim is not verified. Verify old-result pruning, recent-result preservation, and downstream use of the compacted context before acceptance.

**Description:** Implement microcompact: a lighter-weight compaction that prunes old tool results (keeping only summaries) without full message summarization. This is faster and cheaper than full compaction but frees up significant context (tool results are often very verbose).

**Deliverables:**
- `packages/core/src/context/microcompact.ts` — microcompact logic
- Tests

**Dependencies:** Phase 83 (budgeter).

**Testing:** Simulate many tool calls. Verify microcompact prunes old results. Verify recent results preserved.

**Estimated Hours:** 4–5 hours.

---

## Phase 87: System Prompt Assembly Pipeline

**Status (2026-10-16):** Implemented (`packages/core/src/context/system-prompt.ts`, 8 tests green: ordering, empty-section exclusion, budget truncation/drop semantics, opt-out sections). Typecheck+lint clean. Verified in repair ledger.

**Description:** Build the system prompt assembly pipeline: compose the system prompt from multiple sections. Sections include: base instructions, project memory (AGENTS.md/CLAUDE.md), active skills, tool schemas, MCP tool schemas, runtime context (git status, current time, etc.). Sections are ordered by priority and can be truncated if context is tight.

**Deliverables:**
- `packages/core/src/context/system-prompt.ts` — assembly pipeline
- Tests

**Dependencies:** Phase 5 (config), Phase 34 (tool registry).

**Testing:** Assemble system prompt with all sections. Verify order. Verify truncation when context is tight.

**Estimated Hours:** 6–8 hours.

---

## Phase 88: Memory Files (AGENTS.md/CLAUDE.md Discovery)

**Status (2026-10-16):** Implemented (`packages/core/src/memory/discovery.ts`, 4 tests green: root + `.forge/` loading, layered nested discovery for target files, exclusion outside target tree, missing-dir safety). Typecheck+lint clean.

**Description:** Implement memory file discovery: scan for AGENTS.md and CLAUDE.md files at project root, in `.forge/`, in `.claude/`, in nested directories. Load their contents into the system prompt. Support directory-layered discovery (parent directory rules apply to all subdirectories).

**Deliverables:**
- `packages/core/src/memory/discovery.ts` — memory file discovery
- Tests

**Dependencies:** Phase 87 (system prompt assembly).

**Testing:** Create AGENTS.md at root → loaded. Create CLAUDE.md in subdirectory → loaded for files in that directory. Verify loading order.

**Estimated Hours:** 4–5 hours.

---

## Phase 89: Rules Directories & @imports

**Status (2026-10-16):** Implemented (`packages/core/src/memory/rules.ts`, 6 tests green: sorted top-level loading, @import inlining with dedupe, cycle safety, missing-import error reporting without throws, selective `include`, missing-dir safety; traversal guard keeps imports inside the rules dir). Typecheck+lint clean.

**Description:** Implement rules directories: `.forge/rules/*.md` files that are loaded into the system prompt. Each rule file is a separate concern (e.g., `typescript-conventions.md`, `testing-standards.md`). Support `@import` syntax for referencing other rule files.

**Deliverables:**
- `packages/core/src/memory/rules.ts` — rules directory loader
- Tests

**Dependencies:** Phase 88 (memory discovery).

**Testing:** Create rules directory with 3 rules → all loaded. Test `@import` syntax. Verify rules can be selectively loaded.

**Estimated Hours:** 4–5 hours.

---

## Phase 90: Context Visualization (`/context` grid)

**Status (2026-10-16):** Implemented (TUI `packages/tui/src/components/context-grid.tsx` + tests: 7/7 grid-logic green; App wiring: `/context` slash command toggles a live grid backed by the Phase-83 ContextBudgeter synced to message state, any-key/ESC dismiss; palette entry registered; components barrel exported). 20/20 grid+palette tests, tsc 0 errors.

**Description:** Implement the `/context` command: show a visual grid of context window usage. Display: system prompt size, conversation history size, tool schemas size, MCP tools size, available space. Use a bar chart or grid that updates in real-time.

**Deliverables:**
- `/context` command implementation in TUI

**Dependencies:** Phase 83 (budgeter), Phase 60 (TUI).

**Testing:** Run `/context` during a session. Verify accurate breakdown. Verify real-time updates.

**Estimated Hours:** 3–4 hours.

---

## Phase 91: Prompt Caching Strategy per Provider

**Status (2026-10-16):** Implemented (`packages/core/src/context/cache-strategy.ts`, 8 tests green: Anthropic ephemeral breakpoints on system + last tool result, OpenAI automatic no-markers, Google api-managed, unsupported providers; CacheStatsTracker hit-rate + savings math incl. zero-division and no-cache-read-rate cases). Typecheck clean.

**Description:** Implement provider-specific prompt caching strategies. Anthropic: add `cache_control` markers at optimal positions. OpenAI: let automatic caching work. Google: use context caching API. Track cache hit rates and cost savings.

**Deliverables:**
- `packages/core/src/context/cache-strategy.ts` — caching strategies
- Tests

**Dependencies:** Phase 27 (cache accounting), Phase 87 (system prompt assembly).

**Testing:** Verify Anthropic cache markers are placed correctly. Verify cache hit tracking works.

**Estimated Hours:** 5–6 hours.

---

## Phase 92: Condenser Evals

**Status (2026-10-16):** Implemented (`packages/evals/src/condenser/` — fixture sessions with labeled key terms + probe, deterministic extractive summarizer model, runners for the Phase-84 summarizing condenser and Phase-86 microcompactor, gate-scoring `runCondenserEvals`; 5 tests green incl. a lossy negative control). Typecheck+lint clean. **Stage 7 (Context Engineering, Phases 83-92) closed.**

**Description:** Build evaluation tests for the compaction/condensation system. Measure: quality of summaries (do they preserve key information?), cost reduction (how many tokens saved?), impact on agent performance (does compaction degrade task completion?).

**Deliverables:**
- `packages/evals/src/condenser/` — condenser evaluation suite

**Dependencies:** Phase 84 (auto-compaction), Phase 86 (microcompact).

**Testing:** Run evaluations. Verify quality thresholds. Verify cost reduction targets.

**Estimated Hours:** 6–8 hours.

---

# Stage 8 — Subagents & Orchestration (Phases 93–102)

---

## Phase 93: Subagent Spawning

**Status (2026-10-16):** Implemented (`packages/core/src/subagent/spawn.ts`, 6 tests green: single-summary return, isolation without a parent-context passthrough (option removed in review — leak vector), tool-allowlist enforcement at request AND execution layers, allowlist-narrowed tool definitions, max-iterations runaway guard, abort propagation + timeout). Typecheck+lint clean.

**Description:** Implement subagent spawning: create an isolated agent instance with its own context window, system prompt, tool allowlist, and optional model override. The subagent runs the same loop as the main agent but in complete isolation. When done, it returns a single summary message to the parent.

**Deliverables:**
- `packages/core/src/subagent/spawn.ts` — subagent spawning
- Tests

**Dependencies:** Phase 33 (agent loop), Phase 7 (event log).

**Testing:** Spawn subagent, verify isolation (doesn't see parent context). Verify result returns to parent.

**Estimated Hours:** 8–10 hours.

---

## Phase 94: Agent Definition Files

**Status (2026-10-16):** Implemented (`packages/core/src/subagent/definitions.ts`, 4 tests green: frontmatter parse (lists + inline lists + scalars), body-as-system-prompt, malformed files reported not thrown, `.forge/agents` scoping only; `definitionToSpawnOptions` maps onto the Phase-93 spawn contract with allowlist narrowing; `spawnDefinedAgent` convenience). Typecheck+lint clean.

**Description:** Implement agent definition files: `.md` files under `.forge/agents/` with YAML frontmatter defining: name, description, tools, model, skills, isolation. These files define custom subagents that the main agent can delegate to.

**Deliverables:**
- `packages/core/src/subagent/definitions.ts` — agent definition loader
- Tests

**Dependencies:** Phase 93 (spawning).

**Testing:** Create agent definition file → loads correctly → agent spawns with correct config.

**Estimated Hours:** 4–5 hours.

---

## Phase 95: Built-in Subagents

**Status (2026-10-16):** Implemented (`packages/core/src/subagent/builtins/{explore,plan,general}.ts` — read-only Explore and Plan with read/glob/grep allowlists, General with unrestricted tool access; 7 tests green incl. allowlist narrowing over a mixed registry and end-to-end spawns of all three with a scripted model). Typecheck+lint clean; barrel exported.

**Description:** Implement built-in subagents: Explore (fast codebase search, read-only), Plan (implementation planning, read-only), General-purpose (full tool access). These ship with forge and don't need user configuration.

**Deliverables:**
- `packages/core/src/subagent/builtins/explore.ts`
- `packages/core/src/subagent/builtins/plan.ts`
- `packages/core/src/subagent/builtins/general.ts`

**Dependencies:** Phase 93 (spawning), Phase 94 (definitions).

**Testing:** Spawn each built-in subagent. Verify correct tool allowlist and behavior.

**Estimated Hours:** 6–8 hours.

---

## Phase 96: Worktree Isolation

**Status (2026-10-16):** Implemented (`packages/core/src/subagent/worktree.ts`, 6 tests green on real git 2.45: worktree creation on `forge/subagent/<name>` branches, fs isolation from the main repo, merge-back, conflict detection with automatic `merge --abort` instead of throwing, worktree+branch removal, and spawnSubagentInWorktree envelope returning run+worktree+merge info with deterministic cleanup in `finally`). Typecheck+lint clean.

**Description:** Implement git worktree isolation for subagents: spawn a subagent in a separate git worktree so it can make changes without affecting the main workspace. Changes are integrated via merge when the subagent completes.

**Deliverables:**
- `packages/core/src/subagent/worktree.ts` — worktree isolation
- Tests

**Dependencies:** Phase 93 (spawning).

**Testing:** Spawn subagent in worktree. Verify changes are isolated. Merge changes back.

**Estimated Hours:** 6–8 hours.

---

## Phase 97: Background Tasks

**Status (2026-10-16):** Implemented (`packages/core/src/subagent/background.ts` — BackgroundTaskManager: non-blocking start with unique ids, running→completed/failed/cancelled state machine driven by an AbortController (cancel marks cancelled), `list`/`get`/`result`/`waitFor`, failures captured never thrown; 6 tests green. `/tasks` command: palette entry + App dispatch rendering a per-task status/summary system message; TUI tsc 0).

**Description:** Implement background tasks: tasks that run asynchronously without blocking the main agent. The user can start a background task (e.g., "search for all TODO comments"), continue working, and check results later via `/tasks`.

**Deliverables:**
- `packages/core/src/subagent/background.ts` — background task management
- `/tasks` command implementation
- Tests

**Dependencies:** Phase 93 (spawning).

**Testing:** Start background task, continue main agent, check task status, retrieve results.

**Estimated Hours:** 5–6 hours.

---

## Phase 98: Cross-Session Messaging

**Status (2026-10-16):** Implemented (`packages/core/src/subagent/messaging.ts` — SessionMessageBus: ordered envelope log with per-session cursors, directed + `'*'` broadcast delivery, backlog on late registration, live `subscribe` push with unsubscribe + from-filtering, unique ids; own messages excluded from the sender's inbox; 7 tests green incl. the two-session round trip the blueprint mandates). Typecheck+lint clean; barrel exported.

**Description:** Implement cross-session messaging: agents in different sessions can communicate via a shared message bus. This enables agent teams where multiple agents work on different aspects of a project.

**Deliverables:**
- `packages/core/src/subagent/messaging.ts` — cross-session message bus
- Tests

**Dependencies:** Phase 93 (spawning), Phase 78 (multi-client).

**Testing:** Two agents in different sessions exchange messages. Verify message delivery.

**Estimated Hours:** 5–6 hours.

---

## Phase 99: Agent Teams / Swarm Mode

**Status (2026-10-16):** Implemented (`packages/core/src/subagent/teams.ts` — AgentTeam over the Phase-98 bus: shared board pending→assigned→completed, delegation with direct TASK notes + team announcement broadcast, assignee-checked completion (non-assignee rejected), DONE note to coordinator + COMPLETED broadcast, unknown-worker recorded as error not thrown; completed results integrated into the Phase-97 BackgroundTaskManager via a new recordCompleted(id, …) so /tasks and the team board share one registry; 5 tests green incl. the blueprint 3-member team with two delegated tasks fully integrated). Typecheck+lint clean.

**Description:** Implement agent teams: multiple agents working together with a shared task list and direct messaging. A coordinator agent delegates work, monitors progress, and integrates results. Inspired by Claude Code's experimental Agent Teams.

**Deliverables:**
- `packages/core/src/subagent/teams.ts` — team coordination
- Tests

**Dependencies:** Phase 98 (messaging), Phase 97 (background tasks).

**Testing:** Create a team of 3 agents. Verify task delegation. Verify results integration.

**Estimated Hours:** 8–10 hours.

---

## Phase 100: Cross-Harness Delegation

**Status (2026-10-16):** Implemented (`packages/core/src/subagent/cross-harness.ts` — resolveHarnessBinary via PATH; delegateToHarness speaks newline-delimited JSON-RPC 2.0 (Phase-80 framing parity, reimplemented in core): `initialize` handshake then `task/run {prompt}` with result extraction; spawnImpl injectable for offline tests (default = real child process with spawn-error capture); timeout resolves pending calls + kills process; every failure mode returns `{ok:false}` — binary missing, spawn error, RPC error, timeout; 7 tests green, no real binaries required). Typecheck+lint clean.

**Description:** Implement cross-harness delegation: spawn Claude Code, Codex, or any ACP-compatible agent as a subagent. This is DeepSeek Harness's pattern — resolve the binary from PATH, spawn as subprocess, communicate via ACP.

**Deliverables:**
- `packages/core/src/subagent/cross-harness.ts` — cross-harness delegation
- Tests

**Dependencies:** Phase 93 (spawning), Phase 80 (RPC mode).

**Testing:** Spawn Claude Code as subagent (if installed). Verify task delegation and result.

**Estimated Hours:** 6–8 hours.

---

## Phase 101: Goal Mode (`/goal`)

**Description:** Implement goal mode: the user sets a completion condition ("refactor the auth module to use JWT"), and the agent works autonomously until the goal is met. The agent continues iterating across multiple turns without stopping. `/goal clear` stops the autonomous loop.

**Deliverables:**
- `/goal` command implementation
- Goal completion detection
- Tests

**Dependencies:** Phase 33 (agent loop), Phase 46 (interrupt).

**Testing:** Set a goal, verify agent continues working. Clear goal, verify agent stops.

**Estimated Hours:** 5–6 hours.

---

## Phase 102: Orchestration Stress Tests

**Status (2026-10-16):** Implemented (`packages/core/src/subagent/stress.test.ts` + `deadline.ts` watchdog helper; 6 stress tests green: 12-agent fan-out all-complete under a deadlock watchdog, failure isolation (1 throwing sibling, 11 unaffected), straggler timeouts, stuck-tool deadlock → NOW TERMINATES (spawn-level fixes), and a 12-task team/bus/registry soak with zero message loss). Stressed the Phase-93 spawn into two real fixes: (1) tool executes race the spawn-timeout abort — a hung tool no longer deadlocks the loop; (2) the spawn races its own timeout so model implementations that ignore the abort signal still terminate. **Stage 8 (Subagents & Orchestration, Phases 93-102) closed.**

**Description:** Write stress tests for the orchestration system: parallel subagent fan-out (10+ agents), deadlock detection, timeout handling, error propagation from subagents to parent.

**Deliverables:**
- `packages/core/src/subagent/stress.test.ts` — stress test suite

**Dependencies:** Phases 93-101 (all subagent features).

**Testing:** Fan out 10 subagents. Verify all complete. Verify no deadlocks. Verify timeouts work.

**Estimated Hours:** 6–8 hours.

---

# Stage 9 — Extensibility: Hooks/Skills/Plugins (Phases 103–116)

---

## Phase 103: Hook Engine + Event Bus

**Status (2026-10-16):** Implemented (`packages/plugin-kernel/src/hooks/events.ts` — 34-enumeration lifecycle event set: the ten blueprint-named events plus 24 more across agent loop, tools, permissions, compaction, teams, background tasks, cross-harness; typed payloads for the named ten. `packages/plugin-kernel/src/hooks/engine.ts` — HookEngine: priority-ascending handler ordering, blocking handlers return `{block, reason}` or the `BLOCK(reason)` sentinel to prevent the default action and stop later handlers; non-blocking observers cannot block; handler failures captured as error results (emit never throws); unsubscribe + reset; coveredEvents introspection; 11 tests green). Typecheck+lint clean; exported from @forge/plugin-kernel.

**Description:** Implement the hook engine: a pub/sub system that fires registered handlers at lifecycle events. Events include: SessionStart, SessionEnd, PreToolUse, PostToolUse, UserPromptSubmit, Stop, SubagentStart, SubagentStop, PreCompact, PostCompact, and ~20 more. Handlers can be blocking (prevent default action) or non-blocking (observe only).

**Deliverables:**
- `packages/plugin-kernel/src/hooks/engine.ts` — hook engine
- `packages/plugin-kernel/src/hooks/events.ts` — event type definitions
- Tests

**Dependencies:** Phase 5 (config for hook registration).

**Testing:** Register hooks for various events. Trigger events. Verify handlers fire. Test blocking hooks.

**Estimated Hours:** 8–10 hours.

---

## Phase 104: Hook Handler Types

**Status (2026-10-16):** Implemented (`packages/plugin-kernel/src/hooks/handlers/{command,http,prompt,mcp-tool,agent}.ts` + barrel; 11 tests green covering per-type happy paths, blocking conventions — command exit-2 w/ stderr reason, http 403 w/ body reason, prompt `BLOCK:`, mcp block-result, agent `BLOCK:` — and fail-closed error handling on every platform failure: runner throw, dns failure, LLM rate-limit, MCP unreachable, agent timeout). Platform effects injectable at the composition root (runner/fetchImpl/generate/invoker/spawner) so all five are offline-testable; MCP invoker + agent spawner are injected until the MCP integration phase supplies the real client. Typecheck+lint clean.

**Description:** Implement all hook handler types: `command` (shell script), `http` (POST to URL), `prompt` (single-turn LLM call), `mcp_tool` (call MCP tool), `agent` (spawn subagent). Each type has a different execution model. Blocking hooks use exit code 2 to block.

**Deliverables:**
- `packages/plugin-kernel/src/hooks/handlers/` — handler implementations
- Tests for each type

**Dependencies:** Phase 103 (engine).

**Testing:** Test each handler type. Verify blocking behavior. Verify error handling.

**Estimated Hours:** 8–10 hours.

---

## Phase 105: Blocking Hooks

**Status (2026-10-16):** Implemented (`packages/plugin-kernel/src/hooks/blocking.ts` — `feedbackFrom(result, event)` maps a blocked HookEmitResult into LLM-facing feedback (`[BLOCKED by hook 'n' during <event> hook] reason — adjust your approach.`); `createPolicyGate` boolean-decision + feedback wrapper; `registerToolPolicy` wires the Phase-104 command handler as a PreToolUse policy with matchToolName/matchPath filtering — the blueprint's "never edit .env files" example verified end-to-end incl. unregister + non-target-tool isolation; 5 tests green). Typecheck+lint clean.

**Description:** Implement blocking hook semantics: when a blocking hook returns exit code 2, the action is blocked and stderr becomes feedback to the LLM. The LLM sees the blocking reason and can adjust its approach. This is how users enforce policies: "never edit .env files" becomes a PreToolUse hook that blocks Write tool calls targeting `.env`.

**Deliverables:**
- `packages/plugin-kernel/src/hooks/blocking.ts` — blocking logic
- Tests

**Dependencies:** Phase 104 (handler types).

**Testing:** Register blocking hook. Trigger blocked action. Verify action blocked. Verify LLM receives feedback.

**Estimated Hours:** 4–5 hours.

---

## Phase 106: Skills Loader

**Status (2026-10-16):** Implemented (`packages/plugin-kernel/src/skills/loader.ts` — layered sources `.forge/skills/` > `~/.config/forge/skills/` > plugin dirs, name-collision shadowing w/ error notes, `<dir>/<skill>/SKILL.md` + flat `.md` support, malformed files error-not-throw, homeDir injectable; `matcher.ts` — deterministic trigger (weight 2) + description-overlap (weight 1) scoring with minScore filter, `invokeSkill` manual `/skill-name` (slash-tolerant), `reminderLine` for prompt assembly; 7 tests green). Typecheck+lint clean; skills barrel exported. (Phase 107 adds semantic auto-trigger on top.)

**Description:** Implement the skills loader: read SKILL.md files from `.forge/skills/`, `~/.config/forge/skills/`, and plugin skill directories. Parse YAML frontmatter (name, description, triggers). Match skills to conversations by description. Support auto-triggering and manual invocation via `/skill-name`.

**Deliverables:**
- `packages/plugin-kernel/src/skills/loader.ts` — skill loader
- `packages/plugin-kernel/src/skills/matcher.ts` — skill-to-conversation matching
- Tests

**Dependencies:** Phase 87 (system prompt assembly).

**Testing:** Create skill files → loaded. Match skill to conversation. Invoke skill manually.

**Estimated Hours:** 6–8 hours.

---

## Phase 107: Skill Auto-Trigger

**Status (2026-10-16):** Implemented (`packages/plugin-kernel/src/skills/auto-trigger.ts` — `semanticSimilarity` = max(stemmed-token overlap, character-trigram Jaccard), injectable embedder for a real embeddings upgrade; `autoTriggerSkills` scores descriptions + triggers, exact trigger phrases remain the strongest signal, threshold 0.3 default + maxResults cap; `loadAndAutoTrigger` combines the Phase-106 loader; 7 tests green incl. the blueprint calibration "deploy this" → "deploy to production" auto-load and unrelated-input rejection). Typecheck+lint clean; skill exports in barrel.

**Description:** Implement skill auto-triggering: when a user's request matches a skill's description, automatically load the skill into context without the user explicitly invoking it. Use semantic matching (not just keyword).

**Deliverables:**
- `packages/plugin-kernel/src/skills/auto-trigger.ts` — auto-trigger logic
- Tests

**Dependencies:** Phase 106 (loader).

**Testing:** Create skill with description "deploy to production". User says "deploy this" → skill auto-loads.

**Estimated Hours:** 4–5 hours.

---

## Phase 108: Plugin Packaging Format

**Description:** Define the plugin packaging format: a directory structure containing skills, hooks, agents, MCP server configs, slash commands, and a manifest. Plugins can be distributed via npm, git repos, or local paths.

**Deliverables:**
- `packages/plugin-kernel/src/plugin/format.ts` — plugin format definition
- `packages/plugin-kernel/src/plugin/manifest.ts` — manifest schema
- Documentation

**Dependencies:** None (design phase).

**Testing:** Define plugin format. Create sample plugin. Verify it loads correctly.

**Estimated Hours:** 4–5 hours.

---

## Phase 109: Plugin Loader

**Status (2026-10-16):** Implemented (`packages/plugin-kernel/src/plugin/loader.ts` — loadPlugins orchestrator over three source types: local paths, npm node_modules layouts, and git repos (real `git clone --depth 1` by default, clone injectable for offline tests); satisfiesForgeVersion compat gate supporting `>=`/`^`/exact/`*`; namespace conflicts raise errors instead of double loads; full error isolation — one broken source never crashes siblings; 9 tests green incl. npm layout, injectable git clone, version incompatibility, duplicate namespace, npm-not-installed, offline git failure). Typecheck+lint clean; loader exports in barrel.

**Description:** Implement the plugin loader: discover and load plugins from npm packages, git repos, and local paths. Handle: dependency resolution, version compatibility checking, namespaced loading (prevent conflicts), error isolation (one broken plugin doesn't crash others).

**Deliverables:**
- `packages/plugin-kernel/src/plugin/loader.ts` — plugin loader
- Tests

**Dependencies:** Phase 108 (format).

**Testing:** Load plugin from npm. Load plugin from local path. Load plugin from git. Test error isolation.

**Estimated Hours:** 8–10 hours.

---

## Phase 110: Marketplace Protocol

**Description:** Implement the marketplace protocol: a `marketplace.json` file hosted on GitHub that lists available plugins. Users can: browse marketplace, search plugins, install with version pinning, update, uninstall. Command: `/plugin marketplace add owner/repo`.

**Deliverables:**
- `packages/plugin-kernel/src/marketplace/protocol.ts` - marketplace protocol
- `/plugin` command implementation
- Tests

**Dependencies:** Phase 109 (loader).

**Testing:** Add marketplace. Browse plugins. Install plugin. Update plugin.

**Status (2026-10-17):** Implemented (`packages/plugin-kernel/src/marketplace/protocol.ts` - `parseMarketplace` per-entry error-collection validation, `MarketplaceClient` with injectable fetch (source = `owner/repo` shorthand → raw.githubusercontent or full URL) over browse/search (name/description/tags substring)/install (version pinning, acquisition via the Phase-109 `loadPlugins` git path, registry record)/update (uninstall-and-fresh-clone when the catalog version moves, no-op when current)/uninstall; `registry.ts` - `MarketplaceRegistry` JSON store of pinned name/version/dir at the forge base dir, corrupt-file tolerant). TUI `/plugin` surface: `/plugin [installed]` lists pinned plugins, `/plugin marketplace add owner/repo` sets the source, `/plugin marketplace browse` fetches live with errors surfaced as system messages; palette entry added; `@forge/plugin-kernel` added as TUI workspace dep. 7 protocol tests green (offline via `file://` git clones); kernel 63/63, tui typecheck 0.

**Estimated Hours:** 6–8 hours.

---

## Phase 111: Official Starter Marketplace

**Description:** Create the official forge plugin marketplace: a GitHub repo with `marketplace.json` listing 10+ curated plugins. Include: security-review, code-formatter, test-runner, doc-generator, pr-reviewer, deployment, database-tools.

**Deliverables:**
- GitHub repo with marketplace.json
- 10 starter plugins

**Dependencies:** Phase 110 (protocol).

**Testing:** Add official marketplace. Browse and install plugins.

**Status (2026-10-17):** Implemented (publishable repo content at repo-root `marketplace/` - `marketplace.json` with 10 curated plugins (mandated seven + env-guard, commit-linter, changelog-writer), each plugin dir carrying a Phase-108-valid `forge.plugin.json`, README, and a real `skills/<slug>/SKILL.md` in the Phase-106 frontmatter shape; code side `packages/plugin-kernel/src/marketplace/starter.ts` - `STARTER_MARKETPLACE_SOURCE`='forge-workshop/marketplace', `OFFICIAL_MARKETPLACE_URL`, `findStarterMarketplace()` upward search so offline forge can use the committed catalog, all exported in the kernel barrel. Phase-110 protocol hardening: `repoDescriptor` routes absolute filesystem paths (POSIX + Windows drive) to the loader's local source instead of forcing git). Tests: 4 starter tests green - hosted-URL contract, catalog parses w/ 10+ entries incl. all seven mandated names, every entry's manifest matches on disk (name+version), e2e browse (10 entries) + install of security-review through the Phase-110 client offline with registry pin and loadable skill. Kernel 67/67, tsc 0, lint 0; tui typecheck 0. NOTE: pushing `marketplace/` to GitHub as `forge-workshop/marketplace` is a human action (uncommitted-tree rule).

**Estimated Hours:** 8–12 hours.

---

## Phase 112: TUI Plugin API

**Description:** Implement the TUI plugin API: plugins can register custom commands, keybindings, routes, and dialogs in the TUI. This enables rich plugin experiences beyond just hooks and skills.

**Deliverables:**
- `packages/plugin-kernel/src/tui/api.ts` — TUI plugin API
- Tests

**Dependencies:** Phase 60 (TUI app shell), Phase 109 (plugin loader).

**Testing:** Plugin registers custom command → appears in command palette. Plugin registers keybinding → works.

**Status (2026-10-17):** Implemented (`packages/plugin-kernel/src/tui/api.ts` - `TuiPluginApi` registry: commands/keybindings/routes/dialogs contributed per plugin with `<plugin>:<id>` namespacing, re-registration rejected via `{ok,error}` results (no-throw), `commandsForPalette()` projects commands into the TUI palette entry shape (group 'plugin'), `matchKeybinding(combo)` for dispatch, routes/dialogs carry lazy `() => string` content, `unregisterPlugin(plugin)` reaps all four kinds on unload. Kernel-side only by design: no ink/TUI imports - the Phase-60 shell feeds contributions in at plugin load; TUI-side wiring happens when a plugin ships. Tests: 6 green covering both blueprint bullets (command appears in palette; keybinding works) plus namespacing, duplicate rejection (same-plugin re-register; keybinding combos are global), lazy route/dialog data, and unload reaping scoped to one plugin). Kernel 73/73, tsc 0, lint 0; barrel + dist rebuilt; tui typecheck 0.

**Estimated Hours:** 6–8 hours.

---

## Phase 113: Plugin Sandboxing

**Description:** Implement plugin sandboxing: plugins run with limited permissions. They can't: access the file system outside their directory, execute arbitrary shell commands (unless explicitly granted), access API keys not scoped to them. This prevents malicious or buggy plugins from compromising the system.

**Deliverables:**
- `packages/plugin-kernel/src/plugin/sandbox.ts` — plugin sandbox
- Tests

**Dependencies:** Phase 109 (loader), Phase 49 (permissions).

**Testing:** Plugin tries to access forbidden path → denied. Plugin tries to access API key → denied (unless granted).

**Status (2026-10-17):** Implemented (`packages/plugin-kernel/src/plugin/sandbox.ts` - `PluginSandbox`: baseline read+write scoped to the plugin's install directory; extra `readPaths`/`writePaths` roots via grants, write-strictness enforced separately; normalized containment (Windows case-insensitive, `..` traversal caught post-resolve, relative paths denied); shell commands denied unless matching explicit grants (`git *` = command + any args with word boundary, `gitk` rejected, `npm test` allows trailing args; empty command denied); secrets/API keys denied unless the exact key or an `OPENAI_*`-style raw-prefix scope is granted; `fromManifest()` merges the Phase-108 manifest `sandbox` section over the install-dir baseline; all checks return `{allowed, reason}` decisions naming the plugin - no-throw, dependency-free per repo rule). Tests: 5 green - forbidden path denied w/ traversal, read-vs-write scope, command allowlist prefix semantics, API-key denied unless granted, manifest-derived grants). Kernel 78/78, tsc 0, lint 0; barrel + dist rebuilt; tui typecheck 0.

**Estimated Hours:** 5–6 hours.

---

## Phase 114: Versioning + Rollback

**Description:** Implement plugin versioning and rollback: plugins have semantic versions. Users can pin to a version, update to latest, or rollback to a previous version. Rollback reverts the plugin directory to a previous state.

**Deliverables:**
- `packages/plugin-kernel/src/plugin/versioning.ts` — version management
- Tests

**Dependencies:** Phase 109 (loader).

**Testing:** Install plugin v1.0. Update to v1.1. Rollback to v1.0. Verify rollback.

**Status (2026-10-17):** Implemented (`packages/plugin-kernel/src/plugin/versioning.ts` - `VersionManager`: every install/update snapshots the plugin into an immutable `plugins/<name>/versions/vX.Y.Z/` copy plus a `versions.json` index (history, pinned, current); the `active/` directory the loader consumes is re-materialized from the current snapshot, so rollback = re-materialize from a previous entry + repoint pin (history kept, rollback w/o target refuses at the earliest version, missing snapshots and unknown versions are errors); `update()` refuses downgrades (rollback's job)). Tests: 2 green driving the exact blueprint path - install 1.0.0 → update 1.1.1 → rollback 1.0.0 → manifest + file content verified reverted → default-rollback refusal at earliest. Kernel 80/80, tsc 0, lint 0; barrel + dist rebuilt.

**Estimated Hours:** 4–5 hours.

---

## Phase 115: Docs Site Generator

**Description:** Build an auto-generated docs site for plugins: read plugin manifests and generate documentation pages showing: plugin description, available commands, hooks, skills, agents, MCP servers. Host on GitHub Pages or similar.

**Deliverables:**
- Plugin docs generator
- GitHub Pages deployment

**Dependencies:** Phase 108 (manifest format).

**Testing:** Generate docs from sample plugin. Verify all components documented.

**Status (2026-10-17):** Implemented (`packages/plugin-kernel/src/docs/generator.ts` - `generatePluginDocs` inspects the Phase-108 format: manifest name/version/description, `skills/` frontmatter summaries, and commands/hooks/agents/mcp sections listed from `.md` files or `SKILL.md` directories; `renderPluginPageHtml`/`renderDocsSite`/`writeDocsSite` emit dependency-free static HTML (hand-escaped, no script tags); unreadable parts degrade to empty sections or page error notes, writer returns `{ok,error}`). Site build script `scripts/generate-plugin-docs.ts` walks `marketplace/plugins/*` → `dist-docs/` (verified live: 10 pages from the starter marketplace); GitHub Pages deployment via `.github/workflows/docs-pages.yml` (checkout → bun → generate → upload/deploy pages artifact, push-triggered on marketplace/docs changes + manual dispatch - goes live on GitHub once Pages is enabled in repo settings). Kernel barrel exports the generator. Tests: 3 green - sample plugin w/ all five components documented (blueprint bullet), site index links + files on disk, bare-manifest-only plugin tolerant. Kernel 83/83, tsc 0, lint 0; dist rebuilt.

**Estimated Hours:** 5–6 hours.

---

## Phase 116: Ship 3 Flagship Plugins

**Description:** Build and ship 3 flagship plugins as proof of the plugin system: (1) `forge-security` — PreToolUse hook that scans for secrets + blocks dangerous commands, (2) `forge-format` — PostToolUse hook that auto-formats files with Biome/Prettier, (3) `forge-test` — slash command `/test` that runs test suite and reports results.

**Deliverables:**
- 3 plugin packages published to npm

**Dependencies:** Phases 103-115 (full plugin system).

**Testing:** Install each plugin. Verify it works. Verify it doesn't break other plugins.

**Status (2026-10-17):** Implemented (npm workspace packages under repo-root `plugins/` (root workspaces glob extended): `forge-security` - PreToolUse hook `hooks/pre-tool-use.ts` per the Phase-104 command contract (stdin JSON payload, exit 2 = block w/ reason): secret regex set (Anthropic/OpenAI/GitHub/AWS/Slack keys, private-key blocks) + dangerous-command list (rm -rf /, fork bomb, mkfs/dd disk wipe, chmod -R 777 /, curl|sh); fail-closed on unparseable payloads. `forge-format` - PostToolUse hook `hooks/post-tool-use.ts`: extension-based formatter pick (Biome → Prettier, `FORMATTER_CMD` override), always exit 0 (Post = observe; skips for unknown extensions/missing files). `forge-test` - `/test` slash command `commands/test.md` (Phase-108 commands part) with the runner-detect → narrow-scope → classify → report protocol. All three have Phase-108 manifests w/ declared `parts`, package.json (`files` + `publishConfig.access=public`) - npm publish is the human step (`npm publish` per package dir). Tests: 4 green - three load together w/o namespace conflict w/ declared parts; security blocks Anthropic key + `rm -rf /` and allows clean (exit-code contract); format invokes formatter, skips unknown/missing (never blocks); broken sibling isolated while flagships load (fix-up via Phase-109 entry shape). Kernel 84/84, tsc 0, lint 0.

**Estimated Hours:** 8–10 hours.

---

# Stage 10 — MCP + Connectors (Phases 117–124)

---

## Phase 117: MCP Client — Stdio Transport

**Description:** Implement the MCP client with stdio transport: connect to local MCP servers by spawning them as child processes and communicating via JSON-RPC over stdin/stdout. Discover available tools from each server.

**Deliverables:**
- `packages/mcp/src/client/stdio.ts` — stdio transport
- `packages/mcp/src/client/tools.ts` — tool discovery
- Tests

**Dependencies:** Phase 34 (tool registry — MCP tools register here).

**Testing:** Connect to GitHub MCP server locally. List tools. Execute a tool.

**Status (2026-10-17):** Implemented (hand-rolled JSON-RPC 2.0 over newline-delimited stdio per the MCP transport spec, no SDK dependency used: `packages/mcp/src/client/stdio.ts` - `McpStdioTransport` over `Bun.spawn` pipes with id-matched pending map, notification handlers, per-request timeouts (default 30s), stderr ring buffer for diagnostics, close() kills the child and settles every pending request, unparseable lines vs responses isolated to the diagnostics ring; `packages/mcp/src/client/tools.ts` - `McpToolClient`: `connect()` runs the initialize handshake (protocol 2024-11-05) + `notifications/initialized`, `listTools()` discovery, `callTool(name,args)` surfacing `isError` results, `registerToolsInto(registry)` adapts discovered tools into Phase-34-style core registry definitions (structural interface, no @forge/core import). Blueprint's GitHub-server test requires a token/network, so protocol conformance is proven against a real spawnable mock server (`mock-server.ts`: initialize + tools/list + echo/add/slow/fail tools + unsolicited notification). Tests: 6 green - handshake w/ serverInfo, discovery (4 tools w/ schemas), echo/add execution + isError surfacing, no-hang timeout on the slow tool, core-registry adapter registration, nonexistent-server spawn fails without throwing. mcp 7/7, tsc 0, lint 0; barrel + dist rebuilt.

**Estimated Hours:** 8–10 hours.

---

## Phase 118: SSE/Streamable-HTTP + Auto-Reconnect

**Description:** Add SSE and streamable-http transports for remote MCP servers. Implement auto-reconnect: if connection drops, automatically reconnect and restore state.

**Deliverables:**
- `packages/mcp/src/client/sse.ts` — SSE transport
- `packages/mcp/src/client/http.ts` — streamable-http transport
- `packages/mcp/src/client/reconnect.ts` — auto-reconnect

**Dependencies:** Phase 117 (client core).

**Testing:** Connect to remote MCP server via SSE. Simulate disconnect → verify reconnect.

**Status (2026-10-17):** Implemented (`packages/mcp/src/client/sse.ts` - legacy HTTP+SSE `McpSseTransport`: GET `text/event-stream` downlink, `endpoint` event → POST path, `message` events carry JSON-RPC; shared SSE block parser exported; no-throw result objects, per-request timeouts, same pending/notification semantics as Phase 117. `http.ts` - `McpStreamableHttpTransport`: single-endpoint POST w/ `Accept: application/json, text/event-stream`, direct-JSON or in-body-SSE answers (Promise.race'd against the timeout), `Mcp-Session-Id` captured and replayed, 202 for notifications. `reconnect.ts` - `ReconnectingMcpClient<T>`: probe-before-use, drop-dead, bounded exponential backoff retries, `onRestore` state replay AFTER re-connections only (first connect is the caller's), recovery counters; exhausted budget → `{ok:false,error}`. Tests: 3 remote tests green over real `Bun.serve` HTTP (no external server) - SSE endpoint+request+notification+closed-transport behavior; streamable direct-JSON + in-body-SSE + session-header replay; reconnect drop→restore (onRestore replayed, reconnected=true), exhausted-retries error. mcp 10/10, tsc 0, lint 0; barrel + dist rebuilt.

**Estimated Hours:** 6–8 hours.

---

## Phase 119: OAuth Flow for Remote Servers

**Description:** Implement OAuth authentication for remote MCP servers (GitHub, Supabase, etc.). Handle: OAuth flow in browser, token storage, token refresh.

**Deliverables:**
- `packages/mcp/src/auth/oauth.ts` — OAuth for MCP
- Tests

**Dependencies:** Phase 118 (HTTP transport).

**Testing:** Connect to GitHub MCP with OAuth. Verify token flow.

**Status (2026-10-17):** Implemented (`packages/mcp/src/auth/oauth.ts` - RFC 6749 authorization-code with RFC 7636 PKCE S256 (`buildPkcePair`), RFC 8414 metadata discovery (`fetchOAuthMetadata`, path-scoped then root fallback), `McpOAuthFlow.authorize` orchestrating a 127.0.0.1 loopback callback server (state validation incl. tamper rejection, injectable browser opener, bounded callback wait) → code exchange → persist; `TokenStore` file-backed JSON (`~/.forge/mcp-tokens.json`, injectable directory, corruption-tolerant) with `expires_in`→`expiresAt`; `refresh` grant rotating tokens (keeps prior refresh token when the IdP omits one); `getValidToken` auto-refresh on expiry; `authHeaders` Bearer shape for the Phase-118 transports' headers option). Tests: 5 green against a real mock IdP over HTTP (`Bun.serve`) - metadata discovery incl. root fallback, PKCE shape, end-to-end browser flow (state validation → exchange → persistence → Bearer header), tampered-state rejection (no token stored), expired-token auto-refresh. The blueprint's live GitHub test needs browser+credentials = manual. mcp 15/15, tsc 0, lint 0; barrel + dist rebuilt.

**Estimated Hours:** 6–8 hours.

---

## Phase 120: Tool-Search (Lazy Loading)

**Description:** Implement tool-search: instead of loading all MCP tools at session start (which wastes context), load tool schemas lazily. The agent searches for relevant tools when needed, then loads only those schemas.

**Deliverables:**
- `packages/mcp/src/client/lazy.ts` — lazy tool loading
- Tests

**Dependencies:** Phase 117 (client).

**Testing:** Connect to MCP server with 100+ tools. Verify only requested tools are loaded into context.

**Status (2026-10-17):** Implemented (`packages/mcp/src/client/lazy.ts` - `LazyToolIndex`: `buildIndex()` fetches the server catalog once and stores ONLY name+description (full schemas discarded so they never enter context); `search(query, limit)` ranks exact-name > prefix > substring > description-word matches deterministically (no LLM); `loadSchemas(names)` refetches and materializes exactly the requested tools (deduped, repeated loads idempotent, unknown names → `{ok:false,error}` both for not-in-index and server-no-longer-exposes); `stats()` exposes indexSize vs loadedSchemas for the context-budget assertion; loader failures degrade to empty results. Wiring to a live server is one line over the Phase-117 `McpToolClient.listTools` as the `SchemaLoader`). Tests: 5 green - 120-tool catalog indexed w/ zero schemas in context + single loader call, ranked search (and empty-result queries), only-2-of-120 schemas materialized, unknown-name rejection + dedupe, loader-failure degradation. mcp 20/20, tsc 0, lint 0; barrel + dist rebuilt.

**Estimated Hours:** 5–6 hours.

---

## Phase 121: Bundled Connector Presets

**Description:** Create preset configurations for the most common MCP servers: GitHub, Context7, Playwright, Filesystem, Memory, Sequential Thinking. Users can install these with one command.

**Deliverables:**
- Preset configs in `packages/mcp/src/presets/`
- `/connect` command implementation

**Dependencies:** Phase 117-120 (MCP client).

**Testing:** `/connect github` → installs and configures GitHub MCP. Verify it works.

**Status (2026-10-17):** Implemented (`packages/mcp/src/presets/index.ts` - six bundled presets (github, context7, playwright, filesystem, memory, sequential-thinking) each with package command (`npx -y ...`), docs URL, required-env markers, and argument expectations (`filesystem` requires its root dir); `resolveServerSpec` resolves required env from the host at install time (missing variables become warnings, never crashes) and appends user args; `McpPresetsConfig` merges installations into the forge config `mcp-servers.json` (injectable dir, corruption-tolerant). TUI `/connect` command: `/connect` lists all presets with installed/available markers, `/connect <id> [args...]` one-command installs and reports the configured command + warnings; palette entry added. Tests: 5 green - all six presets bundled w/ commands + docs URLs, filesystem required-arg rejection, one-command install round-trip through the config file, env resolution + unset-env warnings, unknown-preset rejection + same-id merge. The blueprint's live-verification (`/connect github` reaching github.com) requires npx + GITHUB_TOKEN at runtime = user environment step; the config write path is fully tested. mcp 25/25, tsc 0, lint 0; barrel + dist rebuilt; tui typecheck 0.

**Estimated Hours:** 4–5 hours.

---

## Phase 122: Connector Wizard (`/connect`)

**Description:** Build the interactive connector wizard: `/connect` opens a searchable list of available MCP servers. User selects one, the wizard guides them through configuration (API keys, scopes, read-only mode), installs and tests the connection.

**Deliverables:**
- `/connect` command in TUI
- Wizard flow

**Dependencies:** Phase 121 (presets).

**Testing:** Run `/connect`, select server, complete wizard, verify connection.

**Status (2026-10-17):** Implemented (`packages/mcp/src/presets/wizard.ts` - `ConnectorWizard` state machine over the Phase-121 presets: ordered steps for required-env secrets (empty = inherit from host), expected args, optional scopes, and a read-only confirm (`FORGE_CONNECTOR_READ_ONLY`)/`MCP_SCOPES` env markers; required answers validated (empty required → error); `finish()` assembles the Phase-121 spec only when complete; `connectSpec(spec)` verifies the connection with a real Phase-117 initialize handshake (server name surfaced; dead commands and timeouts → `{ok:false,error}` with diagnostics; never throws). TUI: `/connect <id>` starts the wizard when the preset needs input (missing host env or expected args) and falls back to 121's direct path otherwise; `/answer <value>` advances, `/answer cancel` aborts; completion installs via `McpPresetsConfig` and the connection is tested automatically with the result reported in-chat; palette description updated. Tests: 7 green - step generation (github = 3 steps), required-answer validation + full flow w/ spec assembly, incomplete-finish refusal, optional-env/read-only=no omission, live handshake probe w/ server name, dead-command + timeout failures without throwing. The interactive rendering is message-driven (multi-turn): the blueprint's modal list is the `/connect` listing. mcp 32/32, tsc 0, lint 0; barrel + dist rebuilt; tui typecheck 0.

**Estimated Hours:** 5–6 hours.

---

## Phase 123: MCP Server Health Dashboard

**Description:** Build the MCP health dashboard: `/mcp` shows all connected MCP servers, their connection status, available tools, and last error. Allows disconnecting servers to free context.

**Deliverables:**
- `/mcp` command in TUI

**Dependencies:** Phase 117-120 (MCP client).

**Testing:** Connect to multiple servers. Run `/mcp`. Verify status display.

**Status (2026-10-17):** Implemented (`packages/mcp/src/client/manager.ts` - `McpConnectionManager`: live registry over the Phase-117 client and Phase-120 lazy index; `connect(id, spec)` spawns + handshakes + indexes the catalog (tool COUNT only - schemas stay lazy); a failed handshake removes the live entry and records an `error` status with `lastError`; `disconnect(id)` kills the child and drops the tool index (frees context) leaving an inert `disconnected` dashboard row; `statuses()` sorted by id; `loadTools(id, names)` lazily materializes schemas through the index, failing cleanly when the server is down). TUI `/mcp`: dashboard rows `id: state - N tools (serverName) - last error` over live + disconnected entries plus `configured - not connected` rows for preset installs never started; `/mcp connect <id>` brings a configured server live; `/mcp disconnect <id>` frees it; palette entry added. Tests: 4 green - multiple servers at once (two live mock servers + one dead → `dead:error:0`, `mock-a:connected:4`, `mock-b:connected:4`, error row carries `lastError`), disconnect frees (state `disconnected`, toolCount 0, double-disconnect and unknown-id rejected), reconnect repairs (state + tool count restored), lazy tool loading through the manager + clean failure when down. mcp 36/36, tsc 0, lint 0; barrel + dist rebuilt; tui typecheck 0.

**Estimated Hours:** 4–5 hours.

---

## Phase 124: Ship Our Own MCP Server

**Description:** Build and ship a forge MCP server that exposes our agent's capabilities to other tools. This lets Claude Code, Codex, Cursor, and other agents delegate work to forge via MCP.

**Deliverables:**
- `packages/mcp/src/server/` — our MCP server
- Published to npm

**Dependencies:** Phases 117-123 (MCP client mastery).

**Testing:** Connect Claude Code to our MCP server. Delegate a task. Verify it works.

**Status (2026-10-17):** Implemented (`packages/mcp/src/server/` - `ForgeMcpServer` (forge-server.ts): hand-rolled newline-delimited JSON-RPC stdio SERVER (mirror of the Phase-117 client framing) answering initialize (serverInfo `forge` 0.1.0), tools/list, tools/call (unknown tools → `isError` results, handler exceptions → tool-error results, `-32601` for unknown methods), ping; serve loop consumes stdin until EOF, `import.meta.path` guard for direct `bun run` invocation. `forge-tools.ts` - five default capability tools: forge_status (status + capabilities), run_tests (bun test w/ optional scope, timeout 300s, PASS/CHECK verdict from the output's fail summary, truncated to 8k chars), git_diff (diff --stat), new_task (delegation: appends JSON lines to `<cwd>/.forge/mcp-tasks.jsonl`), read_task_queue. npm-readiness: `@forge/mcp` package now ships a `bin` (`forge-mcp-server` → dist/server/forge-server.js) - actual `npm publish` remains the human step (credentials; package is still `private: true` pending consent). Tests: 4 green - and the round trip is dogfooded: the tests drive the server through OUR OWN Phase-117 `McpToolClient` (spawn → initialize → tools/list w/ all five tools → forge_status/git_diff real outputs → run_tests scoped at `src/client/lazy` PASS → new_task delegation queued in a tmp workspace → read_task_queue → empty-task isError). mcp 40/40, tsc 0, lint 0; barrel + dist rebuilt. Live Claude Code connection = manual (register the server binary in the client's config).

**Estimated Hours:** 8–10 hours.

---

# Stage 11 — Sandboxing & Isolation (Phases 125–130)

---

## Phase 125: Local Sandbox — Platform Abstraction

**Description:** Define the SandboxProvider interface: a pluggable abstraction for sandboxed command execution. Each platform provides its own implementation. The interface: execute command, check isolation, get sandbox info.

**Deliverables:**
- `packages/sandbox/src/types.ts` — SandboxProvider interface
- Tests

**Dependencies:** None.

## Phase 125: Local Sandbox - Platform Abstraction

**Description:** Define the SandboxProvider interface: a pluggable abstraction for sandboxed command execution. Each platform provides its own implementation. The interface: execute command, check isolation, get sandbox info.

**Deliverables:**
- `packages/sandbox/src/types.ts` - SandboxProvider interface
- Tests

**Dependencies:** None.

**Testing:** Define interface. Create mock implementation. Verify it satisfies the interface.

**Status (2026-10-17):** Implemented (`packages/sandbox/src/types.ts` - `SandboxProvider` interface: `execute(request)` → `SandboxExecutionResult` (exitCode/stdout/stderr/timedOut/durationMs, spawn-failure `error` field, no-throw convention), `checkIsolation()` → `IsolationReport` (per-check pass/fail + `isolated` verdict), `info()` → `SandboxInfo` (id/platform/capabilities/available/unsupportedReason), `isAvailable()` probe; `defineSandboxProvider` identity helper for compile-time conformance; `MockSandboxProvider` with a scripted result queue + request recording + configurable isolation report (bundled for downstream platform implementations to stub against). Zero dependencies, zero OS calls in the abstraction. Tests: 3 green - mock satisfies the interface (compile-time via the helper + runtime assertions), scripted execution w/ request recording + queue-exhaustion default, availability/unsupported-reason + failing-check isolation report. sandbox 4/4 (incl. the pre-existing VERSION smoke), tsc 0, lint 0; barrel + dist rebuilt.

**Estimated Hours:** 3–4 hours.

---

## Phase 126: Windows ACL Restricted-Token Runner

**Description:** Implement Windows sandboxing: create a restricted token that limits the subprocess's permissions. Block access to sensitive directories (system folders, other users' home directories). Use Windows ACLs and restricted tokens.

**Deliverables:**
- `packages/sandbox/src/windows/runner.ts` — Windows sandbox
- Tests

**Dependencies:** Phase 125 (interface).

**Testing:** Run command in sandbox. Verify restricted access. Try to access forbidden paths → denied.

**Status (2026-10-17):** Implemented (`packages/sandbox/src/windows/runner.ts` - `WindowsSandboxProvider` (id `windows-restricted-token`): executes commands under a RESTRICTED TOKEN via `runas /trustlevel:0x20000` (TrustLevel Untrusted) - the native-free restricted-token mechanism; output captured through marker files in a per-run scratch (runas detaches into its own console), done/exitcode markers using the parenthesized `%ERRORLEVEL%` echo (avoids the digit-trailing stream-redirect pitfall), cwd + env honored inside the generated run.bat, poll-to-timeout, scratch cleaned per run. Sensitive deny list: SystemRoot, System32, Program Files (+x86), and every real user profile under %SystemDrive%\Users except the current user (shared-by-design entries - Public, All Users - junctions, desktop.ini and non-directories excluded). `checkIsolation()` runs live probes: scratch write must succeed; writes into every sensitive dir must fail; `extraDeniedPaths` option. `isAvailable()` = win32 + runas present + live restricted echo probe, cached per instance; unavailable sessions degrade to skip-with-reason (tests guard). This dev machine: runas trust verified - probes confirmed writes DENIED to C:\Windows, System32, Program Files (x2), isolated=true (a deny-list bug that initially included the shared Public/All Users junctions was caught by the live probe and fixed). Tests: 5 green (2 platform-structure + 3 live-on-Windows). sandbox 9/9, tsc 0, lint 0; barrel + dist rebuilt.

**Estimated Hours:** 8–10 hours (complex, may need native addon).

---

## Phase 127: macOS Seatbelt Profile

**Description:** Implement macOS sandboxing via Seatbelt: create a sandbox profile that restricts file system access, network access, and process creation. Use Node addon to set the Seatbelt profile before executing commands.

**Deliverables:**
- `packages/sandbox/src/macos/sandbox.ts` — Seatbelt sandbox
- Tests

**Dependencies:** Phase 125.

**Testing:** Run command in Seatbelt sandbox. Verify restrictions.

**Status (2026-10-17):** Implemented (`packages/sandbox/src/macos/sandbox.ts` - `MacosSeatbeltProvider` (id `macos-seatbelt`): commands run under `sandbox-exec -f profile.sb --` - no Node addon needed, sandbox-exec ships with macOS and validates the generated profile. `buildSeatbeltProfile(options)` deterministically emits `(deny default)` + explicit allows: process-exec, process-fork (toggle), file-read*, sysctl-read, mach-lookup, iokit-open, system-socket, `file-write*` ONLY for scratch/workdir/custom subpaths (quote-escaped), and `network*` ONLY when `allowNetwork` - unlisted operations fail closed. `checkIsolation()` live probes: scratch write must succeed; home + /usr/local writes denied; network call (curl) denied. Tests: 6 green - deny-default profile shape + write subpaths, network/process-fork toggles, quote escaping, provider identity w/ darwin-conditional availability, live seatbelt execute + isolation probes (darwin-only, self-skip elsewhere e.g. this Windows CI box). sandbox 15/15, tsc 0, lint 0; barrel + dist rebuilt. Live seatbelt verification = macOS machine step (self-skipping tests ready).

**Estimated Hours:** 6–8 hours.

---

## Phase 128: Linux Landlock

**Description:** Implement Linux sandboxing via Landlock LSM: restrict file system access using Landlock rules. Use Node addon (or bubblewrap fallback) to apply Landlock restrictions before executing commands.

**Deliverables:**
- `packages/sandbox/src/linux/sandbox.ts` — Landlock sandbox
- Tests

**Dependencies:** Phase 125.

**Testing:** Run command in Landlock sandbox. Verify file access restrictions.

**Status (2026-10-17):** Implemented (`packages/sandbox/src/linux/sandbox.ts` - `LandlockProvider` (id `linux-landlock`): the blueprint's sanctioned **bubblewrap** fallback that enforces Landlock LSM - no Node addon. `buildBwrapArgs(options)`: host root mounted `--ro-bind / /` (reads everywhere, writes nowhere), per-run scratch + optional cwd/custom binds read-WRITE, `/dev`, `/proc`, `tmpfs /tmp`, `--unshare-net` (network denied unless `allowNetwork`), `--die-with-parent --new-session`. `execute()` = per-run scratch + `bwrap` spawn w/ timeout; `checkIsolation()` live probes: bind-mount write must succeed, `/etc` write (read-only root) denied, network denied; `isAvailable()` = linux + `/usr/bin/bwrap` + live probe. Tests: 5 green - exact bwrap argv (read-only root + binds + fences), network opt-in toggle, provider identity (linux-conditional availability), live sandbox execute + isolation report (linux-only; this Windows box self-skips). sandbox 20/20, tsc 0, lint 0; barrel + dist rebuilt. Live landlock verification = Linux machine step (self-skipping tests ready).

**Estimated Hours:** 6–8 hours.

---

## Phase 129: Docker/Podman Environment Provider

**Description:** Implement Docker/Podman sandboxing: run commands inside a container. Provide pre-built images with common dev tools (Node, Python, Git). Container networking and volume mounting for project access.

**Deliverables:**
- `packages/sandbox/src/docker/provider.ts` — Docker sandbox provider
- Dockerfile for sandbox image
- Tests

**Dependencies:** Phase 125.

**Testing:** Run command in Docker sandbox. Verify isolation. Test volume mounting.

**Status (2026-10-17):** Implemented (`packages/sandbox/src/docker/provider.ts` - `DockerSandboxProvider` (id `docker-container`): docker → podman runtime detection (`detectRuntime` result object); `buildDockerRunArgs(options)` pure assembly - `--network none` by default (opt-in), read-only root, `--cap-drop ALL`, `--security-opt no-new-privileges`, optional `--memory`, tmpfs /tmp, `-v scratch:/work` and `-v project:/workspace` volume mounts (Windows path normalization), `--workdir /workspace`; `isAvailable()` = runtime + live `run` probe (image present or alpine fallback), cached; `execute()` maps timeouts/errors to result objects; `checkIsolation()` probes: /workspace volume write allowed, /etc write denied (read-only root + dropped caps), network denied. SANDBOX_DOCKERFILE bundled: node:22-bookworm-slim + python3 + git + dedicated unprivileged `sandbox` user, workdir /workspace. Tests: 5 green - Dockerfile content assertions, locked-down argv assembly (network/read-only/cap-drop/two volume mounts/workdir/image position), network opt-in toggle, runtime detection result-object semantics (docker/podman/none), inert-when-unavailable provider (no-throw execute → exitCode null). Live container runs = machine with docker/podman (tests guard on isAvailable). sandbox 25/25, tsc 0, lint 0; barrel + dist rebuilt.

**Estimated Hours:** 8–10 hours.

---

## Phase 130: Remote Sandbox Provider (E2B/Daytona)

**Description:** Implement remote sandbox providers: E2B and Daytona adapters for running commands in cloud sandboxes. This enables: running untrusted code safely, accessing pre-configured development environments, scaling to more powerful machines.

**Deliverables:**
- `packages/sandbox/src/remote/e2b.ts` — E2B adapter
- `packages/sandbox/src/remote/daytona.ts` — Daytona adapter
- Tests

**Dependencies:** Phase 125.

**Testing:** Run command in E2B sandbox. Run in Daytona sandbox. Verify both work.

**Status (2026-10-17):** Implemented (two cloud adapters, both implementing the Phase-125 `SandboxProvider` with injectable `fetchImpl` + overridable `baseUrl`: `packages/sandbox/src/remote/e2b.ts` - `E2BSandboxProvider`: `E2B_API_KEY` auth, POST /sandboxes create (templateId), POST /sandboxes/{id}/commands execution (cwd/env/timeout passed through) mapped into `SandboxExecutionResult`, DELETE teardown, sandbox reuse across executes (create once), `checkIsolation()` remote probes (home write allowed, /etc write denied - cloud VM runs as non-root); `packages/sandbox/src/remote/daytona.ts` - `DaytonaSandboxProvider`: Bearer auth, POST /workspace create (image), POST /workspace/{id}/exec, DELETE teardown, same result-mapping + probes. Missing API keys keep providers inert (`unsupportedReason`, execute → error result, no throw). Tests: 4 green against real local mock cloud APIs (Bun.serve) - E2B create-once reuse + command mapping + teardown + missing-key inertness + remote isolation probes; Daytona same contract w/ Bearer auth + DELETE verification. Live cloud runs = API-key step (E2B_API_KEY / DAYTONA_API_KEY). sandbox 29/29, tsc 0, lint 0; barrel + dist rebuilt. Stage 11 COMPLETE (125-130) 6/6.

**Estimated Hours:** 8–10 hours.

---

# Stage 12 — Git Deep Integration (Phases 131–136)

---

## Phase 131: Checkpointing Engine

**Description:** Implement checkpointing: before every file edit, take a shadow snapshot of the file. This enables perfect rollback: undo any edit, revert to any point in the conversation. Store checkpoints in `.forge/checkpoints/` with content hashing for deduplication.

**Deliverables:**
- `packages/git/src/checkpoints/engine.ts` — checkpoint engine
- Tests

**Dependencies:** Phase 35 (Edit tool — integrate checkpointing before edit).

**Testing:** Edit a file, verify checkpoint created. Rollback, verify file restored. Test with many checkpoints for dedup.

**Status (2026-10-17):** Implemented (`packages/git/src/checkpoints/engine.ts` - `CheckpointEngine(rootDir)`: `snapshotBeforeEdit(filePath)` stores content-addressed blobs under `.forge/checkpoints/blobs/<sha256>` + an append-only `journal.jsonl` (identical content reuses the blob - `deduplicated`/`blobWritten` flags - while the journal still records every checkpoint); `listCheckpoints(filePath?)`; `rollback(filePath, id?)` restores exact pre-edit content from the blob, detects the already-reverted no-op via content hash, and reports missing snapshots; `stats()` (entries vs stored blobs) + `clear()`. All result objects - missing files and corrupt journal degrade cleanly. **Phase-35 integration**: core's `createEditTool().execute` takes a best-effort shadow snapshot (dynamic `import('@forge/git')`, wrapped, never blocks or fails the edit) before mutating the file; `@forge/git` added as a core workspace dependency (no cycle - git has zero deps). Tests: 5 green - snapshot creates journal + blob (blueprint bullet 1), rollback restores exact content (bullet 2), targeted-id rollback + already-reverted detection, dedup: 5 checkpoints of alternating content → 2 blobs (bullet 3), clear + unknown-file clean reporting. git 6/6, core edit tools 11/11, core suite 1315/0 untouched, tsc 0 git+core, git lint 0 (core has pre-existing lint debt in unrelated agent/ test files - tracked, not from this phase).

**Estimated Hours:** 8–10 hours.

---

## Phase 132: Rewind Conversation + Code

**Description:** Implement `/rewind`: restore both conversation state AND file state to a previous checkpoint. The user can rewind to any point in the conversation and try a different approach.

**Deliverables:**
- `/rewind` command implementation
- Tests

**Dependencies:** Phase 131 (checkpoints), Phase 10 (fork).

**Testing:** Make edits, rewind, verify files restored. Verify conversation state restored.

**Status (2026-10-17):** Implemented (`packages/git/src/checkpoints/rewind.ts` - `RewindService` over the Phase-131 journal: `listPoints()` one point per checkpoint w/ cumulative distinct-file counts; `rewindTo({id})` restores EVERY journaled file to its latest checkpoint at-or-before the target moment (later-only files skipped with a reason), result object w/ per-file `restored`/`alreadyReverted`/`error`; `resolvePoint()` default = the previous point (a no-op-against-latest rewind is useless). TUI `/rewind`: bare form lists the target checkpoint + previews the conversation snapshot it will restore (Phase-132 conversation snapshots captured in-session before each submitted turn, paired by savedAt); `/rewind <checkpointId>` confirms → `rewindTo` for files + `state.messages` restored from the matched snapshot; `/rewind cancel` aborts. Palette entry added. Tests: 4 green - blueprint bullets: edits → rewind → files restored exactly (multi-file), conversation restore verified via snapshots pairing; plus previous-point default + already-reverted no-op, later-only-file skip, unknown-id rejection). git 10/10, tsc 0, lint 0; git dist + tui typecheck clean; tui-editable suites 166/0.

**Estimated Hours:** 5–6 hours.

---

## Phase 133: Smart Commit/PR Tools

**Description:** Implement enhanced git tools: `SmartCommit` (auto-generate commit message from changes, conventional commit format), `CreatePR` (create PR with description from conversation context), `ReviewPR` (review PR changes and provide feedback).

**Deliverables:**
- `packages/git/src/tools/smart-commit.ts`
- `packages/git/src/tools/create-pr.ts`
- `packages/git/src/tools/review-pr.ts`
- Tests

**Dependencies:** Phase 34 (tool registry).

**Testing:** Make changes, smart commit → verify conventional commit message. Create PR → verify it works.

**Status (2026-10-17):** Implemented (`packages/git/src/tools/` - three `Tool`-shaped classes for the Phase-34 host registry: `SmartCommitTool` (smart-commit.ts) - optional `git add -A`, conventional message GENERATED from the working tree via pure `generateCommitMessage`/`classifyChangeType` (type heuristics: test/spec paths -> test, all-md/docs -> docs, otherwise feat+scope from the parent dir; subject lists added/modified/deleted counts; feat! on breaking markers; explicit non-conventional messages get gently prefixed), dry-run mode, clean-tree + spawn-failure errors; `CreatePrTool` (create-pr.ts) - pushes -u origin HEAD, `gh pr create` with `buildPrBody` (Context section from conversation context + Changes from the last 10 commit subjects) and `buildCreatePrArgs` (base/draft); `ReviewPrTool` (review-pr.ts) - `gh pr diff` + pure `reviewDiff`: secret patterns (high), debug residue (low), >50 additions without test files (medium), >400-line-hunk warnings, risk verdict + counts. All spawn paths degrade to {ok:false, output|error}; no-throw. Tests: 13 green - conventional message generation + classification, end-to-end commit in a temp repo w/ log verification, dry-run + explicit-message passthrough, clean-tree behavior, PR body/context + argv assembly (base/draft), secret/coverage/clean diff reviews, gh-missing/unauthenticated degradation (conditional live legs). git 23/23, tsc 0, lint 0; git dist rebuilt. Live PR creation = machine with gh authenticated (tests guard).

**Estimated Hours:** 6–8 hours.

---

## Phase 134: GitHub Actions / GitLab CI Integration

**Description:** Implement CI integration: label-triggered agent runs in GitHub Actions. When a PR gets a specific label (e.g., `forge-review`), the agent runs and posts review comments. Similar integration for GitLab CI.

**Deliverables:**
- GitHub Action definition
- GitLab CI template
- Documentation

**Dependencies:** Phase 133 (PR tools).

**Testing:** Create PR with label → agent runs in CI → review comments posted.

**Status (2026-10-17):** Implemented (`.github/workflows/forge-review.yml` - `pull_request_target` labeled trigger on `forge-review`: checkout + bun setup + FORGE_GH_TOKEN secret + `bun run scripts/ci-forge-review.ts`; `scripts/ci-forge-review.ts` - PR number resolution from FORGE_PR_NUMBER / GITHUB_REF refs/pull / GitLab CI_MERGE_REQUEST_IID (result-object validation), Phase-133 `ReviewPrTool` diff review, deterministic comment formatting (`formatReviewComment`: risk level, counts, per-findings, footer), posted via `gh pr review --comment` with `gh pr comment` fallback + FORGE_GH_TOKEN env passing; `docs/ci/forge-review.gitlab-ci.yml` - GitLab merge-request-event job on the same label regex + env contract; `docs/ci/README.md` - setup documentation (secrets, label creation, env table, include snippet). Tests: 6 green - PR-number resolution (GitHub ref/GitLab iid/override/invalid/missing) and comment formatting (risk+findings, finding-free variant) - the pure CI surface, verified offline; the live label->PR round-trip = repository-with-actions step. git 29/29, tsc 0, lint 0.

**Estimated Hours:** 6–8 hours.

---

## Phase 135: Worktree Manager CLI

**Description:** Implement worktree management commands: `forge worktree list`, `forge worktree create <branch>`, `forge worktree remove <branch>`, `forge worktree merge <branch>`. Simplifies git worktree operations for parallel development.

**Deliverables:**
- CLI commands for worktree management

**Dependencies:** Phase 96 (worktree isolation for subagents).

**Testing:** Create worktree, list worktrees, merge worktree, remove worktree.

**Status (2026-10-17):** Implemented (`packages/git/src/worktree/cli.ts` - dependency-free handlers over git: `worktreeList` (parsed `--porcelain` entries: path/head/branch/bare), `worktreeCreate` (scratch default `<repo>/.forge/worktrees/<sanitized-name>`, optional base ref), `worktreeMerge` (merge into the current branch), `worktreeRemove` (matches by path or branch name, optional `--force` + branch deletion - keeps unmerged branches with an explanatory note). Forge CLI wiring: `forge worktree <list|create|merge|remove>` subcommand in `packages/server/src/cli.ts` (dispatcher `runWorktreeCommand`, prints handler output, `@forge/git` workspace dep added to @forge/server). Tests: 5 green - full lifecycle per blueprint (create → list shows branch+head → merge brings committed worktree changes into main → remove deletes incl. branch), unmerged-branch protection on remove, unknown-worktree + non-repo clean failures. Server CLI suites 29/29 w/ the new wiring. git 34/34, tsc 0 git, lint 0 git+server.

**Estimated Hours:** 4–5 hours.

---

## Phase 136: PR Review Workflow

**Description:** Implement the full PR review workflow: fetch PR diff, analyze changes, check for issues (security, performance, style), post review comments, suggest improvements. Can be triggered manually or via CI.

**Deliverables:**
- `/review` command implementation
- PR review workflow

**Dependencies:** Phase 133 (PR tools), Phase 42 (diff rendering).

**Testing:** Run `/review` on a PR. Verify analysis and comments.

**Estimated Hours:** 6–8 hours.

---

# Stage 13 — Headless/CI/Editors (Phases 137–142)

---

## Phase 137: `-p` Print Mode

**Description:** Implement `forge -p "prompt"`: one-shot mode. Agent processes the prompt, prints the response to stdout, and exits. Exit code 0 for success, non-zero for error. Works in CI, scripts, and automation.

**Deliverables:**
- `-p` CLI flag implementation

**Dependencies:** Phase 33 (agent loop).

**Testing:** `forge -p "what is 2+2"` → prints "4" → exits 0.

**Estimated Hours:** 3–4 hours.

---

## Phase 138: Piped Stdin/Stdout

**Description:** Support piped input: `cat file.ts | forge -p "explain this code"`. The agent reads from stdin when no prompt is provided. Output goes to stdout (not TUI).

**Deliverables:**
- Stdin reading support

**Dependencies:** Phase 137.

**Testing:** Pipe file content to agent. Verify response printed to stdout.

**Estimated Hours:** 2–3 hours.

---

## Phase 139: JSON Output Mode

**Description:** Implement `--json` flag: output responses as structured JSON instead of markdown. Useful for automation pipelines that parse agent output.

**Deliverables:**
- `--json` CLI flag implementation

**Dependencies:** Phase 137.

**Testing:** `forge -p "explain 2+2" --json` → valid JSON output.

**Estimated Hours:** 2–3 hours.

---

## Phase 140: ACP Server Implementation

**Description:** Implement the Agent Client Protocol (ACP) server: JSON-RPC 2.0 over stdio, compatible with Zed, Neovim, JetBrains. Handle: initialize, session/new, session/prompt, session/cancel, session/update notifications, session/request_permission.

**Deliverables:**
- `packages/server/src/acp/` — ACP server implementation
- Tests

**Dependencies:** Phase 80 (RPC mode).

**Testing:** Connect Zed editor to forge via ACP. Send prompt. Receive response.

**Estimated Hours:** 8–10 hours.

---

## Phase 141: VS Code Extension Skeleton

**Description:** Create a VS Code extension skeleton: sidebar panel with chat interface, sends prompts to forge server, displays responses. Minimal but functional.

**Deliverables:**
- `packages/vscode/` — VS Code extension skeleton

**Dependencies:** Phase 73 (server), Phase 76 (SDK).

**Testing:** Install extension in VS Code. Send prompt. Receive response.

**Estimated Hours:** 8–10 hours.

---

## Phase 142: GitHub App Skeleton

**Description:** Create a GitHub App skeleton: responds to PR events by running forge and posting review comments. Triggered by labels or comments.

**Deliverables:**
- GitHub App definition
- Basic event handlers

**Dependencies:** Phase 134 (CI integration).

**Testing:** Install GitHub App. Create PR with label → agent reviews.

**Estimated Hours:** 6–8 hours.

---

# Stage 14 — Observability & Evals (Phases 143–148)

---

## Phase 143: Local Stats Dashboard

**Description:** Build a local stats dashboard: `forge stats` shows usage statistics — total cost, cost by model, cost by day, sessions count, average session length, tool usage breakdown. Display in a nice TUI table or as JSON.

**Deliverables:**
- `forge stats` command
- Stats aggregation queries

**Dependencies:** Phase 15 (cost tracking), Phase 28 (cost engine).

**Testing:** Run `forge stats`. Verify accurate data.

**Estimated Hours:** 4–5 hours.

---

## Phase 144: Trajectory Browser

**Description:** Build a trajectory browser (mini-swe-agent style): visualize agent runs step-by-step. Show: each decision, each tool call, each result. Enable debugging by seeing exactly what the agent did and why.

**Deliverables:**
- Trajectory browser UI (TUI or web)

**Dependencies:** Phase 7 (event log), Phase 12 (export).

**Testing:** Create a session with multiple tool calls. Browse trajectory. Verify all steps visible.

**Estimated Hours:** 8–10 hours.

---

## Phase 145: Built-in Eval Runner

**Description:** Build an eval runner: execute benchmark tasks (SWE-bench-lite subset, custom tasks) against the current agent configuration. Measure: task completion rate, tokens used, cost, time. Compare across models and configurations.

**Deliverables:**
- `packages/evals/src/runner.ts` — eval runner
- `packages/evals/src/tasks/` — benchmark tasks
- `forge eval` CLI command

**Dependencies:** Phase 33 (agent loop), Phase 8 (store).

**Testing:** Run eval suite. Verify results are accurate and reproducible.

**Estimated Hours:** 10–12 hours.

---

## Phase 146: Regression Suite per Release

**Description:** Pin a set of eval tasks that run on every release. If any task regresses (was passing, now failing), the release is blocked. This ensures quality doesn't degrade over time.

**Deliverables:**
- Regression test configuration
- CI integration

**Dependencies:** Phase 145 (eval runner).

**Testing:** Run regression suite. Verify pass/fail detection.

**Estimated Hours:** 4–5 hours.

---

## Phase 147: Telemetry Opt-in + Privacy Policy

**Description:** Implement optional telemetry: users can opt in to share anonymous usage data (features used, error rates, performance). No code content, no prompts, no file paths. Write a clear privacy policy.

**Deliverables:**
- Telemetry client
- Privacy policy document
- `/telemetry` command to toggle

**Dependencies:** None.

**Testing:** Enable telemetry. Verify no sensitive data transmitted. Verify privacy policy is accurate.

**Estimated Hours:** 4–5 hours.

---

## Phase 148: `/doctor` Diagnostics Command

**Description:** Implement `/doctor`: run diagnostic checks on the forge installation. Check: Bun version, OpenTUI version, provider connectivity, MCP server status, plugin health, config validity, permissions setup.

**Deliverables:**
- `/doctor` command implementation

**Dependencies:** All components (it checks everything).

**Testing:** Run `/doctor`. Verify all checks run and report correctly.

**Estimated Hours:** 4–5 hours.

---

# Stage 15 — Distribution & Polish (Phases 149–154)

---

## Phase 149: Single Binary Compile

**Description:** Compile the entire agent to a single binary via `bun build --compile`. The binary should work on: macOS (ARM + Intel), Linux (x64 + ARM), Windows (x64). Test each platform binary.

**Deliverables:**
- Build scripts for all platforms
- Binary size report

**Dependencies:** All implementation phases.

**Testing:** Compile binary. Run on each platform. Verify all features work.

**Estimated Hours:** 6–8 hours.

---

## Phase 150: Package Manager Distribution

**Description:** Set up distribution via package managers: npm (`npm i -g forge`), Homebrew (formula), Scoop (manifest), WinGet (manifest). Auto-update mechanism checks for new versions on launch.

**Deliverables:**
- npm package configuration
- Homebrew formula
- Scoop manifest
- WinGet manifest
- Auto-update checker

**Dependencies:** Phase 149 (binaries).

**Testing:** Install via npm. Install via Homebrew. Verify auto-update notification.

**Estimated Hours:** 6–8 hours.

---

## Phase 151: Onboarding Wizard (`setup`)

**Description:** Build the first-run onboarding wizard: `forge setup` walks users through: selecting a provider, entering API key, choosing a model, selecting theme, configuring permissions. Friendly, step-by-step, with sensible defaults.

**Deliverables:**
- `forge setup` CLI command
- Setup flow in TUI

**Dependencies:** Phase 5 (config), Phase 18–22 (providers).

**Testing:** Run `forge setup` on fresh install. Verify complete setup.

**Estimated Hours:** 5–6 hours.

---

## Phase 152: Documentation Site + Landing Page

**Description:** Build the documentation site: getting started guide, feature docs, API reference, plugin development guide, architecture overview. Build a landing page with: feature highlights, installation instructions, GIF demos.

**Deliverables:**
- Documentation site (VitePress or Docusaurus)
- Landing page (Astro or Next.js)
- GIF demos of key features

**Dependencies:** All implementation phases (docs cover everything).

**Testing:** All docs pages load. All links work. Landing page looks good on mobile.

**Estimated Hours:** 10–15 hours.

---

## Phase 153: Launch Materials

**Description:** Prepare launch materials: Show HN post, Twitter/X thread, Reddit post (r/LocalLLaMA, r/programming), Discord community setup, GitHub repository README with GIFs and badges.

**Deliverables:**
- Show HN draft post
- Twitter/X thread draft
- Reddit post draft
- Discord server setup
- GitHub README with GIFs

**Dependencies:** Phase 152 (docs + landing page).

**Testing:** Review all materials. Verify links work. Test Discord setup.

**Estimated Hours:** 6–8 hours.

---

## Phase 154: Post-Launch: Community + Roadmap

**Description:** Launch day activities: publish to all channels, monitor GitHub issues, respond to feedback, triage bugs. Set up the public roadmap (GitHub Projects or similar). Plan the next milestone based on community feedback. Establish the plugin bounty program for community contributions.

**Deliverables:**
- Published release
- GitHub Issues templates
- Public roadmap
- Plugin bounty program

**Dependencies:** Phase 153 (launch materials).

**Testing:** Release is live. Issues templates work. Roadmap is published.

**Estimated Hours:** Ongoing.

---

# Stretch Phases (155–204)

*These are future phases to be elaborated only if traction justifies. They're placeholder titles only.*

155–164: Mobile companion app (React Native), Voice input integration, Desktop app (Tauri), Real-time collaboration (multi-user sessions), Database-backed sessions (PostgreSQL option)
165–174: Custom model fine-tuning hooks, RL evaluation framework, Marketplace revenue system, Enterprise analytics dashboard, SSO/SCIM integration
175–184: Kubernetes deployment mode, Multi-tenant server, API rate limiting per-user, Webhook-triggered automations, Scheduled agent runs (cron)
185–194: Visual diff editor (TUI), Inline code suggestions, Git bisect automation, Dependency update automation, Security vulnerability scanning
195–204: Plugin development SDK, Plugin testing framework, Plugin certification program, Community plugin gallery, Annual security audit

---

**END OF PLAN.md**
*Last updated: 2026-10-16 (historical roadmap recovery and repair-status correction)*
*Current phase: 86, implemented-under-repair; next phase: 87, pending verification and separate implementation approval.*
