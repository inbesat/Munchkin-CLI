# CONNECTORS_AND_MCPS.md — All External Integrations

Every MCP server, protocol, connector, and integration this project supports or plans to support.

---

## MCP Servers

### Tier 1 — Bundled Configs (Ship Day-One Support)

These are pre-configured in the agent's default setup. Users get them with zero configuration.

| MCP Server | Package | Transport | Purpose | Package Name |
|---|---|---|---|---|
| **GitHub** | `@modelcontextprotocol/server-github` | Remote HTTP | Repos, PRs, issues, code search, Actions | `mcp-github` |
| **Context7** | `@upstash/context7-mcp` | Remote HTTP | Version-specific library docs (prevents hallucinated APIs) | `mcp-context7` |
| **Playwright** | `@playwright/mcp` | Local stdio | Browser automation via accessibility tree (no vision model needed) | `mcp-playwright` |
| **Filesystem** | `@modelcontextprotocol/server-filesystem` | Local stdio | Sandboxed local file read/write | `mcp-filesystem` |
| **Memory** | `@modelcontextprotocol/server-memory` | Local stdio | Knowledge graph for persistent cross-session memory | `mcp-memory` |
| **Sequential Thinking** | `@modelcontextprotocol/server-sequential-thinking` | Local stdio | Structured reasoning scratchpad for planning | `mcp-thinking` |

### Tier 2 — One-Line Install (`/connect github`)

These are documented and installable via a simple command, but not bundled by default.

| MCP Server | Package | Transport | Purpose | Install Command |
|---|---|---|---|---|
| **Supabase** | `@supabase/mcp-server-supabase` | Remote HTTP | Database, schema, SQL, branches, edge functions | `/connect supabase` |
| **Postgres** | `@modelcontextprotocol/server-postgres` | Local stdio | Direct PostgreSQL queries | `/connect postgres` |
| **Sentry** | `@sentry/mcp-server` | Remote HTTP | Production error context, stack traces, issue details | `/connect sentry` |
| **Linear** | `@linear/mcp-server` | Remote HTTP | Issue tracking, project management | `/connect linear` |
| **Notion** | `@notionhq/notion-mcp-server` | Remote HTTP | Workspace docs, wikis, task tracking | `/connect notion` |
| **Slack** | `@modelcontextprotocol/server-slack` | Local stdio | Channel messages, search, team communication | `/connect slack` |
| **Figma** | `@anthropic/mcp-server-figma` | Local stdio | Design-to-code from Figma Dev Mode | `/connect figma` |
| **Docker** | Community | Local stdio | Container management, dev environments | `/connect docker` |
| **Cloudflare** | `@cloudflare/mcp-server` | Remote HTTP | Edge deployment, KV/R2/D1 management | `/connect cloudflare` |
| **Stripe** | `@stripe/agent-toolkit` | Local stdio | Payment data, transaction analysis | `/connect stripe` |

### Tier 3 — Web Search & Crawl

| MCP Server | Package | Purpose | Notes |
|---|---|---|---|
| **Exa** | `@exa/mcp-server` | Semantic web search (embeddings-based) | 81% accuracy vs Tavily's 71%. Usage-based pricing. |
| **Tavily** | `@tavily/mcp-server` | Web search + research mode | Acquired by Nebius. Predictable costs. |
| **Firecrawl** | `@firecrawl/mcp-server` | Search, scrape, crawl, clean web content | Good for evidence gathering. Paid credits for crawling. |
| **Brave Search** | Community | Live web grounding | Needs API key. Quality varies. |

### Tier 4 — Chrome & Debugging

| MCP Server | Package | Purpose | Notes |
|---|---|---|---|
| **Chrome DevTools** | Official | Console, network, performance, screenshots | For diagnosing why pages fail, not just testing clicks |
| **Puppeteer** | Official | Browser automation (alternative to Playwright) | Lighter but less cross-browser |

### Tier 5 — Collaboration & Business Tools

