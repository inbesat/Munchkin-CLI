# BEHAVIOR_SPEC.md — Clean-Room Behavioral Specification for Forge

**Version:** 1.0
**Date:** 2026-08-26
**Purpose:** Describes WHAT Forge does, not HOW it implements it. Every behavior is expressed in terms of observable input→output contracts. No proprietary source code references.

---

## 1. Agent Loop

### 1.1 Core Loop

When a user submits a prompt, Forge executes the following loop:

1. **Assemble context:** Build the full message list from conversation history, inject system prompt sections (project instructions, memory files, active skills, tool schemas).
2. **Send to LLM:** Forward the assembled messages + available tool schemas to the selected model provider.
3. **Stream response:** Receive streaming events from the LLM:
   - Text deltas → render progressively in the TUI.
   - Thinking/reasoning deltas → render in a collapsible thinking block.
   - Tool call requests → dispatch to the tool system.
4. **Execute tools:** For each tool call in the response:
   - Validate input against the tool's schema.
   - Run permission checks.
   - Execute the tool.
   - Capture the result.
   - Fire post-execution hooks.
5. **Check termination:** If the LLM responds with text only (no tool calls), the turn is complete.
6. **Repeat:** If the LLM responds with tool calls, feed the results back into step 2.
7. **Context budget check:** After each iteration, if context window usage exceeds 80%, trigger compaction.

### 1.2 Streaming Behavior

- Text is rendered character-by-character as it arrives (progressive rendering).
- Tool calls appear as expandable blocks showing tool name + input parameters.
- Thinking blocks are collapsible and shown with a distinct visual style.
- All streaming can be interrupted by the user (Esc or Ctrl+C).

### 1.3 Turn Completion

A turn is complete when:
- The LLM produces a final text response with no tool calls.
- The user interrupts.
- A maximum iteration limit is reached (configurable, default: 50 tool calls per turn).
- Context window is exhausted after compaction.

---

## 2. Tool System

### 2.1 Tool Interface

Every tool in Forge must declare:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Unique identifier (e.g., `Read`, `Write`, `Bash`) |
| `description` | string | Yes | Human-readable description for the LLM |
| `inputSchema` | JSON Schema | Yes | Validates tool input parameters |
| `isReadOnly` | boolean | Yes | Whether this tool only reads (no side effects) |
| `isConcurrencySafe` | boolean | Yes | Whether multiple instances can run in parallel |
| `category` | enum | Yes | `read`, `write`, `execute`, `web`, `agent`, `meta` |

### 2.2 Built-in Tools

Forge ships with the following tools:

**File Operations:**
- `Read` — Read a file's contents (text, image, PDF). Supports offset/limit for large files.
- `Write` — Create or overwrite a file. Requires reading the file first (read-before-write guard).
- `Edit` — Find-and-replace within a file. Requires reading the file first. Supports replace-all mode.

**Search:**
- `Glob` — Find files by name pattern (glob syntax).
- `Grep` — Search file contents by regex (ripgrep-backed).

**Execution:**
- `Bash` — Execute a shell command. Supports timeout, background execution, and sandboxing.
- `PowerShell` — Execute a PowerShell command (Windows only).

**Web:**
- `WebFetch` — Fetch a URL and summarize its content.
- `WebSearch` — Search the web and return results.

**Agent:**
- `Task` — Spawn a subagent with an isolated context to perform a task.
- `SendMessage` — Send a message to a teammate agent (in team mode).

**Task Management:**
- `TodoWrite` — Write a structured todo list (replaces entire list atomically).
- `TaskCreate` / `TaskGet` / `TaskUpdate` / `TaskList` — CRUD for individual tasks.

**Meta:**
- `ToolSearch` — Discover available tools by keyword or exact name.
- `AskUserQuestion` — Ask the user a structured question (multiple choice or free text).
- `EnterPlanMode` / `ExitPlanMode` — Switch between planning (read-only) and execution modes.
- `EnterWorktree` / `ExitWorktree` — Create and manage git worktrees for isolated work.
- `Skill` — Load and execute a skill (SKILL.md-defined workflow).

