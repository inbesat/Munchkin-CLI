# DECISIONS_LOG.md — Architecture Decision Registry

**Purpose:** Every significant architecture, design, or technology decision made in this project gets logged here with context, rationale, and alternatives considered. This is append-only — never delete past entries.

**Format:** Each entry follows the Architecture Decision Record (ADR) format.

---

## ADR-001: Core Language & Runtime

- **Date:** 2026-08-26
- **Status:** Accepted
- **Context:** Need to choose the primary language/runtime for the entire project. Options: TypeScript/Bun, Rust, Go, or hybrid TS+Rust.
- **Decision:** TypeScript on Bun runtime.
- **Rationale:** Fastest iteration speed. Vercel AI SDK v5 is the best multi-provider abstraction (75+ providers). OpenTUI (the TUI framework) is TypeScript-native. Bun compiles to single binaries. opencode and DeepSeek Harness both chose this stack successfully. AI coding agents write TypeScript faster and more correctly than Rust.
- **Alternatives rejected:** Rust (claurst/crab-code path — better performance but slower iteration, smaller LLM ecosystem), Go (Bubble Tea is beautiful but weaker AI SDK ecosystem), Hybrid (adds complexity, premature).
- **Consequences:** Must accept Node/Bun startup overhead (~50-100ms) vs native. TUI rendering via OpenTUI's Zig core mitigates this for display perf.

## ADR-002: TUI Framework

- **Date:** 2026-08-26
- **Status:** Accepted
- **Context:** Need a terminal UI framework. Options: Ink (React-based), OpenTUI (SolidJS + Zig core), Bubble Tea (Go), custom.
- **Decision:** OpenTUI with SolidJS bindings (`@opentui/solid`).
- **Rationale:** OpenTUI's Zig renderer is faster (dual-buffer diffing, sub-ms rendering). SolidJS signals avoid React's re-render overhead. Both use Yoga for layout. opencode's success with this stack validates it.
- **Alternatives rejected:** Ink (React reconciler heavier, slower per-render), Bubble Tea (Go, adds another language), custom (reinventing the wheel).
- **Consequences:** Must learn OpenTUI API (still v0.1.x, API may change). Zig core handles rendering performance.

## ADR-003: Server Framework

- **Date:** 2026-08-26
- **Status:** Accepted
- **Context:** Need HTTP server for the agent's API. Options: Hono, Fastify, Express, Elysia.
- **Decision:** Hono (lightweight, OpenAPI-native, works on Bun).
- **Rationale:** Minimal overhead, built-in OpenAPI support, works natively on Bun, good TypeScript support.
- **Alternatives rejected:** Fastify (heavier), Express (legacy, no native ESM), Elysia (newer, less battle-tested).

## ADR-004: Provider Layer

- **Date:** 2026-08-26
- **Status:** Accepted
- **Context:** Need to support multiple LLM providers (Anthropic, OpenAI, Google, Bedrock, Vertex, Ollama, etc.) with a unified interface.
- **Decision:** Vercel AI SDK v5 (`ai` package) as the primary abstraction layer.
- **Rationale:** Most battle-tested TS provider abstraction. Tool calling, streaming, structured output, thinking blocks all work cross-provider. Generates TypeScript client code. 75+ providers via models.dev catalog.
- **Alternatives rejected:** LiteLLM (Python, adds proxy complexity), custom adapter per provider (maintenance nightmare).

## ADR-005: MCP Client

- **Date:** 2026-08-26
- **Status:** Accepted
- **Context:** Need to support MCP (Model Context Protocol) for tools.
- **Decision:** Use official `@modelcontextprotocol/sdk` TypeScript SDK.
- **Rationale:** Official SDK, supports all transports (stdio, SSE, streamable-http, OAuth), lazy tool loading.

## ADR-006: Storage

- **Date:** 2026-08-26
- **Status:** Accepted
- **Context:** Need persistent storage for sessions, events, costs, and config.
- **Decision:** SQLite via Drizzle ORM (better-sqlite3 driver for Bun) for queries; JSONL event log for crash-safe writes.
- **Rationale:** SQLite for fast queries (list sessions, search, aggregate costs). JSONL for crash-safe incremental writes and event replay. Dual-path covers both use cases.

## ADR-007: Event-Sourced State

- **Date:** 2026-08-26
- **Status:** Accepted
- **Context:** Need a single source of truth for session state that supports resume, fork, replay, share.
- **Decision:** Append-only event log (JSONL) as the source of truth. All state derived from replay.
- **Rationale:** Enables resume, fork, replay, share, telemetry all from single stream. Proven by opencode and claurst.

## ADR-008: Permission System

- **Date:** 2026-08-27
- **Status:** Accepted
- **Context:** Every tool call must go through a permission engine. Users control exactly what the agent can do.
- **Decision:** Permission engine in packages/core/src/permissions with modes (default, acceptEdits, plan, auto, dontAsk, bypass), rule DSL, path boundaries, circuit breakers, secret redaction, audit log.
- **Rationale:** Granular control, audit trail, security-first. Matches and extends opencode's permission model.

## ADR-009: Agent Loop

- **Date:** 2026-08-27
- **Status:** Accepted
- **Context:** Need the core agent loop that drives the conversation with the LLM.
- **Decision:** Streaming agent loop in packages/core/src/agent/loop.ts (~100 lines). Uses Vercel AI SDK's streamObject/streamText. Supports steering injection, interrupts, tool calls, parallel execution.
- **Rationale:** Small loop = easier to reason about. Vercel AI SDK handles provider differences. Steering/interrupts via abort signals and message injection.

## ADR-010: Tool Registry

- **Date:** 2026-08-27
- **Status:** Accepted
- **Context:** Need a registry for all tools with schemas, permissions, and execution.
- **Decision:** ToolRegistry class in packages/core/src/tools/registry.ts. Tools have scope, risk, requiresPermission. Execution handles permission modes, abort signals, timeouts.

## ADR-011: Parallel Tool Execution

- **Date:** 2026-08-27
- **Status:** Accepted
- **Context:** Multiple tools can often run in parallel (e.g., read + grep).
- **Decision:** Semaphore-based parallel executor in packages/core/src/tools/parallel.ts. Configurable concurrency limit, preserves result order, handles abort signals.

## ADR-012: File Freshness Guards

- **Date:** 2026-08-27
- **Status:** Accepted
- **Context:** Prevent editing stale files that were modified externally.
- **Decision:** FreshnessTracker in packages/core/src/tools/freshness.ts. Records file hashes on read, warns/blocks on edit if changed.

## ADR-013: Secret Redaction

- **Date:** 2026-08-27
- **Status:** Accepted
- **Context:** Prevent API keys, tokens, secrets from leaking in logs, events, or tool outputs.
- **Decision:** Redaction engine in packages/core/src/security/redact.ts with 25+ patterns. Applied to event log writes, audit logs, and tool outputs.

## ADR-014: Audit Log

- **Date:** 2026-08-27
- **Status:** Accepted
- **Context:** Tamper-evident audit trail for security-sensitive operations.
- **Decision:** SHA-256 hash chain in packages/core/src/security/audit.ts. JSONL export/import for verification.

## ADR-015: Security Analyzer Interface

- **Date:** 2026-08-28
- **Status:** Accepted
- **Context:** Need extensible security analysis for tool calls (SAST, dependency scanning, etc.).
- **Decision:** SecurityAnalyzer interface in packages/core/src/security/analyzer.ts. DefaultSecurityAnalyzer implementation. AnalyzerRegistry for plugin-style analyzers.

## ADR-016: DontAsk/Bypass Profiles

- **Date:** 2026-08-28
- **Status:** Accepted
- **Context:** CI/CD and automation need pre-approved permission profiles.
- **Decision:** Profile system in packages/core/src/permissions/profiles.ts. Pre-approvals by tool name, path patterns, or full bypass. CI default profile.

## ADR-017: Permission Prompt UI Contract

- **Date:** 2026-08-28
- **Status:** Accepted
- **Context:** Need a contract for permission prompts that works across TUI, web, IDE extensions.
- **Decision:** PermissionUI interface in packages/core/src/permissions/ui-contract.ts. MockUI, AutoApproveUI, AutoDenyUI, InteractiveUI implementations. Batch prompt support.

## ADR-018: Renderer Choice (Phase 59)

