# VISION.md — Forge Product Vision

**What is Forge?**
Forge is an open-source, from-scratch CLI coding agent — a Claude Code alternative with a plugin-everything architecture, sexy terminal UI, and client/server design that makes multiple frontends first-class citizens. Built in TypeScript + Bun. Powered by OpenTUI.

**Who is it for?**
- Solo developers who want a fast, customizable CLI agent without vendor lock-in
- Teams who want to self-host an agent infrastructure with fleet visibility
- Plugin authors who want to extend an agent with custom tools, providers, and workflows
- Tinkerers who want to understand, fork, and modify every line of the agent runtime

**Why would someone use it instead of Claude Code, opencode, or dsh?**

Three things no single competitor has today:

1. **Client/Server Split.** The server is the product. The TUI is one client. IDE extensions, web dashboards, bots, and other AI agents are all first-class clients. opencode has this partially. Claude Code does not. Forge takes it further: the server manages sessions, permissions, and tools; clients are thin wrappers.

2. **Plugin Kernel Simpler Than Cordis.** Every provider, tool, sandbox, storage backend, and UI component is swappable via plugins. No proprietary code injection. No Cordis complexity. Just a clean hook-and-lifecycle system inspired by dsh, but designed for agent workflows.

3. **Cross-Agent Delegation.** Forge can spin up sub-agents (Claude Code, GPT, Gemini) and orchestrate them. It's not locked to one model or one provider. You can use Claude for architecture, GPT for tests, and Gemini for documentation — all in one session.

**Additional differentiators:**
- Built-in eval harness (SWE-bench-lite integration) for measuring agent performance
- Web dashboard fleet view for monitoring multiple concurrent agent sessions
- Verification gates that require the agent to prove its work before marking tasks complete
- Session forking, replay, and share — resume any past session, fork into a new branch, or share a session URL
- Progressive skill loading — skills load when relevant, MCP tools load lazily, subagents run in isolation

**How does it compare?**

| Feature | Claude Code | opencode | dsh | Forge |
|---|---|---|---|---|
| Client/Server | No | Partial | No | Yes |
| Plugin system | No | Yes (built-in) | Yes (Cordis) | Yes (simpler) |
| Cross-agent delegation | No | No | No | Yes |
| Built-in evals | No | No | No | Yes |
| Web dashboard | No | No | No | Yes |
| Session replay/share | No | No | No | Yes |
| Verification gates | No | No | No | Yes |

**Success metrics:**
- Can a developer set up and run Forge in under 3 minutes?
- Can a plugin author write a new tool in under 30 lines?
- Can a team monitor 10 concurrent agent sessions from a web dashboard?
- Does the eval harness produce reproducible benchmark scores?
- Can someone fork Forge and have a working custom agent in under 1 hour?

**Non-goals (for now):**
- Mobile app (desktop CLI + web dashboard only)
- Built-in code editor (use your own editor, Forge calls your tools)
- Multi-language runtime (TypeScript + Bun only for v1)
- Enterprise SSO/auth (plain API keys and local config for now)

**North star:** The agent loop is small (~100 lines, proven by mini-swe-agent). The value is the runtime, the tooling ecosystem, and the UX around it. Forge makes that runtime open, extensible, and beautiful.