**MCP:**
- `MCPTool` — Any tool provided by a connected MCP server. Named `mcp__<server>__<tool>`.
- `McpAuth` — Trigger OAuth flow for an MCP server requiring authentication.
- `ListMcpResources` / `ReadMcpResource` — Access MCP server resources.

### 2.3 Tool Execution Flow

```
Tool call request arrives from LLM
    │
    ▼
Validate input against schema
    │
    ├── Invalid → return error to LLM
    │
    ▼
Run pre-execution hooks (PreToolUse)
    │
    ├── Hook blocks (exit code 2) → return hook feedback to LLM
    │
    ▼
Permission check
    │
    ├── Allow → proceed
    ├── Deny → return denial message to LLM
    └── Ask → prompt user in TUI, wait for response
              ├── Approve → proceed
              └── Deny → return denial to LLM
    │
    ▼
Execute tool
    │
    ├── Success → capture result
    ├── Error → capture error details
    └── Timeout → capture timeout error
    │
    ▼
Run post-execution hooks (PostToolUse)
    │
    ▼
Return result to LLM
```

### 2.4 Read-Before-Write Guard

For `Write` and `Edit` tools:
- The file MUST appear in the session's read cache (previously read via `Read` tool).
- If the file's modification time has changed since the last read, the write is refused with a stale-cache error.
- This prevents the LLM from overwriting concurrent changes.

### 2.5 Tool Result Formatting

- Tool results are truncated at a configurable maximum size (default: 100,000 characters).
- If output exceeds the limit, it is persisted to a temp file and a summary is returned.
- Binary content (images) is returned as base64-encoded data.

---

## 3. Permission System

### 3.1 Permission Modes

Forge supports six permission modes. The active mode determines how tool calls are evaluated:

| Mode | Read Operations | Write Operations | Bash Commands |
|------|----------------|------------------|---------------|
| `default` | Allow | Ask | Ask |
| `acceptEdits` | Allow | Allow | Ask |
| `plan` | Allow | Deny | Deny |
| `auto` | Allow | Allow | Allow (with safety checks) |
| `bypass` | Allow | Allow | Allow (circuit breakers active) |
| `dontAsk` | Allow | Allow | Allow (no prompts) |

### 3.2 Permission Rules

Users can define permission rules that override the mode behavior:

- **Allow rule:** Pattern-matches tool name + input. If matched, the tool executes without asking.
- **Deny rule:** Pattern-matches tool name + input. If matched, the tool is blocked.
- **Ask rule:** Pattern-matches tool name + input. If matched, the user is always prompted.

Rules are layered:
1. User-level rules (`~/.config/forge/settings.json`)
2. Project-level rules (`.forge/settings.json`)
3. Session-level rules (set via `/permissions` command)
4. Mode defaults

### 3.3 Risk Classification

The permission engine classifies tool calls by risk:

- **Low risk:** Read operations (read file, grep, glob, web fetch).
- **Medium risk:** Write operations (edit file, write file, safe bash commands).
- **High risk:** Dangerous operations (bash with rm, force push, database drops, network calls).
- **Critical:** System-level operations (rm -rf /, modifying system files).

Risk level determines the default permission behavior in each mode.

### 3.4 Permission Dialog

When the user is asked to approve a tool call, the TUI shows:
- Tool name and description.
- Input parameters (formatted for readability).
- Risk level indicator.
- Options: Allow once, Always allow (for this session), Deny, Deny + provide feedback.
- For file edits: a diff view showing the proposed changes.

### 3.5 Bypass Circuit Breakers

Even in `bypass` mode, certain operations are always blocked:
- `rm -rf /` or equivalent recursive deletion of root paths.
- Commands matching known destructive patterns (configurable blocklist).
- Operations that exceed safety thresholds (e.g., writing to system directories).

---

## 4. Subagent System

### 4.1 Spawning a Subagent

When the `Task` tool is called:
1. Create an isolated context with:
   - Fresh system prompt (based on the task description).
   - Isolated tool allowlist (configurable, default: all tools).
   - Optional model override.
   - Optional worktree isolation.
