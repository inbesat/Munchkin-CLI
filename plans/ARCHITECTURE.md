# ARCHITECTURE.md — System Architecture & Data Flows

The complete technical architecture. Every component, how they connect, and how data flows through the system.

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENTS                                  │
│                                                                 │
│  ┌─────────┐  ┌──────────┐  ┌────────┐  ┌──────┐  ┌────────┐ │
│  │   TUI   │  │Dashboard │  │ VSCode │  │ ACP  │  │  Bot   │ │
│  │(OpenTUI)│  │  (Web)   │  │  Ext   │  │Server│  │(Telgrm)│ │
│  └────┬────┘  └────┬─────┘  └───┬────┘  └──┬───┘  └───┬────┘ │
│       │             │            │           │          │       │
└───────┼─────────────┼────────────┼───────────┼──────────┼───────┘
        │             │            │           │          │
        │    HTTP + SSE / JSON-RPC over stdio  │          │
        ▼             ▼            ▼           ▼          ▼
┌─────────────────────────────────────────────────────────────────┐
│                    FORGE SERVER (Hono)                           │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐ │
│  │   Session    │  │   Auth       │  │   OpenAPI 3.1 +       │ │
│  │   Manager    │  │   Provider   │  │   Generated SDK       │ │
│  └──────┬───────┘  └──────────────┘  └───────────────────────┘ │
│         │                                                       │
│  ┌──────▼──────────────────────────────────────────────────┐   │
│  │              AGENT LOOP (packages/core)                  │   │
│  │                                                          │   │
│  │  System Prompt → LLM → Stream Events → Tool Dispatch →   │   │
│  │  Tool Result → Context Check → Next Iteration or Done    │   │
│  └──┬──────────┬───────────┬──────────────┬────────────────┘   │
│     │          │           │              │                     │
│  ┌──▼───┐  ┌──▼────┐  ┌───▼─────┐  ┌────▼────────┐          │
│  │Tools │  │  LLM  │  │Permissions│  │   Event     │          │
│  │Regis │  │Service│  │  Engine  │  │   Log       │          │
│  │ try  │  │       │  │          │  │ (append-only)│          │
│  └──┬───┘  └──┬────┘  └─────────┘  └──────┬──────┘          │
│     │         │                             │                  │
│  ┌──▼─────────▼──┐  ┌──────────────────┐  ┌▼───────────────┐ │
│  │Provider Layer  │  │  Hook Engine     │  │  Storage       │ │
│  │(AI SDK + cat.) │  │  (29 events)     │  │  (SQLite+JSONL)│ │
│  └────────────────┘  └──────────────────┘  └────────────────┘ │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐ │
│  │   MCP        │  │  Subagent    │  │  Compaction           │ │
│  │   Client     │  │  Orchestrator│  │  Engine               │ │
│  └──────────────┘  └──────────────┘  └───────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
        │                                     │
        │                                     │
  ┌─────▼──────┐                    ┌─────────▼────────┐
  │   Plugin   │                    │    Sandbox       │
  │   Kernel   │                    │    Providers     │
  └────────────┘                    └──────────────────┘
        │                                     │
  ┌─────▼──────────┐              ┌───────────▼──────────┐
  │ Plugins (npm/  │              │ Landlock/Seatbelt/   │
  │ local/git)     │              │ ACL/Docker/E2B       │
  └────────────────┘              └──────────────────────┘
```

---

## Core Data Flow: User Prompt → Agent Response

```
1. User types prompt in TUI
         │
2. TUI sends POST /sessions/:id/prompt (HTTP)
         │
3. Server resolves session (create or resume)
         │
4. Assemble system prompt:
   ├── Base instructions (forge-specific)
   ├── CLAUDE.md / AGENTS.md memory files
   ├── Active skills (SKILL.md files matched by description)
   ├── Tool schemas (only loaded tools, not all MCP tools)
   └── Conversation history (from event log)
         │
5. Enter agent loop:
   a. Prepare LLM request (messages + tools + params)
   b. Send to LLM provider via AI SDK
   c. Stream events: text deltas, thinking, tool_call starts
   d. For each tool_call:
      ├── Permission check (engine decides: allow/deny/ask)
      ├── If allowed: execute tool in sandbox context
      ├── If blocked: send block message back to LLM
      ├── If ask: prompt user in TUI, wait for response
      ├── Capture tool result
      ├── Run PostToolUse hooks
      └── Append events to session log
   e. Check context window usage
      ├── If < 80%: continue loop
      ├── If > 80%: trigger compaction (summarize old messages)
      └── If compaction fails: force stop with warning
   f. If LLM responds with text only (no tool calls): done
   g. If LLM responds with tool calls: go to step 5d
         │
6. Persist final state to SQLite (session metadata, costs)
         │
7. Broadcast events via SSE to all connected clients
         │
