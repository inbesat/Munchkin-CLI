# REPOS.md — Reference Repositories to Study

Every GitHub repo worth studying for this project, annotated with what to take from each.

---

## Primary References (Read Deeply)

### 1. `deepseek-ai/deepseek-harness` (195k stars)
**What:** DeepSeek's open-source agent harness. MIT. Everything-is-a-plugin via Cordis kernel.
**What to take:**
- Session event log design (append-only, resume, fork, replay)
- Four preset modes (Standard, Minimal, Code, Creator) — we can ship similar presets
- Code-mode batching (generate TS SDK for tools, 5 calls = 1 program)
- Cross-agent delegation (spawn Claude Code/Codex as subagents)
- Platform-native sandboxing (Landlock, Seatbelt, ACL)
- `hooks.json` bridge for Claude Code/Codex compatibility
- Python SDK pattern (JSON-RPC over stdio)
**Don't take:** Cordis kernel (too complex for v1), their specific plugin API shapes (we design simpler ones)

### 2. `sst/opencode` (20k+ stars)
**What:** SST's AI coding agent. Client/server architecture. TUI + web + desktop.
**What to take:**
- Client/server architecture (Hono server + OpenTUI TUI)
- OpenAPI spec + generated SDK pattern
- Effect-based backend architecture (service layer)
- Plugin system (hooks: auth, provider, tool.execute.before/after, permission.ask)
- SQLite + Drizzle ORM storage pattern
- Event bridge (SSE for real-time streaming)
- LSP integration (post-edit diagnostics)
- Provider transform layer (normalizing across providers)
**Don't take:** Effect library (steep learning curve, we use simpler DI)

### 3. `kuberwastaken/claurst` (10k stars)
**What:** Clean-room Rust reimplementation of Claude Code. Beta quality.
**What to take:**
- `spec/` directory — **GOLD**: exhaustive behavioral specification of Claude Code, legally safe
- Feature matrix comparison (what they built vs what Claude Code has)
- Multi-provider routing implementation
- TUI architecture patterns
- ACP (Agent Client Protocol) implementation
- Chat forking and memory consolidation
- Effort levels (including "ultracode")
- `/share` via GitHub Gists
**Don't take:** Rust implementation (we're TypeScript), GPL license approach (we use MIT)

### 4. `badlogic/pi-mono` / `pi-ai`
**What:** Clean multi-provider LLM abstraction. 15+ providers. TypeScript.
**What to take:**
- Provider interface design (Model, stream, tool calling, thinking blocks)
- Provider metadata catalog (context windows, pricing, capabilities)
- Seamless model switching mid-conversation
- TypeBox schemas for tool parameter validation
**Don't take:** Their full architecture (we use AI SDK instead, but study their patterns)

### 5. `OpenHands/software-agent-sdk` (64k+ stars)
**What:** Production agent SDK. Event-sourced state. MLSys 2026 paper.
**What to take:**
- Event hierarchy design (LLMConvertibleEvent, internal events)
- ConversationState as sole mutable object
- Action-Execution-Observation tool contract
- MCP tools via FastMCP (indistinguishable from native tools)
- LLMSummarizingCondenser (2x cost reduction, no quality loss)
- SecretRegistry (late-bound, masking, live rotation)
- SecurityAnalyzer + ConfirmationPolicy
- Conversation/Workspace factory (local + remote)
**Don't take:** Python implementation, their specific Pydantic models

### 6. `SWE-agent/mini-swe-agent` (6.7k stars)
**What:** 100-line agent that scores 74% on SWE-bench Verified.
**What to take:**
- Proof that the core loop is ~100 lines
- Sandboxed environment abstractions (Docker, bubblewrap, singularity)
- Evaluation harness design
- Trajectory browser for debugging agent runs
- Subprocess-per-action pattern (simpler than stateful shell)
**Don't take:** Their tool interface (too minimal for our goals), Python runtime

### 7. `SWE-agent/SWE-agent` (20k stars)
**What:** Original SWE-bench agent. Research-focused.
**What to take:**
- Agent-Computer Interface (ACI) design patterns
- Tool interface experiments (different tools for different tasks)
- History processor patterns
- Trajectory analysis tooling
**Don't take:** Complexity (superseded by mini-swe-agent)

---

## Secondary References (Study Patterns)

### 8. `lingcoder/crab-code` (74 stars)
**What:** Rust Claude Code alternative. MIT.
**What to take:** Comparison table features, Rust TUI patterns (if considering native later)

