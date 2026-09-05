# STACK.md — Technology Choices & Rationale

Every technology in this project is locked in here. If you need to use something not listed, propose a DECISIONS_LOG entry first.

---

## Core Runtime
- **Runtime:** Bun (latest stable, ^1.2)
- **Language:** TypeScript (strict mode, ESM)
- **Package Manager:** Bun workspaces (pnpm-compatible)
- **Monorepo:** Turborepo (build orchestration, caching)
- **Single Binary:** `bun build --compile` (bundles Bun runtime + code)

## TUI Framework
- **Primary:** `@opentui/solid` (OpenTUI SolidJS bindings)
- **Renderer:** OpenTUI Zig core (dual-buffer diffing, sub-ms rendering)
- **Layout:** Yoga (Flexbox via OpenTUI)
- **State:** SolidJS signals + effects
- **Markdown:** `shiki` for syntax highlighting (integrated with custom streaming parser)
- **Why not Ink:** Ink uses React reconciler (heavier per-render). OpenTUI's Zig renderer is faster. SolidJS signals avoid React's re-render overhead. Both use Yoga for layout.

## Server Framework
- **HTTP:** Hono (lightweight, OpenAPI-native, works on Bun)
- **API Spec:** OpenAPI 3.1 (generated from Hono routes)
- **SDK Codegen:** Stainless-style or manual typed SDK from OpenAPI
- **Events:** Server-Sent Events (SSE) for real-time streaming
- **RPC:** JSON-RPC 2.0 over stdio (for ACP, headless, SDK)
- **WebSocket:** For remote dashboard (Stage 16+)

## Storage
- **Primary DB:** SQLite via Drizzle ORM (better-sqlite3 driver for Bun)
- **Event Log:** JSONL files (append-only, one file per session)
- **Memory:** `~/.config/forge/` (global config + sessions)
- **Project Memory:** `.forge/` directory (project-local, gitignored)
- **Why dual-path:** SQLite for fast queries (list sessions, search, aggregate costs). JSONL for crash-safe incremental writes and event replay.

## Provider Layer
- **Primary:** Vercel AI SDK v5 (`ai` package)
- **Model Catalog:** models.dev API (75+ providers, context windows, pricing)
- **Provider Adapters:** `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google`, `@ai-sdk/amazon-bedrock`, `@ai-sdk/google-vertex`, plus OpenAI-compatible for everything else
- **Fallback:** OpenAI-compatible generic adapter (covers DeepSeek, Groq, Cerebras, Ollama, OpenRouter, vLLM, LM Studio, etc.)
- **Why AI SDK:** Most battle-tested TS provider abstraction. Tool calling, streaming, structured output, thinking blocks all work cross-provider. Generates TypeScript client code.
- **Alternative considered:** LiteLLM (Python, adds proxy complexity), custom adapter per provider (maintenance nightmare).

## MCP Client
- **SDK:** `@modelcontextprotocol/sdk` (official TypeScript MCP SDK)
- **Transports:** stdio (local), SSE, streamable-http, OAuth
- **Tool Loading:** Lazy (tool schemas fetched on-demand, not all at session start)
- **Reference:** `@modelcontextprotocol/server-github`, `@modelcontextprotocol/server-filesystem`, `@modelcontextprotocol/server-memory`

## LSP Client
- **Library:** `vscode-languageserver-protocol` (types) + custom LSP client
- **Purpose:** Post-edit type checking, symbol navigation, diagnostics
- **Pattern:** Spawn LSP server per-project, query diagnostics after edits, feed errors back to agent

## Search & Code Intelligence
- **Grep:** `ripgrep` binary (spawned as child process)
- **Glob:** Built-in Bun glob or `fast-glob`
- **AST:** `tree-sitter` + language grammars (optional, for AST-aware editing)
- **Semantic Search:** Embeddings-based (Stage 12+, using local or API embeddings)
- **Diff:** `diff` library + `cli-highlight`/`shiki` for syntax-colored diffs

## Testing
- **Framework:** Bun's built-in test runner (`bun test`)
- **E2E:** Custom test harness (spawn agent against fixtures, assert outputs)
- **Evals:** SWE-bench-lite subset runner (in `packages/evals/`)
- **Linting:** Biome (fast, Bun-native) or ESLint with TypeScript parser

## Sandboxing
- **Linux:** Landlock LSM (via Node addon or `bubblewrap`)
- **macOS:** Seatbelt (via Node addon)
- **Windows:** ACL restricted-token runner (Node addon)
- **Docker:** `dockerode` for container-based sandboxing
- **Remote:** E2B / Daytona adapter interfaces

## Build & Distribution
- **Binary:** `bun build --compile` → single executable
- **TUI binary:** Compiled separately (Go or Zig), embedded in Bun binary via env var path or alongside
- **Installers:** npm (`npm i -g forge`), Homebrew formula, Scoop manifest, WinGet manifest
- **Auto-update:** Built-in update checker (compare version on launch)

## Code Style & Quality
- **Formatter/Linter:** Biome (format + lint in one tool)
- **Type Checking:** TypeScript strict mode, no `any` in production code
- **Conventional Commits:** `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`
- **Changesets:** For version management across packages

## Documentation
- **Landing Page:** Astro or Next.js static site
- **Docs:** VitePress or Docusaurus
- **Plugin Docs:** Auto-generated from plugin manifests

---

## Anti-Patterns (Never Do These)

1. **Never use `any` type** in production code. Use `unknown` and narrow.
2. **Never import across package boundaries** without declaring the dependency in package.json.
3. **Never bypass the permission engine.** Every tool call goes through it, no exceptions.
4. **Never hardcode provider-specific behavior** in the core. Put it in the provider adapter.
5. **Never store secrets in source code.** Use environment variables or the SecretRegistry pattern.
6. **Never assume a model supports a feature.** Always check model capabilities from the catalog.
7. **Never block the event loop.** Use async/await for all I/O. Bun's event loop is single-threaded.
8. **Never skip the event log.** Every model-visible state change must go through the append-only log.
9. **Never write to SQLite without going through Drizzle.** Raw SQL is only for migrations.
10. **Never guess at API shapes.** Use the generated SDK types from the OpenAPI spec.