8. TUI renders final response with markdown + syntax highlighting
```

---

## Event-Sourced Session Log

The append-only event log is the source of truth for everything.

### Event Types

```typescript
// Base event — every event extends this
interface SessionEventBase {
  id: string;           // unique event ID
  sessionId: string;    // which session
  timestamp: number;    // Unix ms
  version: number;      // schema version (starts at 1)
}

// Model-visible events (appear in LLM context)
type SessionEvent =
  | UserMessageEvent        // user prompt
  | AssistantMessageEvent   // LLM response (text + thinking)
  | ToolCallEvent           // LLM requested tool execution
  | ToolResultEvent         // tool execution result
  | SystemPromptEvent       // system prompt section added
  | CompactionSummaryEvent  // summary replacing old messages

// Internal events (not visible to LLM)
type InternalEvent =
  | SessionCreatedEvent
  | SessionResumedEvent
  | PermissionRequestedEvent
  | PermissionGrantedEvent
  | PermissionDeniedEvent
  | HookExecutedEvent
  | CostRecordedEvent
  | SubagentSpawnedEvent
  | CheckpointCreatedEvent
```

### Dual-Path Persistence

**SQLite (fast queries):**
- Session metadata (id, title, created_at, updated_at, model, cost)
- Message summaries (for listing/searching sessions)
- Cost aggregation (per-model, per-day, per-session)

**JSONL (crash-safe append):**
- Individual event files per session (`sessions/{id}/events.jsonl`)
- Each line is one JSON event
- Appends are atomic (OS-level)
- Resume replays the entire log to rebuild state

### Resume Protocol

```
1. Load session metadata from SQLite
2. Read events.jsonl, replay all events in order
3. Detect incomplete conversation (tool_call without tool_result)
4. If incomplete: continue from last complete tool result
5. If complete: enter idle state, await new user prompt
6. Rebuild in-memory state: messages, tool results, costs
```

### Fork Protocol

```
1. Fork session = new session ID + copy of parent's event log
2. Parent session is untouched
3. Fork shares all events up to fork point
4. New events in fork go to fork's own event log
5. Fork can diverge: different model, different tools, different path
```

---

## Permission Engine

Every tool call passes through the permission engine before execution.

### Decision Flow

```
Tool call arrives
    │
    ▼
Load permission rules (project + user + default)
    │
    ▼
Match rules against tool name + input args
    │
    ├── Rule says ALLOW → execute immediately
    ├── Rule says DENY → block, return deny message to LLM
    ├── Rule says ASK → prompt user in TUI
    │                    ├── User approves → execute
    │                    └── User denies → block
    └── No rule matches → use default mode behavior
                          ├── "default" mode → ASK
                          ├── "acceptEdits" mode → allow file edits, ASK for bash
                          ├── "plan" mode → allow reads, block all writes
                          ├── "auto" mode → execute with safety checks
                          └── "bypass" mode → execute everything (circuit breakers still active)
```

### Risk Classifier

The permission engine classifies tool calls by risk level:
- **Low risk:** Read operations (read file, grep, glob, web fetch)
- **Medium risk:** Write operations (edit file, write file, bash with safe commands)
- **High risk:** Dangerous operations (bash with rm, force push, database drops)
- **Critical:** System-level operations (rm -rf /, modifying system files)

---

## Hook System

Hooks fire at lifecycle events. They can block, modify, or observe.

### Hook Types

| Type | Handler | Blocking? | Use Case |
|---|---|---|---|
| `command` | Shell script/program | Yes (exit code 2) | Lint after edit, block rm -rf |
| `http` | POST to URL | Yes (HTTP response) | Webhook notifications, external validation |
| `mcp_tool` | Call MCP tool | Yes (tool response) | Use MCP tools in hooks |
| `prompt` | LLM call (single turn) | Yes (response text) | LLM-powered review before execution |
| `agent` | Spawn subagent | Yes (agent response) | Full agent review of proposed changes |

### Hook Execution Order

```
All hooks for an event fire in registration order:
1. User hooks (highest priority)
2. Project hooks
3. Plugin hooks
4. Built-in hooks (lowest priority)

If any blocking hook returns exit code 2:
  - The action is blocked
  - stderr becomes feedback to the LLM
  - Remaining hooks do NOT fire
```

---

## Plugin System

### Plugin Structure

```
my-plugin/
├── manifest.json          # Plugin metadata (name, version, description)
├── index.ts               # Main plugin entry point
├── hooks/                 # Hook handlers
│   └── hooks.json
├── skills/                # Skill definitions
│   └── my-skill/
│       └── SKILL.md
├── agents/                # Subagent definitions
│   └── my-agent.md
├── mcp/                   # MCP server configs
│   └── mcp.json
└── package.json           # NPM dependencies
```

### Plugin Loading Order

```
1. Built-in plugins (shipped with forge)
2. Global plugins (~/.config/forge/plugins/)
3. Project plugins (.forge/plugins/)
4. npm plugins (installed via /plugin install)