2. Run the agent loop in the isolated context.
3. The subagent runs independently — its intermediate steps are NOT visible to the parent.
4. On completion, the subagent returns a single final message to the parent.
5. The parent continues its loop with the subagent result.

### 4.2 Subagent Types

| Type | Description | Isolation |
|------|-------------|-----------|
| `explore` | Fast codebase search/analysis | None (shared filesystem) |
| `general` | Multi-step task execution | Optional worktree |
| `fork` | Duplicate of parent context | Worktree required |
| Custom | User-defined via agent files | Configurable |

### 4.3 Background Execution

- Subagents can run in the background (`run_in_background: true`).
- Background tasks show progress after 2 seconds.
- Auto-background after 120 seconds of wall time.
- Users can view, kill, or interact with background tasks.
- Task output can be read asynchronously via `TaskOutput`.

### 4.4 Agent Teams

Multiple subagents can form a team:
1. A coordinator agent creates a team and assigns tasks.
2. Team members communicate via a mailbox system.
3. The coordinator can send messages, receive updates, and manage the task list.
4. Team members can request permissions from the coordinator.
5. Teams are cleaned up on session end.

---

## 5. Hook System

### 5.1 Hook Events

Forge fires hooks at the following lifecycle events:

| Event | When | Can Block? |
|-------|------|-----------|
| `SessionStart` | Session created or resumed | No |
| `SessionEnd` | Session closed | No |
| `PreToolUse` | Before tool execution | Yes (exit code 2 blocks) |
| `PostToolUse` | After tool execution | No (observational) |
| `PrePrompt` | Before sending prompt to LLM | Yes |
| `PostPrompt` | After receiving LLM response | No |
| `PreCompact` | Before context compaction | Yes |
| `PostCompact` | After compaction completes | No |
| `PermissionRequest` | When permission is needed | Yes |
| `PreAgentSpawn` | Before creating subagent | Yes |
| `PostAgentSpawn` | After subagent created | No |
| `PreEdit` | Before file edit | Yes |
| `PostEdit` | After file edit | No |
| `PreBash` | Before bash execution | Yes |
| `PostBash` | After bash execution | No |
| `TaskCreated` | When a todo task is created | No |
| `TaskCompleted` | When a todo task is marked done | Yes (for verification) |
| `SkillLoaded` | When a skill file is loaded | No |
| `PluginLoaded` | When a plugin is loaded | No |

### 5.2 Hook Types

| Type | Handler | Blocking? | Use Case |
|------|---------|-----------|----------|
| `command` | Shell script/program | Yes (exit code 2) | Lint after edit, block dangerous commands |
| `http` | POST to URL | Yes (HTTP response) | Webhook notifications, external validation |
| `mcp_tool` | Call MCP tool | Yes (tool response) | Use MCP tools within hooks |
| `prompt` | LLM call (single turn) | Yes (response text) | LLM-powered review before execution |
| `agent` | Spawn subagent | Yes (agent response) | Full agent review of proposed changes |

### 5.3 Hook Execution Order

1. User-defined hooks (highest priority)
2. Project hooks
3. Plugin hooks
4. Built-in hooks (lowest priority)

If any blocking hook fires, remaining hooks do NOT execute. The blocking hook's output becomes feedback to the LLM.

### 5.4 Hook Configuration

Hooks are defined in:
- `~/.config/forge/hooks.json` (user-level)
- `.forge/hooks.json` (project-level)
- Plugin manifest (plugin-level)

Format:
```json
{
  "PreToolUse": [
    {
      "type": "command",
      "command": "eslint --fix $FILE_PATH",
      "pattern": { "tool": "Edit", "input": { "file_path": "*.ts" } }
    }
  ]
}
```

---

## 6. Context Management

### 6.1 System Prompt Assembly

The system prompt is assembled from multiple sources:

1. **Base instructions:** Forge's core behavioral instructions.
2. **Memory files:** `AGENTS.md`, `CLAUDE.md`, or `.forge/memory.md` (hierarchical, from root to cwd).
3. **Active skills:** SKILL.md files matched by relevance to the current task.
4. **Tool schemas:** Only the schemas for tools the session has access to.
5. **Environment info:** OS, shell, cwd, git branch, available tools.

