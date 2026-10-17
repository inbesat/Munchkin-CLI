# forge — public roadmap

> Living document. Milestones below reflect the actual state of the
> repository; for the full phased build log (~200 work items with test
> evidence) see [plans/PLAN.md](plans/PLAN.md). Last updated: 2026-10-17.

## Shipped

| Milestone | What landed |
| --- | --- |
| Core + agent loop | Append-only event log, sessions (resume / fork / replay / search), 11 built-in tools, permission engine (6 modes, layered rules), subagent orchestration |
| Models | Provider layer + cost engine; Anthropic, OpenAI, Google wired; DeepSeek / Ollama / Bedrock / Vertex adapters on the same config shape |
| Interfaces | Interactive TUI (see status below), print mode (`-p`), HTTP API with SSE + OpenAPI + Scalar, RPC over stdio, TS + Python SDKs |
| Ecosystem | Plugin kernel (manifests, hook engine, marketplace), MCP client + server, connector presets and wizard |
| Safety | Sandbox providers: Windows ACL restricted tokens, macOS Seatbelt, Linux Landlock (bubblewrap), Docker/Podman, E2B/Daytona remotes |
| Git | Checkpoints + rewind, smart commit/PR tools, worktree manager, GitHub App PR review, CI review integration |
| Quality | SWE-bench-lite eval runner, per-release regression gate, stats dashboard, trajectory browser, doctor, opt-in telemetry |
| Distribution | Single-binary compile (5 targets), release workflow with checksums, Homebrew/Scoop/WinGet manifests, VitePress docs site + Astro landing + plugin docs |

Statuses of the sharp edges we know about (kept here because trust is earned,
not asserted): the **interactive TUI** has a committed build defect and is
being repaired in a dedicated stream; the **npm package** is prepared but
publication is pending a rename (the unscoped `forge` name is occupied);
**local model wiring** (Ollama) is configured in the adapter layer but the
resolver currently activates Anthropic / OpenAI / Google.

## Next up (committed)

1. **TUI repair** — fix the committed TUI build defect, restore the component
   suites, and re-enable `forge` (interactive) as the default surface.
2. **npm publication** — finalize the package rename decision documented in
   [packaging/README.md](packaging/README.md) and publish.
3. **Local model wiring** — activate the Ollama/DeepSeek adapter path in the
   model resolver (config keys are already stored), with docs.
4. **Community** — enable GitHub Pages (one manual setting) so the docs site
   + landing go live, create the Discord per
   [launch/discord-setup.md](launch/discord-setup.md), cut the `v0.1.0` release.
5. **First community-facing milestone** — triaged from real issue reports
   after launch; the plugin bounty list (below) seeds the contribution stream.

## Exploratory (not committed)

The following directions exist as placeholder titles in the plan and will be
elaborated only if traction justifies them: mobile companion app, voice
input, desktop app (Tauri), real-time collaboration, database-backed sessions
(PostgreSQL), marketplace revenue, enterprise analytics, SSO/SCIM,
Kubernetes deployment mode, multi-tenant server, scheduled agent runs,
visual diff editor, plugin SDK + certification, and an annual security audit.

No dates are promised on this page. Track concrete work through issues.