Duplicate packages (same name + version) loaded once.
All hooks run in sequence across all sources.
```

### Plugin API

```typescript
interface PluginInput {
  project: ProjectInfo;
  client: ForgeSDK;       // API client for the forge server
  $: typeof Bun.shell;    // Bun shell API
  directory: string;       // current working directory
  worktree?: string;       // git worktree path
}

interface PluginHooks {
  auth?: AuthHook;
  provider?: ProviderHook;
  'chat.message'?: (input, output) => Promise<output>;
  'chat.params'?: (input, output) => Promise<output>;
  'tool.execute.before'?: (input, output) => Promise<output>;
  'tool.execute.after'?: (input, output) => Promise<output>;
  'permission.ask'?: (input, output) => Promise<output>;
  event?: (event: any) => void;
  tools?: Record<string, ToolDefinition>;
}
```

---

## Provider Layer

### How Model Selection Works

```
User selects model (e.g., "claude-sonnet-4-6")
    │
    ▼
Resolve provider from model ID:
  - "claude-*" → Anthropic
  - "gpt-*" → OpenAI
  - "gemini-*" → Google
  - "deepseek-*" → DeepSeek (via OpenAI-compatible)
  - "ollama/*" → Ollama (local, via OpenAI-compatible)
    │
    ▼
Load provider adapter (AI SDK provider package)
    │
    ▼
Check model capabilities from catalog:
  - Context window size
  - Supports tool calling?
  - Supports thinking/reasoning?
  - Supports vision?
  - Pricing per token
    │
    ▼
Prepare request:
  - Map messages to provider format
  - Attach tool schemas
  - Set thinking level (if supported)
  - Apply prompt caching markers (if supported)
    │
    ▼
Stream response:
  - Text deltas → render in TUI
  - Thinking deltas → show in thinking block
  - Tool calls → dispatch to tool registry
  - Usage → record in cost tracker
```

### Provider Fallback Chain

```
Primary provider (e.g., Anthropic)
    │
    ├── If rate limit → wait + retry (exponential backoff)
    ├── If error → try secondary provider (e.g., OpenAI)
    ├── If all fail → try local provider (e.g., Ollama)
    └── If all fail → show error to user
```

---

## Subagent Architecture

```
Main Agent
    │
    ├── Task tool call (spawn subagent)
    │       │
    │       ▼
    │   Create isolated context:
    │   ├── Fresh system prompt (subagent-specific)
    │   ├── Isolated tool allowlist
    │   ├── Optional worktree isolation
    │   └── Optional model override
    │       │
    │       ▼
    │   Run subagent loop (same loop as main, but isolated)
    │       │
    │       ▼
    │   Return single final message to parent
    │   (intermediate steps NOT visible to parent)
    │
    └── Continue main loop with subagent result
```

### Agent Teams (Multi-Agent)

```
Coordinator Agent
    │
    ├── Agent A (task: "implement auth module")
    ├── Agent B (task: "write tests for auth")
    └── Agent C (task: "update documentation")
         │
         ├── Shared task list (via message bus)
         ├── Direct inter-agent messaging
         └── Status reporting to coordinator
```

---

## Storage Schema

### SQLite (Drizzle ORM)

```sql
-- Sessions
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  title TEXT,
  created_at INTEGER,
  updated_at INTEGER,
  model TEXT,
  provider TEXT,
  total_cost REAL,
  total_tokens INTEGER,
  parent_session_id TEXT,  -- for forks
  status TEXT  -- active | completed | errored
);

-- Messages (summary for queries)
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  role TEXT,  -- user | assistant | system
  content_preview TEXT,  -- first 200 chars
  token_count INTEGER,
  created_at INTEGER
);

-- Costs
CREATE TABLE costs (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  model TEXT,
  provider TEXT,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  total_cost REAL,
  timestamp INTEGER
);

-- Permissions
CREATE TABLE permissions (
  id TEXT PRIMARY KEY,
  scope TEXT,  -- user | project | session
  tool_pattern TEXT,
  action TEXT,  -- allow | deny | ask
  path_pattern TEXT,
  created_at INTEGER
);
```

---

## Network & Communication

### Local Mode (Default)
- TUI connects to server via HTTP on localhost (random port)
- No network exposure
- All data stays on disk

### Remote Mode (Stage 16+)
- Server binds to configurable host/port
- Authentication via API key or OAuth
- TLS required for remote connections
- Dashboard accessible via browser

### RPC Mode (ACP, SDK)
- JSON-RPC 2.0 over stdio
- For editor integration (Zed, Neovim, JetBrains)
- For Python subprocess SDK
- For headless automation