### 6.2 Context Window Budget

Forge tracks token usage across the context window:
- System prompt tokens
- Message history tokens
- Tool schema tokens
- Reserved output tokens (for LLM response)

When total usage exceeds 80% of the model's context window, compaction is triggered.

### 6.3 Compaction

When context is running low:
1. **Summarize:** The oldest messages are summarized into a compact representation.
2. **Preserve recency:** The most recent N messages are kept verbatim.
3. **Preserve tool results:** Critical tool results (file contents, command outputs) are kept if they appear in recent context.
4. **Summary injection:** The summary is injected as a system message, replacing the summarized messages.

Compaction can be triggered:
- **Automatically:** When context usage exceeds 80%.
- **Manually:** User runs `/compact` command.
- **Microcompact:** On individual large tool results, compress inline before adding to context.

### 6.4 Memory Files

Forge reads memory files from the filesystem hierarchy:

```
/
├── AGENTS.md          # Project-level instructions (highest priority)
├── .forge/
│   └── memory.md      # Project-specific memory
├── src/
│   └── CLAUDE.md      # Directory-level instructions
│       └── (inherited by all files in src/)
└── ~/.config/forge/
    └── memory.md      # User-level memory (lowest priority)
```

Memory files are injected into the system prompt and can be updated by the agent.

### 6.5 Token Accounting

Forge tracks:
- Total tokens used per turn.
- Tokens per message.
- Tokens per tool result.
- Estimated cost per turn (based on model pricing).
- Cumulative session cost.

---

## 7. Session Management

### 7.1 Session Lifecycle

1. **Create:** New session with unique ID. Initial state: empty message list, default settings.
2. **Resume:** Load session from storage, replay event log, restore in-memory state.
3. **Active:** User interacts, agent responds, tools execute.
4. **Idle:** Turn complete, awaiting next user input.
5. **Complete:** User explicitly ends session or switches to another session.
6. **Fork:** Create a new session that diverges from a parent session at a specific point.

### 7.2 Session Storage

Each session stores:
- **Metadata:** ID, title, model, provider, created/updated timestamps, cost.
- **Event log:** Append-only JSONL file with all events (user messages, assistant responses, tool calls, tool results, system messages).
- **SQLite index:** Fast queries for listing, searching, and aggregating session data.

### 7.3 Session Resume

When resuming a session:
1. Load session metadata from SQLite.
2. Replay the full event log to rebuild in-memory state.
3. Detect incomplete conversations (tool call without result).
4. If incomplete: continue from the last complete tool result.
5. If complete: enter idle state.

### 7.4 Session Fork

When forking a session:
1. Create a new session with a new ID.
2. Copy all events from the parent up to the fork point.
3. The parent session is untouched.
4. New events in the fork go to the fork's own event log.
5. The fork can diverge: different model, different tools, different path.

### 7.5 Session Sharing