### 9. `aebrer/dreb` (fork of pi-mono)
**What:** Hackable coding agent. Multiple frontends (TUI, web, Telegram).
**What to take:**
- Telegram bot frontend pattern
- Web dashboard design
- Semantic codebase search (AST chunking + embeddings + POEM ranking)
- Multiple interface pattern (CLI, RPC, SDK, dashboard, bot)
**Don't take:** "No built-in MCP" philosophy (we want MCP), pi-mono fork specifics

### 10. `gubeizj/Free-Claude-Code` / CoderAgent
**What:** Apache 2.0 coding agent with Ink TUI.
**What to take:**
- Ink-based TUI patterns (for comparison with OpenTUI)
- Streaming tool queue (bounded concurrency)
- Permission system (plan/ask/auto modes)
- Hook system patterns

### 11. `eminent337/aery`
**What:** TypeScript + Rust coding agent. 40+ LLM providers.
**What to take:**
- ACP (Agent Client Protocol) implementation
- Multi-format output (interactive, one-shot, SDK, RPC, ACP)
- Native N-API bindings pattern
- Stats/observability dashboard

### 12. `Lonerider007/aria-agent`
**What:** Python coding agent with verification gates.
**What to take:**
- `verify_goal` pattern (concrete evidence before "done")
- `acceptance_test` pattern (runnable script proves goal works)
- Loop detection (detect repeated failures, pivot)
- `fetch_api_spec` (fetch real docs, don't hallucinate)

### 13. `anthropic-ai/claude-code` (NOT public, but referenced)
**What:** The thing we're building an alternative to.
**What to take:** Nothing from source. Read `claurst/spec/` for behavioral specification only.

---

## Framework References

### 14. `sst/opentui` (9k stars)
**What:** Zig-core terminal UI with React/SolidJS/Vue bindings. Powers opencode.
**What to take:** Our primary TUI framework. Study API docs, component patterns, testing.

### 15. `vadimdemedes/ink` (35k stars)
**What:** React for CLIs. Powers Claude Code, Gemini CLI.
**What to take:** Migration path if OpenTUI fails. React patterns that transfer.

### 16. `honojs/hono` (20k+ stars)
**What:** Ultrafast web framework. Powers opencode's server.
**What to take:** Our server framework. Study middleware, OpenAPI integration.

### 17. `drizzle-team/drizzle-orm` (25k+ stars)
**What:** TypeScript ORM. Powers opencode's storage.
**What to take:** Our database layer. Study schema definitions, migrations.

### 18. `vercel/ai` (30k+ stars)
**What:** AI SDK. Provider abstraction, streaming, tool calling.
**What to take:** Our LLM abstraction layer. Study provider patterns, streaming, structured output.

### 19. `modelcontextprotocol/typescript-sdk` (5k+ stars)
**What:** Official MCP TypeScript SDK.
**What to take:** Our MCP client implementation. Study transport layers, tool schemas.

### 20. `zed-industries/agent-client-protocol`
**What:** Editor-to-agent communication protocol.
**What to take:** Our ACP server implementation. Study JSON-RPC messages, permission routing.

---

## Language & Ecosystem References

### 21. `charmbracelet/bubbletea` (40k stars)
**What:** Go TUI framework. Elm Architecture.
**What to take:** Study for comparison. If we ever need Go components.

### 22. `Textualize/textual` (34k stars)
**What:** Python TUI. CSS-like styling.
**What to take:** Study for comparison. Textual Web (browser deploy) is interesting.

### 23. `ratatui/ratatui` (19k stars)
**What:** Rust immediate-mode TUI.
**What to take:** Study for comparison. If we add Rust native components.

### 24. `SWE-bench/SWE-bench` (5k stars)
**What:** Benchmark for coding agents.
**What to take:** Evaluation dataset references for our eval harness.

### 25. `cordiverse/cordis`
**What:** Plugin kernel. "Spatiotemporal composability." Powers dsh.
**What to take:** Study as architecture inspiration for our plugin kernel evolution.

---

## How to Use This File

When starting a new phase:
1. Check if any repo has a pattern relevant to what you're building
2. Read the specific file/directory mentioned in the "What to take" list
3. Adapt the pattern to our TypeScript/Bun stack
4. Never copy code verbatim — adapt ideas to our architecture
5. Log any architecture decision in DECISIONS_LOG.md