| MCP Server | Package | Purpose |
|---|---|---|
| **Google Drive** | Community | Document access and editing |
| **Google Calendar** | Community | Schedule and meeting context |
| **Jira** | Community | Enterprise issue tracking |
| **Confluence** | Community | Enterprise documentation |
| **Zapier** | Official | Connect 8,000+ apps with 30,000+ actions |
| **HubSpot** | Community | CRM and sales data |
| **Twilio** | Community | SMS/voice notifications |

### Tier 6 — Database & Data

| MCP Server | Package | Purpose |
|---|---|---|
| **MCP Toolbox for Databases** | Google Official | PostgreSQL, MySQL, multi-DB schema/query workflows |
| **Redis** | Community | Cache inspection, session data |
| **MongoDB** | Community | Document database queries |
| **ClickHouse** | Community | Analytics database queries |

### Tier 7 — Infrastructure & DevOps

| MCP Server | Package | Purpose |
|---|---|---|
| **Terraform** | Community | Infrastructure-as-code management |
| **Kubernetes** | Community | Cluster management |
| **AWS** | Community | AWS service management |
| **GCP** | Community | Google Cloud management |
| **Azure** | Community | Microsoft Azure management |

---

## Agent Client Protocol (ACP)

**Purpose:** Enable editor integration (Zed, Neovim, JetBrains, VS Code).

**Protocol:** JSON-RPC 2.0 over stdio.
**Endpoints:** `initialize`, `session/new`, `session/prompt`, `session/cancel`
**Notifications:** `session/update` (text deltas, thinking, tool calls)
**Permission routing:** `session/request_permission`

**Supported editors:**
| Editor | ACP Support | Notes |
|---|---|---|
| Zed | Native ACP | Zed pioneered the protocol |
| Neovim | Via plugin | Built-in LSP-like integration |
| JetBrains | Via plugin | IntelliJ, WebStorm, PyCharm, etc. |
| VS Code | Custom extension | May use ACP or custom protocol |

---

## LSP Integration

**Purpose:** Post-edit type checking, symbol navigation, diagnostics.

**How it works:**
1. Agent edits a file (via Edit/Write tool)
2. LSP client detects file change
3. LSP client queries diagnostics from the language server
4. Diagnostics (type errors, warnings) are fed back to the agent
5. Agent can then fix errors in the next iteration

**Supported languages (via existing LSP servers):**
TypeScript/JavaScript (tsserver), Python (pyright/pylsp), Rust (rust-analyzer), Go (gopls), C/C++ (clangd), and any LSP-compatible server.

---

## Git Integration

**Built-in tools (not MCP):**
- `git status`, `git diff`, `git log`, `git commit`, `git push`
- Worktree creation/management
- GitHub CLI (`gh`) integration
- GitHub Actions trigger (via label or comment)
- GitLab CI/CD trigger

---

## Authentication Flows

**OAuth providers supported:**
- Claude Pro/Max (via claude.ai OAuth)
- ChatGPT Plus/Pro (via OpenAI OAuth)
- GitHub Copilot (via GitHub OAuth)
- Google Vertex (via Google OAuth)
- xAI (via API key)
- OpenRouter (via API key)
- Any OpenAI-compatible endpoint (via API key)

**Auth storage:** `~/.config/forge/auth/` (encrypted keyring or encrypted JSON)

---

## Our Own MCP Server

**Purpose:** Expose our agent's capabilities to other tools.

**Exposes:**
- Session creation and management
- Tool execution interface
- Event streaming
- Plugin management

This lets other agents (Claude Code, Codex, Cursor) delegate work to our agent via MCP — making us a first-class citizen in the MCP ecosystem.

---

## Connector Priority Order

1. **Phase 105-106:** MCP client core (stdio transport) — enables all local servers
2. **Phase 107-108:** SSE/streamable-http — enables remote servers (GitHub, Supabase)
3. **Phase 109:** OAuth flow — enables authenticated servers
4. **Phase 110:** Tool-search lazy loading — prevents context flooding
5. **Phase 111:** Bundled connector presets (GitHub/Context7/Playwright/Filesystem/Memory/Thinking)
6. **Phase 112:** Connector wizard (`/connect`)