The `/share` command:
1. Exports the conversation as a formatted document.
2. Uploads to a GitHub Gist (unlisted, user's account).
3. Returns a shareable URL.
4. No server required — GitHub hosts the data.

---

## 8. Git Integration

### 8.1 Checkpoints

Before every file-modifying operation:
1. Capture the current git state (staged + unstaged changes).
2. Store as a checkpoint associated with the tool call.
3. If the user wants to undo, the checkpoint can be restored.

### 8.2 Rewind

The `/rewind` command:
1. Rolls back file changes to a previous checkpoint.
2. Optionally rolls back the conversation to that point.
3. Creates a new git commit with the reverted state.

### 8.3 Worktrees

The `EnterWorktree` tool:
1. Creates a new git worktree from the current HEAD.
2. The worktree gets a new branch name.
3. All tool operations within the session now operate in the worktree.
4. The `ExitWorktree` tool:
   - `keep`: preserves the worktree and branch.
   - `remove`: deletes the worktree and branch (requires explicit confirmation if there are uncommitted changes).

### 8.4 Git Operations

Forge automatically tracks git operations performed via the `Bash` tool:
- Commits detected → logged for analytics.
- Pushes detected → logged for analytics.
- PR creation detected → logged for analytics.

---

## 9. MCP Integration

### 9.1 MCP Client

Forge acts as an MCP client, connecting to MCP servers defined in configuration.

Supported transports:
- **stdio:** Spawn a child process and communicate via stdin/stdout.
- **SSE:** Connect to an HTTP server with Server-Sent Events.
- **WebSocket:** Connect to a WebSocket endpoint.

### 9.2 Tool Discovery

When an MCP server connects:
1. Forge requests the server's tool list.
2. Each tool is registered in the tool pool with the naming convention `mcp__<server>__<tool>`.
3. Tool schemas are validated against the MCP specification.
4. Tools appear in the LLM's available tool list.

### 9.3 Resource Access

MCP servers can expose resources (files, data):
- `ListMcpResources` returns all available resources from all connected servers.
- `ReadMcpResource` fetches a specific resource by URI.

### 9.4 Authentication

If an MCP server requires OAuth:
1. Forge detects the auth requirement.
2. Shows an `McpAuth` tool to the LLM.
3. When invoked, starts the OAuth flow.
4. Returns an authorization URL for the user to open in their browser.
5. On completion, reconnects the server with valid credentials.

---

## 10. Plugin System

### 10.1 Plugin Structure

A plugin is a directory or npm package containing:

```
my-plugin/
├── manifest.json          # Metadata (name, version, description)
├── index.ts               # Main entry point
├── hooks/                 # Hook handlers
├── skills/                # Skill definitions (SKILL.md files)
├── agents/                # Subagent definitions
├── mcp/                   # MCP server configs
└── package.json           # Dependencies
```

### 10.2 Plugin Loading

Plugins are loaded in order:
1. Built-in plugins (shipped with Forge).
2. Global plugins (`~/.config/forge/plugins/`).
3. Project plugins (`.forge/plugins/`).
4. npm plugins (installed via `/plugin install`).

Duplicate plugins (same name + version) are loaded once.

### 10.3 Plugin Capabilities

A single plugin can provide:
- **Hooks:** Lifecycle event handlers.
- **Skills:** SKILL.md files that load on demand.
- **Subagents:** Custom agent definitions.
- **Tools:** Custom tool implementations.
- **MCP servers:** Configuration for MCP servers.
- **Slash commands:** New commands for the TUI.

### 10.4 Plugin API

Plugins receive:
- `project`: Information about the current project.
- `client`: An API client for the Forge server.
- `$`: Shell execution API.
- `directory`: Current working directory.
- `worktree`: Optional git worktree path.

Plugins can:
- Register hooks.
- Add tools to the tool pool.
- Register slash commands.
- Modify the system prompt.
- Access the session event log.

---

## 11. Skills System

### 11.1 Skill Definition

A skill is a Markdown file (`SKILL.md`) with YAML front matter:

```markdown
---
name: my-skill
description: What this skill does and when to trigger it
---

# Skill instructions

Detailed instructions for the agent to follow when this skill is loaded.
```

### 11.2 Skill Loading

Skills are loaded based on relevance:
1. On session start, scan for SKILL.md files in:
   - `~/.config/forge/skills/`
   - `.forge/skills/`
   - Plugin skill directories
2. Match skill descriptions against the user's prompt.
3. Load matching skills into the system prompt.
4. Skills can also be explicitly invoked via the `Skill` tool or `/skill` command.

### 11.3 Progressive Disclosure

- Skills load only when relevant (not all at once).
- MCP tools load lazily (on first use or when explicitly requested).
- Subagents run in isolation (don't bloat the parent's context).

---

## 12. Context Visualization

### 12.1 The `/context` Command

Shows a visual grid of context usage:
- Total tokens used / max tokens.
- Breakdown by category (system prompt, messages, tool schemas, tool results).
- Per-message token counts.
- Estimated cost.

### 12.2 Cost Tracking

Per turn, Forge tracks:
- Model used.
- Input tokens.
- Output tokens.
- Thinking tokens (if applicable).
- Cost in USD (based on model pricing).

Aggregate views:
- Per-session cost.
- Per-day cost.
- Per-model cost breakdown.
- Cost trends over time.

---

## 13. UI Behavior

### 13.1 Terminal UI

The TUI provides:
- **Message list:** Scrollable conversation view with markdown rendering.
- **Input area:** Text input with autocomplete for files, commands, and agents.
- **Status bar:** Model name, session cost, token usage, current mode.
- **Tool output:** Expandable blocks for tool results.
- **Thinking blocks:** Collapsible reasoning display.
- **Permission dialogs:** Inline approval/rejection UI.

### 13.2 Keyboard Navigation

Full keyboard navigation without mouse:
- **Enter:** Submit prompt.
- **Escape:** Cancel running operation / exit dialog.
- **Ctrl+C:** Interrupt (double-press to exit).
- **Ctrl+D:** Exit (double-press to confirm).
- **Ctrl+B:** Background current task.
- **Up/Down:** Navigate message history or autocomplete suggestions.
- **Tab:** Toggle autocomplete / switch focus.
- **Ctrl+R:** Search history.
- **Ctrl+K/U/W:** Kill line/word (readline-style).

### 13.3 Markdown Rendering

- Code blocks with syntax highlighting.
- Inline code.
- Headers, bold, italic.
- Lists (ordered and unordered).
- Links.
- Tables.
- Images (when available as base64).

### 13.4 Theme System

- **Dark mode:** Default.
- **Light mode:** High-contrast variant.
- **Daltonized modes:** Colorblind-friendly variants.
- Custom themes via configuration.

### 13.5 Plan Mode

When plan mode is active:
- All write operations are blocked.
- All bash execution is blocked.
- Read operations (file read, grep, glob, web fetch) are allowed.
- The agent can explore the codebase and produce a plan.
- Exiting plan mode restores the previous permission mode.

---

## 14. Headless Mode

### 14.1 Non-Interactive Execution

Forge supports headless execution via the `-p` flag:
- Input is provided as a command-line argument or via stdin.
- Output is streamed to stdout (no TUI).
- Tool calls execute automatically (no permission prompts in default headless mode).
- Exit code 0 on success, non-zero on error.

### 14.2 SDK Mode

Forge exposes a programmatic API:
- JSON-RPC 2.0 over stdio.
- For editor integration (Zed, Neovim, JetBrains).
- For Python subprocess SDK.
- For automation and CI/CD pipelines.

---

## 15. Settings System

### 15.1 Layered Settings

Settings are resolved in priority order:
1. **CLI flags:** Highest priority, override everything.
2. **Session settings:** Set via `/settings` command, persist for the session.
3. **Local project settings:** `.forge/settings.local.json` (gitignored).
4. **Project settings:** `.forge/settings.json` (shared via git).
5. **Global settings:** `~/.config/forge/settings.json` (user defaults).
6. **Built-in defaults:** Lowest priority.

### 15.2 Settings Categories

- **Model:** Default model, thinking level, max tokens.
- **Permissions:** Allow/deny rules, default mode.
- **Theme:** Dark/light/custom theme.
- **Keybindings:** Custom keyboard shortcuts.
- **MCP servers:** Server configurations.
- **Plugins:** Enabled/disabled plugins.
- **Hooks:** Hook configurations.
- **Skills:** Skill configurations.

---

## 16. Auto-Update

### 16.1 Update Check

On startup, Forge checks for updates:
- Compare current version against latest published version.
- If update available, show notification in status bar.
- User can install via `/update` command.

### 16.2 Update Installation

1. Download the latest binary.
2. Verify checksum.
3. Replace current binary.
4. Restart.

---

## 17. Sandboxing

### 17.1 Sandbox Providers

Forge supports multiple sandbox providers:

| Provider | Platform | Isolation Level |
|----------|----------|----------------|
| Landlock | Linux | Kernel-level file/network restrictions |
| Seatbelt | macOS | Kernel-level restrictions |
| Windows ACL | Windows | File system ACL restrictions |
| Bubblewrap | Linux | Container-like namespace isolation |
| Docker | Cross-platform | Full container isolation |
| E2B | Cross-platform | Remote cloud sandbox |

### 17.2 Sandbox Behavior

When sandboxing is enabled:
- Bash commands run inside the sandbox.
- File operations are restricted to the project directory.
- Network access is configurable (allow/deny per host).
- System calls are filtered by the sandbox provider.

---

## 18. Evaluation Harness

### 18.1 Benchmark Runner

Forge includes a built-in evaluation harness:
- Run SWE-bench-lite benchmarks against your configuration.
- Measure agent performance across different models.
- Track regressions per release.

### 18.2 Metrics

- **Pass rate:** Percentage of benchmark tasks completed correctly.
- **Token efficiency:** Tokens used per successful task.
- **Cost efficiency:** Cost per successful task.
- **Time efficiency:** Wall-clock time per task.

### 18.3 Comparison Mode

Run the same benchmark across multiple configurations:
- Different models (Claude vs GPT vs Gemini).
- Different permission modes.
- Different tool configurations.
- Different hook configurations.

---

## 19. Cross-Agent Delegation

### 19.1 Delegation Protocol

Forge can delegate tasks to external agents:
1. The main agent calls a delegation tool.
2. Forge spawns the external agent (Claude Code, GPT, Gemini) as a subprocess.
3. The external agent runs independently with its own context.
4. On completion, the result is returned to the main agent.
5. The main agent continues with the result.

### 19.2 Supported External Agents

- Claude Code (via subprocess)
- OpenAI Codex (via API)
- Google Gemini (via API)
- Any ACP-compatible agent

---

## 20. Web Dashboard

### 20.1 Fleet View

The web dashboard provides:
- List of all active sessions.
- Per-session status (running, idle, completed, errored).
- Per-session cost and token usage.
- Subagent activity visualization.
- Ability to steer sessions from the browser.

### 20.2 Session Viewer

- Full conversation history.
- Tool call details.
- Real-time streaming (via SSE).
- Cost breakdown per turn.
- Ability to inject prompts remotely.

---

## Appendix A: Slash Commands

Forge provides the following built-in slash commands:

| Command | Description |
|---------|-------------|
| `/compact` | Manually trigger context compaction |
| `/context` | Show context window usage visualization |
| `/cost` | Show session cost breakdown |
| `/diff` | Show git diff of current changes |
| `/help` | Show available commands |
| `/history` | Browse command history |
| `/mcp` | Manage MCP server connections |
| `/memory` | View/edit memory files |
| `/permissions` | View/manage permission rules |
| `/plan` | Enter plan mode |
| `/plugin` | Manage plugins |
| `/resume` | Resume a previous session |
| `/rewind` | Undo changes to a previous checkpoint |
| `/settings` | View/modify settings |
| `/share` | Share session as GitHub Gist |
| `/skill` | Load a specific skill |
| `/status` | Show session status |
| `/theme` | Change terminal theme |
| `/vim` | Toggle Vim mode |
| `/worktree` | Manage git worktrees |

---

## Appendix B: Feature Parity Checklist

Every item below MUST be implemented with observable behavior matching this spec:

- [ ] Agent loop with streaming (text + thinking + tool calls)
- [ ] Plan mode (read-only exploration)
- [ ] Permission modes (default/acceptEdits/plan/auto/dontAsk/bypass)
- [ ] Subagents with isolated context
- [ ] Hooks at 20+ lifecycle events
- [ ] Skills (SKILL.md format)
- [ ] Plugins + marketplace
- [ ] Memory files (AGENTS.md/CLAUDE.md)
- [ ] MCP client (all transports + OAuth)
- [ ] Context compaction (auto + manual)
- [ ] Checkpointing + rewind
- [ ] Git worktrees
- [ ] Background tasks
- [ ] Slash commands (20+)
- [ ] Cost tracking
- [ ] Headless `-p` mode
- [ ] Theme system (dark/light/daltonized)
- [ ] Keyboard navigation (full TUI)
- [ ] Auto-update mechanism
- [ ] Session forking and sharing
- [ ] Cross-agent delegation
- [ ] Web dashboard
- [ ] Built-in eval harness
- [ ] Sandboxing (platform-native)
- [ ] Code-mode batching (v2)