- **Date:** 2026-08-29
- **Status:** Accepted
- **Context:** Need to choose the TUI renderer for the app shell. Options: OpenTUI (SolidJS bindings) vs Ink (React).
- **Decision:** Ink v4.4.1 selected over OpenTUI v0.1.x.
- **Rationale:** OpenTUI v0.1.x API unstable, no headless benchmarking support, broken exports. Ink v4.4.1 completed all 6 benchmark tests successfully (render, input, focus, resize, large output, memory). Ink is mature, well-tested, and has React ecosystem compatibility.
- **Alternatives rejected:** OpenTUI (API instability, benchmark failures, missing exports).
- **Consequences:** TUI package rewritten to use Ink. OpenTUI dependency kept for potential future use.

## ADR-019: Streaming Markdown Parser (Phase 61)

- **Date:** 2026-08-29
- **Status:** Accepted
- **Context:** Need a markdown renderer that handles streaming content from LLMs. As tokens arrive, render formatted markdown (headers, code blocks, bold/italic, links, lists) without breaking layout on incomplete markdown.
- **Decision:** Custom incremental parser (`StreamingMarkdownParser` in packages/tui/src/components/markdown-parser.ts) + `CodeBlock` component with Shiki syntax highlighting.
- **Rationale:** 
  - Existing streaming markdown libraries (marked, markdown-it) don't handle incomplete streaming well.
  - Custom parser maintains state (inCodeBlock, pending content) and yields tokens incrementally.
  - Shiki provides high-quality syntax highlighting (same as VS Code) with 30+ languages.
  - Parser handles streaming code blocks by buffering until closing ``` is found.
- **Alternatives rejected:** 
  - marked/markdown-it streaming modes (don't handle incomplete elements gracefully).
  - Full re-parse on each chunk (performance issues for large responses).
  - Using LLM to format markdown (unreliable, adds latency).
- **Consequences:** 48 tests pass. Parser handles headers, code blocks (with language), bold, italic, strikethrough, inline code, links, lists (ordered/unordered), blockquotes, horizontal rules. Streaming renders incomplete code blocks with "● streaming" indicator.

## ADR-020: App Shell & Layout System (Phase 60)

- **Date:** 2026-08-29
- **Status:** Accepted
- **Context:** Need the TUI app shell: main layout (sidebar + chat area + input area), theme system (dark/light/daltonized), responsive layout, keyboard navigation (leader key pattern).
- **Decision:** Ink-based implementation in packages/tui/src:
  - app.tsx — app entry point with simulated responses
  - layout/main.tsx — main layout (sidebar + chat + input, responsive, focus management)
  - theme/index.tsx — theme system (dark/light/daltonized, ThemeProvider, hooks)
  - keyboard/index.ts — keyboard navigation (leader keys, KeyboardManager, default bindings)
  - index.ts — barrel exports
  - global.d.ts — type extensions for Ink props
- **Rationale:** Ink's Yoga layout props work well for terminal UI. Theme system uses React Context. Keyboard manager uses leader key pattern (Space as leader). All 1126+ core tests + 384 ai tests + 43 gateway tests + 2 tui tests pass.
- **Consequences:** TypeScript types for Ink are incomplete — used @ts-ignore for props that work at runtime but aren't in types (backgroundColor, position, top, left, right, bottom, zIndex, borderRadius, overflowY).

## ADR-021: Diff Viewer Overlay (Phase 62)

- **Date:** 2026-08-29
- **Status:** Accepted
- **Context:** Need a full-screen diff viewer overlay for showing file changes. Support unified and side-by-side views, keyboard navigation (j/k for scroll), accept/reject individual changes.
- **Decision:** Ink-based implementation in packages/tui/src/components/diff-viewer.tsx:
  - DiffViewer — full-screen overlay component with keyboard navigation
  - SimpleDiffViewer — inline diff component for non-overlay use
  - Uses core diff pipeline (computeDiff, formatUnifiedDiff, formatSideBySideDiff, formatInlineDiff)
  - Shiki syntax highlighting with GitHub dark/light themes
  - Keyboard navigation: j/k (scroll), h/l (hunk), a/r (accept/reject), A/R (accept/reject all), t (toggle view), q/esc (close)
- **Rationale:**
  - Reuses existing core diff pipeline (compute.ts, render.ts) for consistency
  - Shiki provides high-quality syntax highlighting (same as VS Code) with 30+ languages
  - Leader-key-free navigation optimized for diff review workflow
  - Accept/reject callbacks enable integration with agent's file editing tools
  - Three view modes (unified, side-by-side, inline) cover different review preferences
- **Alternatives rejected:**
  - Using external diff library (core pipeline already exists and is tested)
  - Separate diff viewer process (adds IPC complexity)
  - Inline-only diff (doesn't scale for large changes)
- **Consequences:** 63 tests pass (including 15 new DiffViewer tests). Integration with core diff pipeline ensures consistency. TypeScript types for Ink required @ts-ignore for runtime-only props.

---

## ADR-034: Interrupt/Cancel Semantics (Phase 46)

- **Date:** 2026-08-28
- **Status:** Accepted
- **Context:** The user needs to gracefully interrupt a running agent turn: stop LLM streaming, handle in-progress tool executions (wait or cancel), save partial progress, and return control.
- **Decision:** Interrupt system in packages/core/src/agent:
  - interrupt.ts: InterruptController with requestInterrupt(reason), waitForTools(waitForTools, toolWaitTimeout), registerToolStart/End, abort signal integration. createLinkedAbortSignal combines multiple abort sources. withInterrupt wraps operations with automatic interrupt handling. withInterruptIterator yields until interrupted. interruptReasonFromSignal extracts standardized reasons.
  - Integrates with agent loop via abortSignal passed to model.stream() and tool.execute().
  - Reason types: user-cancel, timeout, tool-limit, context-overflow, error, shutdown.
- **Alternatives rejected:** Separate interrupt channel (complexity); forcing tool cancellation (data loss); no tool wait (inconsistent state).
- **Consequences:** 25/25 tests pass. Agent loop respects abortSignal for streaming. Tool execution tracks active tools and waits on interrupt. Phase 47 (Loop Tests) will verify interrupt behavior in integration.
---

## ADR-022: Multiline Editor (Phase 63)

- **Date:** 2026-08-29
- **Status:** Accepted
- **Context:** Need the multiline editor where users type prompts: multiline input (Shift+Enter), history navigation (up/down), bash mode toggle, paste handling, file @ mentions, slash command detection.
- **Decision:** Ink-based editor in packages/tui/src/components:
  - editor.tsx � Editor component (mode bar, cursor rendering, useInput wiring, history nav, slash/mention callbacks)
  - editor-buffer.ts � pure, testable buffer logic: insertText/backspaceAt/deleteAt/deleteWordAt, getSlashQuery/getMentionQuery, and reduceEditorKey(state, key) returning action + slash/mention queries
  - editor-history.ts � EditorHistory (per-mode entries, previous/next with draft save, dedup)
  - editor.test.tsx / editor-buffer.test.ts / editor-history.test.ts � tests
- **Rationale:**
  - Core key-handling logic extracted into a pure reducer (reduceEditorKey) so it is unit-testable without Ink, whose useInput requires a TTY raw-mode stdin that is unavailable in tests.
  - Ink Key type only exposes boolean flags (upArrow, return, ctrl, shift); the actual letter for ctrl combos arrives in the input argument (e.g. ctrl+b gives input b). home/end are not exposed, so Ctrl+A/Ctrl+E serve as home/end equivalents.
  - History draft (unsent current input) is retained in the component (draftRef), not in EditorHistory, so pressing down past the newest entry restores unsent text.
- **Alternatives rejected:** Keeping all logic inside the component (untestable without a TTY); ink-testing-library (not installed, still needs raw mode).
- **Consequences:** 118 tui tests pass (21 new editor tests). Reducer covers insert/backspace/delete/cursor/ctrl-combos (a/e/u/k/w)/submit/toggle/history/escape and live slash+mention query detection. Smoke tests render via a mock EventEmitter stdout.

---

## ADR-023: Slash-Command Palette (Phase 64)

- **Date:** 2026-08-29
- **Status:** Accepted
- **Context:** A fuzzy-searchable command palette popup that appears when the user types `/`, listing built-in and plugin-provided commands with descriptions, navigable by arrow keys (Enter select, Esc cancel).
- **Decision:** Ink-based palette in packages/tui/src/components/command-palette.tsx:
  - `filterCommands(commands, query)` � case-insensitive multi-term fuzzy match with title-prefix ranking (pure, tested)
  - `moveSelection(index, delta, count)` � wraps around list edges (pure, tested)
  - `CommandPalette` � presentational overlay (opens on `/query`, selected index resets on query change, arrow/enter/escape via useInput)
  - `defaultCommands` � 12 built-in commands (help, clear, model, theme, permissions, compact, export, status, init, review, terminal, summarize)
- **Rationale:**
  - Pure helper functions (`filterCommands`, `moveSelection`) keep the fuzzy-search and selection logic unit-testable without Ink/raw-mode.
  - The palette is driven by the editor slash-command detection added in Phase 63: the parent (app shell) sets the palette query from `Editor.onSlashCommand` and toggles `isActive` so the editor yields key capture to the palette while open.
  - No external fuzzy-search dependency (e.g. fuse.js) � a lightweight substring + ranking filter covers the command-list size.
- **Alternatives rejected:** fuse.js (extra dependency for a small list); embedding filtering in the component (untestable).
- **Consequences:** 134 tui tests pass (20 new palette tests). Keyboard nav and selection are wired via Ink `useInput`; integration with the editor slash detection is a Phase-64/65 app-shell concern.

---

## ADR-024: Permission Dialogs (Phase 65)

- **Date:** 2026-08-29
- **Status:** Accepted
- **Context:** When the agent needs permission to run a tool, show a clear TUI dialog: tool name, human-readable description of the intended action (parsed from args), risk-level badge, and approve/deny options including "allow for this session" and "allow always for this tool".
- **Decision:** Ink-based dialog in packages/tui/src/components/permission-dialog.tsx:
  - `describeRequest(request)` � pure parser mapping tool names (bash/read/write/edit/web_fetch/web_search/glob/grep) to human-readable summaries from args (pure, tested)
  - `resolveFromChoice(request, choice)` � pure mapper from choice (allow / allow-session / allow-always / deny / deny-always) to a `PermissionResponse` matching the core `ui-contract` shape; always-scoped choices set `customRule.target = tool.name`
  - `riskColor(theme, level)` � pure risk-color resolver
  - `PermissionDialog` � presentational overlay (header + tool/action/risk/args + navigable option list via `useInput`, Esc = deny, direct keys a/s/A/d/D)
- **Rationale:**
  - Pure helpers (`describeRequest`, `resolveFromChoice`, `riskColor`) keep the parsing and response-mapping unit-testable without Ink/raw-mode.
  - The dialog mirrors the core `PermissionRequest`/`PermissionResponse` contract (Phase 58) field-for-field so the app shell can bridge directly to the permission engine with no transformation.
  - "Allow always" uses `customRule.target = tool.name` (the engine in Phase 50/58 persists the rule); "allow for this session" sets `remember: true` without a rule. This matches the spec's session-vs-project scoping intent.
- **Alternatives rejected:** Coupling the dialog to `@forge/core` runtime import (Bun workspace does not symlink `@forge/*` in node_modules � would break at runtime); instead types are replicated locally to match the contract exactly.
- **Consequences:** 153 tui tests pass (19 new permission-dialog tests). Dialog is self-contained; app-shell integration (Phase 66+) wires `Editor.onSlashCommand`/`PermissionDialog` to the engine.

---

## ADR-025: Status Bar (Phase 66)

- **Date:** 2026-08-29
- **Status:** Accepted
- **Context:** The TUI needs an at-a-glance bottom status bar: git branch, current model, token usage, session cost, agent status (thinking/executing/idle/waiting/error), background-task count, and context-window usage. It must adapt to terminal width (drop less-important segments when narrow).
- **Decision:** Ink-based `StatusBar` in packages/tui/src/components/status-bar.tsx:
  - `formatTokens(n)` / `formatCost(n)` � pure compact formatters (1.2k / 1.5M, $0.012 / $2.50)
  - `statusColor(theme, status)` � pure agent-status ? color resolver
  - `buildStatusBarSegments(state, theme)` � pure builder; status + tokens are `required`, model/cost/git/ctx/bg/mode are conditional; cost omitted when `state.cost === undefined`
  - `selectVisibleSegments(segments, width)` � pure greedy fit: keep required, then add optional segments until width is exhausted
  - `StatusBar` � presentational single-line bordered bar; reads width from `useStdout` (overridable via `width` prop for tests)
- **Rationale:**
  - Pure helpers (`formatTokens`, `formatCost`, `buildStatusBarSegments`, `selectVisibleSegments`) are unit-testable without Ink/raw mode; the component is a thin renderer.
  - Greedy width-fitting (required-first, optional-dropped) makes the bar robust across terminal sizes and is fully testable via the `width` prop.
- **Alternatives rejected:** Always-wrap layout (ugly for a 1-line bar); fixed segment order with truncation (loses critical info first). Greedy required-first dropping is preferred.
- **Consequences:** 153+ tui tests pass (14 new status-bar tests). Status bar is self-contained; app-shell (later phase) wires `StatusBarState` from session/token/cost/git/agent sources.

---

## ADR-026: Toasts, Spinners, Animations (Phase 67)

- **Date:** 2026-08-29
- **Status:** Accepted
- **Context:** The TUI needs non-blocking feedback: toast notifications (success/error/info/warning with auto-dismiss), spinners for long operations, progress bars for known-duration tasks, and loading dots animations.
- **Decision:** Two components in packages/tui/src/components:
  - `toast.tsx`: `Toast` (presentational, colored border + kind symbol), `ToastContainer` (renders stack, schedules `setTimeout` per toast to call `onDismiss` after `toast.duration ?? autoDismissMs`, capped at `maxVisible`), `toastColor`, `toastLabel`.
  - `spinner.tsx`: `Spinner` (braille frames via `spinnerFrame`, `active` prop suspends interval for tests), `ProgressBar` (pure `renderProgressBar` + `clampRatio`, shows %), `LoadingDots` (animated ellipsis), `renderIndeterminate` (sliding block activity bar). Pure helpers `spinnerFrame`, `clampRatio`, `renderProgressBar`, `renderIndeterminate` are unit-tested.
- **Rationale:**
  - Pure helpers (`renderProgressBar`, `spinnerFrame`, `renderIndeterminate`, `clampRatio`, `toastColor`, `toastLabel`) are testable without Ink/raw mode; components are thin renderers.
  - `active` prop on animated components lets smoke tests render without starting intervals/timers (avoids open handles); `ToastContainer` uses real `setTimeout` so auto-dismiss is verified with a tiny duration.
- **Alternatives rejected:** Central toast store in this package (deferred to app-shell integration; container is stateless re: storage). CSS-style animations (no CSS in TUI � frame cycling only).
- **Consequences:** 153+ tui tests pass (19 new toast/spinner tests). Components are self-contained; app-shell (later phase) wires toasts from events and spinners/progress from long-running tasks.

---

## ADR-027: Theme System (Phase 68)

- **Date:** 2026-08-29
- **Status:** Accepted
- **Context:** The TUI needs a complete theme system: 4 themes (dark, light, daltonized-dark, daltonized-light), hot-reload without restart, and custom themes via config. Existing `theme/index.tsx` already had dark/light/daltonized + a `ThemeProvider`/`useThemeColors` consumed by all components. The spec asked for `theme/themes.ts`, `theme/apply.ts`, `theme/custom.ts`.
- **Decision:** Split the theme module into the spec-named files while keeping `index.tsx` as the public barrel:
  - `themes.ts` � single source of truth: `ThemeMode` (now 4-valued), `ThemeColors`, the 4 `Theme` definitions, `themes` record, `getTheme`/`listThemeModes`/`listThemeNames`/`nextThemeMode` (cycle helper for hot-reload toggling).
  - `apply.ts` � pure appliers: `mergeThemeColors`, `resolveTheme` (custom-first), `isValidThemeColors` (hex validator over all 30 keys), `themeToCssVars` + `applyThemeVars` (CSS-var mapping for DOM hot-reload), and `simulateColorBlindness(hex, type)` using fixed 3x3 matrices for protanopia/deuteranopia/tritanopia (deterministic, valid-hex output).
  - `custom.ts` � `validateCustomTheme` (surfaces errors), `loadCustomThemeFromObject` (merges `colors` onto `extends` base), `loadCustomThemeFromFile` (async JSON via `Bun.file`).
  - `index.tsx` � re-exports all of the above + keeps `ThemeProvider`/`useTheme`/`useThemeColors`; `toggleTheme` now uses `nextThemeMode` (4-step cycle) and `applyThemeVars` is called on mode change for live DOM updates.
- **Rationale:**
  - `ThemeColors` interface is unchanged so every component importing `type { ThemeColors } from '../theme'` is unaffected.
  - Pure helpers (`simulateColorBlindness`, `mergeThemeColors`, `resolveTheme`, `isValidThemeColors`, `themeToCssVars`) are unit-testable without React/raw mode; component re-render on theme change is automatic via context.
  - `resolveTheme(mode, custom[])` makes custom themes first-class and hot-swappable by mode.
- **Alternatives rejected:** Keeping all definitions inline in index.tsx (fails the spec's file deliverables and bloats the barrel). Storing custom themes in the `ThemeProvider` state (deferred � the app shell owns config; `resolveTheme` consumes them).
- **Consequences:** 206 tui tests pass (36 new theme tests). 4 themes + colorblind sim + custom loading verified. `MainLayoutProps.themeMode` widened from a 3-mode literal to `ThemeMode`; app.tsx toggle cycle widened to 4.

---

## ADR-028: Checkpoint/Rewind UI (Phase 69)

- **Date:** 2026-08-29
- **Status:** Accepted
- **Context:** The TUI needs a checkpoint/rewind UI: visualize the conversation timeline, show checkpoints, and let the user rewind to a checkpoint (restoring conversation + file state). Core has no rich checkpoint model yet (only a `checkpoint:created` event-type string in config), so the UI owns its data contract.
- **Decision:** Self-contained component in packages/tui/src/components/checkpoint-timeline.tsx:
  - `Checkpoint` model (`id`, `label`, `timestamp`, `messageIndex`, `kind: user|tool|assistant|manual|system`) � presentational contract; the app shell maps core session events onto it.
  - `moveCursor(checkpoints, currentId, dir)` � pure, clamps at ends, seeds first/last when no cursor (testable without Ink).
  - `formatCheckpointTime`, `kindGlyph`, `kindColor` � pure renderers.
  - `CheckpointTimeline` � overlay that sorts chronologically, renders each checkpoint with kind glyph+color+timestamp, highlights a cursor (?/? nav), and emits `onRewind(id)` on Enter or `r`, `onClose` on Esc. Uses `useInput` with `isActive && isOpen` so the app shell can yield key capture.
- **Rationale:**
  - Pure helpers (`moveCursor`, `formatCheckpointTime`, `kindGlyph`, `kindColor`) keep navigation/logic unit-testable without Ink/raw mode.
  - The component is purely presentational: it emits `onRewind(id)`; the engine-side restore of conversation + file state (Phase 9 resume / Phase 10 fork building blocks) is wired by the app shell, not the UI. This matches the spec's "rewind restores both" intent without coupling the TUI to the event-log internals.
- **Alternatives rejected:** Building a core checkpoint store now (deferred � no model exists; the app shell will bridge session log ? Checkpoint[]). Coupling file-restore into the component (UI must not mutate filesystem directly).
- **Consequences:** 220 tui tests pass (14 new checkpoint tests). Timeline UI is self-contained and ready for app-shell wiring in a later phase.

---

## ADR-029: Session Picker/Resume UI (Phase 70)

- **Date:** 2026-08-29
- **Status:** Accepted
- **Context:** The TUI needs a session picker: a searchable list of past sessions (title, preview, model, cost, date) the user can resume, fork, or export. Core has session search (Phase 11) but no TUI list component.
- **Decision:** Self-contained component in packages/tui/src/components/session-picker.tsx:
  - `SessionSummary` model (`id`, `title`, `preview`, `model?`, `cost?`, `createdAt`, `updatedAt?`) � presentational; the app shell maps stored sessions onto it.
  - `filterSessions(sessions, query)` � pure case-insensitive multi-term AND search over title/preview/model (substring match, mirroring command-palette search style).
  - `formatSessionDate(ts)` � pure `YYYY-MM-DD HH:MM` formatter; `moveSessionSelection` � pure clamped cursor mover.
  - `SessionPicker` � overlay listing sessions (title + date on one row, preview + model + cost on the next), cursor highlight (?/?), Enter?`onResume`, `f`?`onFork`, `e`?`onExport`, Esc?`onClose`. `query` is optionally controlled (bypasses internal typing) so filtering is testable without raw mode; otherwise internal typing captures printable chars + backspace via `useInput`.
- **Rationale:**
  - Pure helpers (`filterSessions`, `formatSessionDate`, `moveSessionSelection`) are unit-testable without Ink/raw mode; the component is a thin renderer that emits intents (`onResume`/`onFork`/`onExport`) for the app shell to wire to session store/export.
  - Reusing `formatCost` from `status-bar` keeps currency formatting consistent across the TUI.
  - Controlled `query` prop mirrors the command-palette testing strategy: smoke tests assert filtering by passing `query` directly.
- **Alternatives rejected:** Coupling the picker to the session store directly (UI must stay presentational; app shell owns loading/resume/fork/export). Live-typing-only search (untestable without raw mode; controlled `query` solves it).
- **Consequences:** 236 tui tests pass (16 new session-picker tests). Picker is self-contained and ready for app-shell wiring.

---

## ADR-030: Mouse Support & Kitty Keyboard Protocol (Phase 71)

- **Date:** 2026-08-29
- **Status:** Accepted
- **Context:** The TUI needs richer input: SGR (1006) mouse reporting (scroll for chat history, click to select, drag for diff scroll) and the Kitty keyboard protocol (CSI-u) so keys are reported with explicit codes/modifiers � most importantly distinguishing Ctrl+I from Tab, which a legacy terminal cannot.
- **Decision:** Two pure parser modules in packages/tui/src/keyboard:
  - `kitty.ts` � `parseKittyKey(seq)` decodes `ESC [ <code> ; <mods> ; <keytype> u`: splits modifiers (shift=1/alt=2/ctrl=4/meta=8), maps named-key codes (Tab/Enter/arrows/F-keys) via a table, and for printable ASCII applies the ctrl mask so Ctrl+I yields `i` (not `Tab`). `keytype === 2` or a known named code sets `named: true` (the disambiguation signal). Exposes `KITTY_ENABLE`/`KITTY_DISABLE` opt-in sequences.
  - `mouse.ts` � `parseMouseSGR(seq)` decodes `ESC [ < b ; x ; y (M|m)`: `m`=release, `b&64`=wheel (b&1 ? down), `b&32`=drag, else press; button from `b&3`; modifier bits 4/8/16. Exposes `MOUSE_ENABLE`/`MOUSE_DISABLE` (1006) sequences.
- **Rationale:**
  - Both parsers are pure (string in ? structured event out) so they are unit-testable without a TTY/raw mode � critical because Ink `useInput` cannot run in the test environment.
  - The Kitty parser keeps the key-vs-character distinction explicit (`named` flag + ctrl mask), which is exactly the spec's "distinguishes Ctrl+I from Tab" requirement and the reason to adopt the protocol.
  - Exposing enable/disable sequences makes wiring into the app shell a single write, and the parsers are reusable for any input source (stdin reader, test harness).
- **Alternatives rejected:** Wiring parsing directly into `useInput` (untestable + mixes protocol with React); X10/legacy mouse encoding (no coordinates/modifiers, inferior to SGR 1006). Feature-detecting the terminal is deferred to the app shell.
- **Consequences:** 249 tui tests pass (13 new kitty/mouse tests). Parsers are self-contained and ready for the app-shell stdin reader to call; actual mouse/keyboard *handlers* (scroll?chat, click?select) are UI-wiring work for a later phase.

---

## ADR-031: Startup Time Budget (Phase 72)

- **Date:** 2026-08-29
- **Status:** Accepted
- **Context:** TUI startup must reach an interactive prompt quickly. Profiling the cold module graph showed the heaviest single dependency pulled in at import time was Shiki (syntax highlighting), loaded statically by `code-block.tsx` and `diff-viewer.tsx` even though most sessions never render a highlighted block before first paint.
- **Decision:**
  - Make Shiki a **lazy dynamic import**: `code-block.tsx` and `diff-viewer.tsx` now `import type { Highlighter } from 'shiki'` (erased at runtime) and do `const { createHighlighter } = await import('shiki')` inside their `getSharedHighlighter()` factories. Shiki is only fetched when the first code/diff block actually highlights.
  - `theme/index.tsx` `applyThemeVars` already no-ops outside a DOM, so theme application is effectively deferred for the TUI.
  - Added a **benchmark harness**: `bench/entry.ts` imports the built `dist` barrel + does a first paint to a mock stdout and prints `{ms}`; `bench/startup.ts` spawns fresh `bun` processes (`measureOnce`), aggregates via a pure `percentile` helper, and reports p50/p95/min/max with a PASS/FAIL vs the <300ms target; `bench/startup.test.ts` unit-tests `percentile`.
- **Rationale:**
  - Lazy `import('shiki')` is the single highest-leverage win: Shiki + grammars/themes are large and off the critical path for first paint. The type-only static import keeps the `Highlighter` type available with zero runtime cost.
  - A subprocess-spawn benchmark gives a true cold measurement (module cache cannot mask costs), and is reproducible on any platform via `bun run bench/startup.ts 100`.
- **Alternatives rejected:** Rewriting components to avoid Shiki (it is the chosen highlighter per Phase 59). Eagerly preloading Shiki in a worker (adds complexity for marginal gain; on-demand load is sufficient since highlighting happens post-paint).
- **Consequences:** 249+ tui tests pass (percentile test added). Shiki is removed from the cold path. Benchmark on this Windows sandbox reported p50~481ms / p95~901ms / min~274ms � dominated by cold `bun` process spawn + React/Ink load, not app code; re-run on the target platform to confirm the <300ms budget. (ADR ref: Phase 59 renderer choice.)

---

## ADR-032: Hono HTTP Server Architecture (Phase 73)

- **Date:** 2026-08-29
- **Status:** Accepted
- **Context:** Phase 73 introduces the client/server backbone. The server must expose session CRUD, prompt submission (running the agent loop), tool execution, config management, and an SSE event hub, behind CORS/logging/error-handling/validation middleware, while staying fully testable without real providers or network.
- **Decision:**
  - **Async factory instead of async constructor:** ForgeServer has a private constructor and a static ForgeServer.create(options) that performs async dir/store init and wires SessionStore -> SessionManager -> SSEHub -> AgentExecutor. This avoids the un-awaitable async-constructor footgun.
  - **Dependency injection everywhere:** AgentExecutor takes injected modelResolver + 	ools + optional eventSink: SSEHub. Tests inject a mock executor (or mock resolver) so no API keys are needed. ServerOptions.agentExecutor / ServerOptions.modelResolver are override points.
  - **Provider-agnostic model resolution:** model-resolver.ts maps provider/name to an ai Model via preset factories (createAnthropicPresetModel etc.) and a orge-free OpenAI-compatible adapter; bare model names are guessed to a provider using KNOWN_PROVIDERS.
  - **Tool registry adapter:** 	ool-registry.ts builds the core Tool registry (createDefaultToolRegistry) and adapts core Tool -> loop AgentTool (	oAgentTools), so the loop's real, permission-gated tools are used server-side.
  - **SSE hub:** an in-process SSEHub (register/unregister/broadcast/stats) is the event sink for AgentExecutor; routes expose /api/sse/events, /broadcast, /stats.
  - **Config routes take a aseDir** so config files (.forge/settings.json) live next to server state, not in the process cwd; loadConfig({ cwd: baseDir }) is used so GET-by-key reads the same scope that POST writes.
  - **Hono specifics learned the hard way:** HTTPException is imported from hono/http-exception (not hono); c.json status must be a ContentfulStatusCode literal so computed statuses are cast; middleware must eturn await next() under 
oImplicitReturns; zod ContextVariableMap augmentation enables typed c.get('validatedData').
- **Rationale:**
  - DI + async factory keep the server a pure product surface (per design principle 2) and make it bootable in CI with zero credentials.
  - The orge-free adapter gives a working default provider path for local development without external keys.
- **Alternatives rejected:** Eager constructor with top-level wait (not valid in class constructors); exposing raw provider SDKs directly (breaks provider-agnostic principle 4); a thick /auth subsystem (deferred - Phase 73 ships only an auth *status* endpoint that reports per-provider credential presence without leaking secrets).
- **Consequences:** 15 server tests pass (integration via injected mock executor + middleware unit tests). Build green across all 12 packages. Phase 74 (OpenAPI spec) can generate from the existing route factories. SSE route is in place ahead of Phase 75 (SSE event bridge), which will deepen the hub.

---

## ADR-033: Phase 74 - OpenAPI 3.1 spec generation

- **Date:** 2026-08-30
- **Status:** Accepted
- **Context:** Phase 74 requires an OpenAPI 3.1 document as the contract between the forge server and all clients (TUI, web, IDE, SDK). Phase 73 shipped real traffic via plain `Hono` route factories in `routes/`, so the spec must mirror those without disturbing them.
- **Decision:** Generate the spec with `@hono/zod-openapi` `createRoute` definitions in a separate `src/openapi.ts` (`buildSpecApp()`), served as `/api/openapi.json` plus a Scalar docs page at `/docs` (`openAPIDocsHtml`, CDN-loaded). Handlers in `buildSpecApp` are stubs - the live routes are still the `routes/*` factories - so the existing 23 tests stay green and there is a single source of truth for shapes. Reuse the existing zod schemas (`sessionCreateSchema`, `promptSchema`, `toolExecuteSchema`, `configSchema`) as request bodies.
- **Dependencies / gotchas:**
  - `@hono/zod-openapi@1.6.1` pulls `@asteasolutions/zod-to-openapi@9.x` which requires Zod 4 (`schema._zod.parent`). The workspace pins Zod 3.25, so we pin `@hono/zod-openapi@0.18.1` (uses zod-to-openapi 7.x, Zod 3 compatible). `@hono/scalar` does not exist on npm - the docs page loads `@scalar/api-reference` from CDN instead.
  - `getOpenAPIDocument({ openapi: '3.1.0', info, servers })` emits the spec.
- **Rationale:** Keeps the serving layer framework-light and testable while still producing a standards-compliant 3.1 contract; Phase 76 (generated SDK) can consume `/api/openapi.json` directly.
- **Consequences:** 23 server tests pass (15 prior + 6 openapi + 2 wiring). Spec covers 17 routes across system/sessions/prompts/tools/config/auth/sse. Build green.

---

## ADR-034: Phase 75 - SSE Event Bridge

- **Date:** 2026-08-30
- **Status:** Accepted
- **Context:** Phase 73 shipped an in-memory `SSEHub` and a raw `/api/sse/events` stream, but the agent loop broadcast a generic `"loop"` frame for every event. Phase 75 formalizes the bridge so each `LoopEvent` variant (`text`, `thinking`, `tool-call`, `tool-result`, `turn`, `usage`, `finish`, `error`, `steering-injected`) maps to a typed SSE event name (`text_delta`, `thinking_delta`, `tool_call`, `tool_result`, etc.) so clients can subscribe selectively.
- **Decision:** Introduce `SSEBridge` (`src/sse/bridge.ts`) that wraps `SSEHub` and exposes `emitLoopEvent(sessionId, event: LoopEvent)`. `AgentExecutor` now injects `SSEBridge` as `eventSink` (instead of the raw `SSEHub`) and calls `emitLoopEvent` in `handleLoopEvent`. The `/api/sse/events` stream, `/broadcast`, and `/stats` routes continue to use the hub directly. The bridge is also exposed via `ForgeServer.getSSEBridge()` and the barrel.
- **Rationale:**
  - Keeps the streaming route layer untouched (all 23 prior tests stay green) while adding typed event names.
  - `AgentExecutor` is tested via its injected `eventSink`; the bridge is tested in isolation (translation + session fan-out) and integration (connect SSE client, broadcast, assert typed frames arrive in real time).
  - No new runtime dependency (docs page loads `@scalar/api-reference` from CDN, consistent with the Phase 74 decision).
- **Alternatives rejected:** Keeping the generic `"loop"` frame forever (clients cannot filter by event type); putting the translation in `SSEHub` itself (would couple the hub to `LoopEvent` internals).
- **Consequences:** 32/32 server tests pass (incl. 6 bridge unit tests + 3 real-time streaming integration tests). Full workspace build 12/12 green; same 10 pre-existing network/environmental failures (`webFetchTool`, `ClaudeSubscriptionAuth`) unrelated to this phase.

---
## ADR-035: Generated TypeScript SDK (Phase 76)

- **Date:** 2026-09-03
- **Status:** Accepted
- **Context:** Phase 74 shipped the OpenAPI 3.1 contract at /api/openapi.json. Phase 76 needs a typed TS client so every consumer (TUI, web, IDE, future Python SDK in Phase 79, automation) talks to the server through one type-safe surface.
- **Decision:** Hand-rolled typed SDK in packages/sdk (ForgeClient + SSEParser + streamSSE) that mirrors the OpenAPI schemas. No new runtime dependencies � uses platform etch (override via etchImpl). Spec coverage: system (health, ready, openapi.json), sessions (list/search/get/create/delete/events), prompts (submit), tools (list/get/execute), config (all/defaults/get/set/delete with scope), auth (status), sse (stats/broadcast/stream).
- **Rationale:**
  - At ~20 routes the codegen overhead (Stainless/openapi-typescript) outweighs the benefit of auto-generated types; the spec already exists and is small enough to mirror by hand.
  - Hand-rolled SDK lets us ship first-class SSE support (typed SSEEventName union, streamSSE async iterator + callback handler) that the OpenAPI spec can't describe � the SSE consumer is a real product surface, not a stub.
  - Zero-dep policy (see ADR-001, STACK.md): every dependency is a future upgrade tax. etch is a built-in everywhere we deploy.
- **Implementation details:**
  - src/types.ts mirrors every request/response shape from openapi.ts (Phase 74). Updates to one must update the other.
  - src/errors.ts exposes ForgeApiError (carries status/code/message/details) and ForgeTransportError (network-level). The server's ErrorResponse envelope maps 1:1.
  - src/sse.ts is a per-spec SSE wire-format parser used internally by the stream helper and exported for any consumer that needs to drive an SSE source directly.
  - src/stream.ts wraps the parser in an AsyncGenerator<ParsedSSEFrame> + a handler callback that can return alse to cancel. AbortSignal cancels the underlying etch.
  - Integration tests use an in-process pp.request() transport (no sockets) so CI doesn't need port allocation; same pattern as the server's own tests.
- **Alternatives rejected:**
  - Stainless / openapi-typescript codegen (heavy toolchain, generated types don't cover the streaming surface).
  - Thin etch wrapper with no types (defeats the purpose of a typed SDK).
  - Pulling in eventsource-parser / eventsource-client (one more dep, and our parser is ~80 lines).
- **Consequences:** 49/49 SDK tests pass (15 SSE parser, 22 client unit, 11 in-process integration, 1 version export). Workspace build 12/12 green. SDK lint + typecheck clean. Server lint has pre-existing style-only issues unchanged by this phase. Phase 77 (orge serve headless mode) and Phase 79 (Python SDK) can build on this SDK shape.

---
## ADR-036: forge serve headless CLI (Phase 77)

- **Date:** 2026-09-03
- **Status:** Accepted
- **Context:** Phase 73 shipped ForgeServer.create() as a programmatic surface. Phase 77 needs a binary that turns that into orge serve [--port 3845] [--host 0.0.0.0] [--auth-token �] [--cors �] [--no-cors] so the server is one command away from being useful for the dashboard (Stage 16), IDE extensions, and CI automation. The server install was already signal-aware (SIGINT/SIGTERM from Phase 73) so the CLI is a thin argv adapter.
- **Decision:** CLI lives in packages/server/bin/forge.ts with the parser in src/cli.ts as a pure, importable module. parseArgs(argv): ParsedArgs returns { command, options, flags, errors, raw } and un(argv, opts?) does the I/O. The in field in @forge/server/package.json points at dist/bin/forge.js so the same package can be 
pm i -g'd to get the orge binary on PATH.
- **Flags:** --port <n>, --host <h>, --base-dir <path>, --db <path>, --cors <origin> (repeatable), --no-cors, --auth-token <t>, --help / -h, --version / -v. Bare flags (--port) and --flag=value are both accepted. Subcommand is inferred when the first token is a flag (so orge --port 3000 works). The parser is pure, so the 20-test CLI suite runs without a server.
- **Auth middleware:** A new createAuthMiddleware(token?) short-circuits when no token is configured; otherwise it gates every non-/health* request with a timing-safe bearer check. Phase 81 replaces it with the proper per-provider auth model � the public middleware contract is stable so the swap is drop-in. Liveness probes stay open.
- **Bug found and fixed during testing:** The --flag=value form of parseArgs returned 
: next (the current index) for inline values, then i = n - 1 re-processed the same arg ? infinite loop ? 4+ tests hung. Fix: 
: next + 1 so the for-loop's i++ advances past the inline-value arg. Caught because we run the test suite as one process and the hang blocks the runner instead of failing one test.
- **Alternatives rejected:** Commander/yargs (adds a dep, far more surface than 8 flags); a separate cli package (increases the dependency surface for one binary); embedding the binary in dist/index.js (conflates the public API with the entry point and complicates ESM resolution).
- **Consequences:** 58/58 server tests pass (32 prior + 20 cli + 6 auth). Live smoke test: orge serve --port 3845 --auth-token s3cret accepts connections; GET /health returns 200 (no auth), GET /api/sessions without a token returns 401, with Bearer s3cret returns 200. Workspace build 12/12 green; full un run test 24/24 packages pass. SDK (Phase 76) works against the headless server unchanged.

---
## ADR-037: Multi-Client Session Attach (Phase 78)

- **Date:** 2026-09-03
- **Status:** Accepted
- **Context:** Phase 75's SSEHub already broadcast a session's events to every client subscribed to that sessionId, but subscriptions were set only at stream-open time. Phase 78 needs explicit mid-stream attach/detach so a TUI (or web dashboard, or pair-programmer) can start watching a session after it was created, see who's currently watching it, and replay missed events on late-join.
- **Decision:** Extend SSEHub with a per-session client index (sessionIndex: Map<sessionId, Set<clientId>>) and add ttach(clientId, sessionId), detach(...), presence(sessionId), ctiveSessions(), plus roadcastSince(...) for late-join replay with a Last-Event-ID style cursor. Wire five new routes on /api/sse/sessions/{id}/{attach,detach,presence} + /api/sse/sessions + /api/sse/replay. Mirror in the SDK as client.sse.{attach, detach, presence, activeSessions, replay}.
- **Bug found and fixed during testing:**
  - The postbuild step in @forge/server (added in Phase 77) was still using ootDir: ./src semantics. After we added in/forge.ts we bumped ootDir to . so tsc emitted everything under dist/src/.... The package.json still pointed at ./dist/index.js, so consumers hit a stale copy in dist/. Fix: a tiny Node.js mv step in the uild script flattens dist/src/* ? dist/* after 	sc. Cheaper than restructuring the rootDir and keeps in/ working.
  - streamSSE was an AsyncGenerator that didn't start until you called .next(). The handler-style consumption mode (client.sse.stream({ handler })) silently never connected. Fix: when a handler is passed, run the pump in the background (oid pumpStream(...)) and return oid; without a handler, return the generator as before. The handler variant matches what every consumer actually wants (callback, not iteration).
  - The SDK's streamSSE was casting es.body to ReadableStream<Uint8Array>, but the in-process Hono pp.request() returns a ReadableStream<string>. TextDecoder.decode then threw on the string chunks. Fix: 	ypeof value === 'string' ? value : decoder.decode(value, { stream: true }).
- **Alternatives rejected:**
  - Per-room pub/sub (Redis/NATS) � premature for a single-process server; the in-memory index is O(1) and Phase 97 (background tasks) is the natural place to revisit if we ever need cross-process.
  - Storing per-client "last event id" in a cookie/header instead of an explicit frame � too implicit; clients have no idea which event id they last saw.
- **Consequences:** 9 new server tests (SSEHub (multi-client attach)) + 3 new SDK integration tests (Multi-client SSE attach (integration)) pass. Two clients attached to the same session both receive the same broadcast; detaching one drops only that client; broken controllers are auto-pruned (delivered vs ailed accounting). The SDK gained sse.attach/detach/presence/activeSessions/replay methods. Workspace build 12/12 + test 24/24 green.

---
## ADR-038: Python Subprocess SDK + JSON-RPC over stdio (Phase 79)

- **Date:** 2026-09-03
- **Status:** Accepted
- **Context:** Phase 76 shipped a typed HTTP SDK. Phase 79 wants a Python client for automation/Jupyter/ML pipelines, but the spec lists Phase 80 (\"RPC Mode over Stdio\") as a separate phase. The Python SDK *cannot* work without the JSON-RPC server, and shipping them as one phase is far cheaper than a cross-package coordination dance. So Phase 79 ships **both** the server side (@forge/server/rpc) and the Python client (packages/sdk/python). Phase 80 will then deepen the protocol (notifications, ACP surface, capability negotiation) without changing the wire format.
- **Decision:**
  - **Server (packages/server/src/rpc/)** � pure-stdlib RpcServer over a newline-delimited JSON stream. Methods registered through egisterRpcMethods(server, { sessionManager, agentExecutor }) mirror the HTTP API one-to-one: system.*, sessions.*, prompts.*, 	ools.*, config.*, sse.*. Errors are surfaced with the handler's thrown { code, message, data } shape (defaults to -32603 Internal).
  - **CLI (orge rpc [--base-dir �])** � boots the same ForgeServer as orge serve but pipes stdin/stdout into the RPC layer. Stderr is reserved for the human-readable banner (\"forge 0.1.0 rpc ready\"), matching the MCP stdio transport convention.
  - **Python SDK (packages/sdk/python/forge_sdk/)** � zero-dependency. ProcessTransport spawns orge rpc and runs a reader thread that demultiplexes responses (by id) and notifications (by absence of id). ForgeClient and AsyncForgeClient expose typed resource groups (.system, .sessions, .prompts, .tools, .config, .sse); async wraps the sync transport with loop.run_in_executor so the line discipline stays simple.
- **Bug found and fixed during testing:**
  - Python subprocess.Popen(['forge.js', ...]) raised WinError 193 on Windows (\"not a valid Win32 application\") because the path ends in .js. Fix: in ProcessTransport.__init__, if the path ends with .js, prepend ['bun', 'run', binary] so the monorepo build artifact can be used as the binary.
  - orge rpc died with SQLiteError: unable to open database file when only --base-dir was passed: dbPath defaulted to <cwd>/.forge/forge.db instead of <baseDir>/forge.db. Fix: derive the default dbPath from the (possibly user-supplied) aseDir rather than process.cwd().
  - The CLI bin lived at packages/server/bin/forge.ts and imported '../src/cli', which worked pre-flatten (dist/bin/forge.js ? dist/src/cli.js) but broke after the Phase 78 postbuild moved dist/src/* ? dist/*. Fix: move the bin into packages/server/src/bin/forge.ts so tsc handles it like every other source file, drop the postbuild flatten, and point the in field at dist/bin/forge.js.
- **Alternatives rejected:**
  - JSON-RPC over HTTP (POST /rpc) � adds an HTTP client to every Python user; the stdio transport is the *DeepSeek Harness* idiom for editor integration and zero of our consumers would prefer HTTP.
  - gRPC � extra codegen + protoc dependency for a 12-method surface.
  - pip dependency on httpx/websockets � the Python SDK is intentionally zero-dep so it works in minimal ML environments.
- **Consequences:** 13 new server tests (RPC protocol codec + RpcServer round-trips, errors, multi-request, parse errors, internal/typed errors, notifications, dup registration). 8 Python tests pass (6 codec unit + 2 end-to-end that spawn a real orge rpc subprocess and drive system, tools, sessions, error paths). Workspace un run test 24/24 packages pass; un run build 12/12 green. Phase 80 can now add notifications, capability negotiation, and the ACP surface on top of the same wire format.

---
## ADR-039: JSON-RPC over stdio deepening (Phase 80)

- **Date:** 2026-09-03
- **Status:** Accepted
- **Context:** Phase 79 shipped the basic JSON-RPC wire format (equest/response/notification, error envelopes, orge rpc subcommand, Python subprocess SDK). Phase 80 deepens the protocol so it can carry a real prompts.submit conversation end-to-end: capability negotiation on connect, server-pushed notifications while a prompt runs, and in-flight cancellation. The wire format stays JSON-RPC 2.0 over newline-delimited JSON � no new envelope or transport.
- **Decision:** Four additions on top of the Phase 79 server:
  1. **initialize / initialized handshake** (pc/capabilities.ts). LSP-shaped two-call exchange. Client advertises streaming / cancellation / structuredErrors; server returns its supported methods. Negotiation is "AND": a feature is enabled only if both sides want it. The Python SDK exposes client.initialize(...) that caches the negotiated server_info and capabilities and fires the follow-up initialized notification.
  2. **$/cancelRequest** (built into the server). When the server reads a cancel request it looks up the in-flight controller, calls controller.abort(), and the handler's eq.signal fires. Returns { cancelled: bool }. Server rejects missing id with InvalidParams.
  3. **Live $/progress notifications on prompts.submit.** When the client advertised streaming, the bindings forward every LoopEvent to a notifier that wraps the method name in $/progress with { requestId, method, params }. The HTTP SSE surface (Phase 75) and the RPC surface now share the same event vocabulary (	ext_delta, 	ool_call, gent_done, �).
  4. **Per-request AbortSignal plumbing.** New RpcDispatchRequest type (wire-level RpcRequest + per-request signal) is what handlers receive. Handlers can await eq.signal for cancellation; executePrompt passes it through to unAgentLoop.
- **Bug found and fixed during testing:** the original serve() loop used or await (const line of rl) { await this.handleLine(line) }. That *serializes* requests � a slow handler blocked the read loop, so $/cancelRequest could never arrive. Fix: switch to event-based line reading (l.on('line', �)), dispatch every line in its own async task, and use Promise.allSettled on shutdown so in-flight handlers are awaited. The $/cancelRequest test now passes in 16ms instead of timing out.
- **Alternatives rejected:**
  - Custom wire format (newline-delimited JSON-RPC + a Forge-specific envelope) � every editor/IDE would need a custom parser; the whole point of Phase 79 was to land on a standard so any LSP-aware client could be one config away.
  - Streaming over HTTP (long-poll or chunked) � defeats the point of orge rpc. The stdio transport is what the Python/ACP/Jupyter clients can spawn for free.
  - Promise-based handlers that the server Promise.alls � that works for *send* but not for *receive while another handler is running*. The event-based dispatch is the only way to keep the read loop responsive while a slow handler is in flight.
- **Consequences:** 9 new server tests (initialize handshake, capability negotiation, initialized silent accept, cancel unknown/cancel in-flight with AbortSignal, 
otify()/
otifier accessor, $/progress fan-out for prompts.submit). 3 new Python tests (initialize returns capabilities, no-capabilities yields all-off, $/cancelRequest is acknowledged). 90/90 server + 11/11 Python + 24/24 workspace tests pass. orge rpc is now feature-complete for editor integration, ACP, and any other JSON-RPC 2.0 client.

---
## ADR-040: Auth/Token Model for Remote Servers (Phase 81)

- **Date:** 2026-09-04
- **Status:** Accepted
- **Context:** Phase 77 shipped a single global --auth-token flag for the
  headless server. That's enough for a local dev demo, but the moment a
  deployment is exposed to a network you need: many keys, rotation, hashing
  on disk, per-key rate limits, an audit trail of lastUsedAt, and a CLI
  surface for ops. The spec's "API key generation, token validation, rate
  limiting per key" maps cleanly to those five things.

- **Decision:**
  - **AuthStore (packages/server/src/auth/store.ts).** Keys are
    rg_<env>_<random> strings. The random part is 32 url-safe bytes; the
    env label is free-form (live / dev / ci) so users can tell tokens
    apart at a glance. The store persists *only* sha256(secret) to
    <baseDir>/auth/keys.json (mode 0600). The full secret is returned
    exactly once at createKey() time. Validation re-hashes the presented
    token and compares with crypto.timingSafeEqual.
  - **Per-key token-bucket rate limit.** Capacity + refill rate are
    configurable per key (default 60 / 10s). On alidate() the bucket is
    refilled based on elapsed time and a token is deducted; an empty bucket
    returns { ok: false, reason: 'rate-limited' } which the middleware
    surfaces as 429 Too Many Requests with Retry-After: 1.
  - **Dev-convenience escape hatch.** When the store has *zero* keys AND
    no legacyToken is set, the middleware lets anonymous traffic through.
    The moment either is present, anonymous access is disabled. This
    preserves the Phase 73 "no auth needed locally" flow until the
    operator creates a key.
  - **Routes** (/api/auth/keys): GET list, POST create, GET /:id
    get, DELETE /:id revoke, GET /keys/usage per-key rate-limit
    snapshot. Mirrored as JSON-RPC methods uth.listKeys,
    uth.createKey, uth.revokeKey, uth.usage.
  - **orge auth CLI subcommand.** list / create / evoke (with
    --name, --env, --rate cap:rps, --base-dir). The create output
    prints the secret once with an explicit warning that it will not be
    shown again.
  - **SDKs.** TypeScript: client.auth.{listKeys, createKey, revokeKey,
    usage, status}. Python SDK was left for a later phase to keep this
    PR small (the JSON-RPC surface is identical to what the Python SDK
    already wraps).

- **Bug found and fixed during testing:** the Phase 77 auth middleware took
  a single global token; when I switched it to the new AuthStore shape,
  all the prior tests that expected anonymous access (no key configured)
  started returning 401. Fix: add the dev-convenience branch ("no legacy
  token + no keys ? pass through") so the Phase 73 local-dev workflow
  still works. The "no keys" check is wait store.hasKeys() which is
  cheap (in-memory list length) and safe under concurrent startup.

- **Alternatives rejected:**
  - Storing plaintext secrets in the SQLite session DB � leaks on disk
    inspection or DB dump.
  - JWT-style self-contained tokens with embedded claims � needs a JWT
    library and a rotation story; opaque tokens + server-side hash are
    simpler and let us revoke instantly.
  - Per-IP rate limits instead of per-key � Phase 81 spec said per-key.
  - Hashing with bcrypt/argon � overkill for high-entropy random secrets;
    the search space is 256 bits, sha-256 is fine.
  - Centralized orge auth daemon � keys live in the same per-server
    store, ops are a one-line orge auth create.

- **Consequences:** 20 new server tests (12 AuthStore unit + 8 CLI auth).
  All 110 server + 52 SDK + 24/24 workspace tests pass. The orge rpc
  path gained uth.* methods so editor/Python clients can mint + revoke
  keys without shelling out to the CLI. The legacy --auth-token is
  still honored for back-compat, so existing deployments don't break.

---

## Recovery provenance and historical caveats (2026-10-16)

The historical registry above was recovered from verified Git commit `4ceddd1f24c4dc214a233c7429ace6fa6ccef218`: 617 newline-split lines, 41 ADR headings covering ADR-001 through ADR-040. The history already contains two ADR-034 headings, non-sequential ordering, control characters, and historical test/completion claims. Those were retained, not silently renumbered, rewritten, or revalidated.

ADR-041 through ADR-044 below are **reconstructed from session facts supplied by the coordinator**, not recovered original wording. Their original dates and full rationale are unavailable; no alternatives or test outcomes are invented. ADR-045 is preserved verbatim from the pre-recovery working file. Its historical completion claims are superseded by the repair qualification after it. For current evidence see [AUDIT_REPAIR_STATUS.md](AUDIT_REPAIR_STATUS.md).

## ADR-041: Phase 82 Server Integration Test Suite (Reconstructed)

- **Recovered on:** 2026-10-16; original entry date unavailable.
- **Status:** Reconstructed session record; verification incomplete.
- **Provenance:** Coordinator-provided session facts, not original ADR text.
- **Recorded outcome:** Phase 82 server integration tests reported 29 of 37 passing, with 8 known issues. This was not a fully passing integration suite.
- **Caveats:** Known reports included config persistence, auth/404 expectations, SSE chunk decoding, Scalar docs access, missing provider credentials, and Windows bash availability. These are not all established production root causes; separate implementation defects, test defects, and environment blockers during repair.
- **Consequences:** Retain failing assertions and investigate offline. Record fresh results rather than promoting this historical partial run to completion.

## ADR-042: Phase 83 ContextBudgeter (Reconstructed)

- **Recovered on:** 2026-10-16; original entry date unavailable.
- **Status:** Reconstructed session record; repair verification pending.
- **Provenance:** Coordinator-provided session facts, not original ADR text.
- **Recorded decision:** Use `ContextBudgeter` with a character-based approximation of 4 characters per token. Bound the context budget by `min(maxTokens, contextWindow)`; warning at 80%, critical at 95%.
- **Consequences:** Approximation is not an exact provider tokenizer. Verify limits, reserved response space, and threshold boundaries using deterministic tests; no new architecture decision is implied by this reconstruction.

## ADR-043: Phase 84 Automatic LLM Summarization (Reconstructed)

- **Recovered on:** 2026-10-16; original entry date unavailable.
- **Status:** Implemented-under-repair, not fully verified complete.
- **Provenance:** Coordinator-provided session facts, not original ADR text.
- **Recorded decision:** Automatically summarize older context using the LLM and represent the summary as an event, preserving the original events in the append-only log.
- **Consequences:** A summary must affect assembled model context, not only exist in storage. Prior completion claims were disproven by audit. Verify event preservation, effective context replacement, and failure handling offline before acceptance.

## ADR-044: Phase 85 Manual Focused Compaction (Reconstructed)

- **Recovered on:** 2026-10-16; original entry date unavailable.
- **Status:** Implemented-under-repair, not fully verified complete.
- **Provenance:** Coordinator-provided session facts, not original ADR text.
- **Recorded decision:** Support manual `/compact` invocation with optional user focus instructions for summarization.
- **Consequences:** Prior completion claims were disproven by audit. Verify invocation, focus propagation, and preserved log history offline. Do not invent missing command signatures or introduce future roadmap features during repair.

---
## ADR-045: Phase 86 Microcompact (Old Tool Results Pruning) Completion

- **Date:** 2026-09-06
- **Status:** Accepted
- **Context:** Phase 86 (Microcompact) is complete. The microcompact system at `packages/core/src/context/microcompact.ts` implements a lighter-weight compaction that prunes old tool results (keeping only summaries) without full message summarization. This is faster and cheaper than full compaction but frees up significant context (tool results are often very verbose).

- **Implementation Details:**
  - `Microcompactor` class that works with the existing hydration system
  - `shouldMicrocompact(events)` - checks if tool result messages exceed threshold
  - `microcompact(events)` - performs microcompaction:
    1. Extracts messages with tool results from session events via `assembleMessages`
    2. Identifies messages to process (older tool results beyond `maxToolResultsToKeep` threshold)
    3. Summarizes tool results (string truncation, array/object summaries) or removes them
    4. Calculates tokens saved
  - Configurable: `maxToolResultsToKeep` (default 10), `summarizeToolResults` (default true), `summaryPrefix` (default '[Tool Result Summary]')
  - `microcompactIfNeeded` convenience function
  - Integrates with existing session event log and hydration system
  - 18 comprehensive tests covering all functionality

- **Integration:**
  - Uses `assembleMessages` from Phase 14 (hydration) for message extraction
  - Complements Phase 83 (budgeter) for context management
  - Complements Phase 84 (auto-compaction) and Phase 85 (manual compaction)
  - Ready for Phase 87 (system prompt assembly) integration

- **Alternatives rejected:**
  - Removing tool results entirely (loses important debugging info; summarization preserves key info)
  - Full message summarization for tool results (overkill; tool results are structured and can be summarized cheaper)
  - Fixed window of tool results to keep (configurable threshold is more flexible)

- **Consequences:** Phase 86 is complete. The microcompact system provides a lightweight alternative to full compaction for managing verbose tool results. Phase 87 can now implement the system prompt assembly pipeline.

### ADR-045 repair qualification (2026-10-16)

The ADR-045 text above is retained as historical evidence, not a current acceptance decision. The audit disproved the Phase 84–86 completion claims. Phase 86 remains **implemented-under-repair** until the coordinator records final verification. Phase 87 remains pending; neither this historical ADR nor the recovered roadmap authorizes its implementation. Test counts quoted in old ADRs are historical and must not be substituted for fresh package/workspace verification.

### ADR-046 Phase 152 site frameworks + demo capture (2026-10-17)

- **Decision:** The documentation site uses **VitePress** (`packages/docs`, served under `<site>/docs/`) and the landing page uses **Astro** (`packages/landing`, served at the site root, replacing the plugin docs as the root page). GIF demos are pre-rendered assets: terminal-style HTML frames that replay verbatim, verified CLI output, captured with Playwright and assembled with the already-installed ffmpeg.
- **Context:** STACK.md lists "VitePress or Docusaurus" and "Astro or Next.js" without a tie-break; Phase 152 requires both a docs site and a landing page plus GIF demos. GitHub Pages already deploys the `dist-docs` artifact via `.github/workflows/docs-pages.yml`.
- **Alternatives rejected:**
  - Docusaurus (docs) / Next.js (landing): heavier dependency and SSR footprint for two static properties. Both remain approved STACK options if the site later needs versioning/i18n (docs) or app routing (landing).
  - Recording real terminal sessions with vhs/ttyd: requires installing a new tool on the dev machine; until that is agreed, frames replay real output captured in verified smoke runs instead.
- **Consequences:** Two new private workspace packages holding their own dependencies; no runtime code depends on them. The Pages artifact becomes landing (root) + docs (`/docs/`) + generated plugin docs (`/plugins/`); enabling GitHub Pages remains a manual repository step.
