# Show HN draft

> Publish at https://news.ycombinator.com/submit — "Show HN" format.
> Do not post before the pre-flight checklist in [README.md](./README.md) is green.

## Title

```
Show HN: Forge – an open-source CLI coding agent you can extend at every layer
```

## Body

```
forge is a from-scratch, open-source coding agent for the terminal, built in
TypeScript on Bun. Repo: https://github.com/inbesat/Munchkin-CLI

Why build another agent? We wanted one where every layer is swappable without
forking: tools, providers, storage, UI hooks, sandboxes. The agent loop itself
is intentionally tiny (~100 lines, mini-swe-agent style); the value lives in
the runtime around it.

What works today:

- Event-sourced sessions — one append-only log per session; resume, fork,
  replay, full-text search and a trajectory browser are all derived views of
  that stream.
- Permission-first tooling — six permission modes (default / acceptEdits /
  plan / auto / bypass / dontAsk) plus layered allow/deny/ask rules. Every
  tool call passes a permission engine before it touches your disk.
- 11 built-in tools (read/write/edit/glob/grep/bash todo/web-fetch/web-search/
  notebook-edit/parallel), sandboxed execution with platform providers for
  Windows ACL restricted tokens, macOS Seatbelt, Linux Landlock (bubblewrap),
  Docker, and remote clouds (E2B/Daytona).
- Provider-agnostic models — Anthropic, OpenAI and Google are wired today;
  adapters exist for DeepSeek, Ollama, Bedrock and Vertex on the same config
  shape. Switching providers is a two-line config change.
- Client/server split — `forge serve` exposes a Hono HTTP API with SSE
  streaming, an OpenAPI spec (/api/openapi.json) and Scalar docs (/docs).
  The TUI is one client; IDE extensions, dashboards and bots are peers.
- MCP both ways — forge attaches any MCP server's tools as a client and can
  expose itself as an MCP server over stdio.
- Plugins — forge.plugin.json manifests, a hook engine, bundled marketplace
  of starter plugins, generated plugin docs.
- Git built in — checkpoints/rewind over the event log, worktree flows,
  GitHub App webhook for PR review automation.
- Evals — an SWE-bench-lite runner with a per-release regression gate.

Install: prebuilt binaries from GitHub Releases, or build from source with
Bun >= 1.2. First run is `forge setup`, a five-question wizard that writes
provider/key/model/theme/permission-mode to ~/.config/forge/settings.json.

Docs: https://inbesat.github.io/Munchkin-CLI/
Privacy: telemetry is opt-in and off by default (https://github.com/inbesat/Munchkin-CLI/blob/main/docs/privacy.md)

Known rough edges: the interactive TUI is in preview; the npm package is
prepared but publication is pending a rename (the unscoped `forge` name is
taken on the registry). Local model wiring (Ollama) is next.

We're looking for feedback on the architecture and, especially, whether the
permission model is the right shape for real teams.
```

## First comment (post as the submitter)

```
Author here. A few implementation notes that might be of interest:

- The whole state model is one append-only event log per session. Resume,
  fork, replay, search, the trajectory browser and even the telemetry are
  just readers over that stream — there is no second source of truth to sync.
- The permission engine evaluates every tool call: mode defaults → layered
  user/project/session rules → risk classification. `plan` mode is read-only
  by construction (writes and bash are denied), which we use for planning
  sessions on unfamiliar repos.
- Sandboxes: we ship five provider backends behind one interface (Windows
  restricted tokens, Seatbelt, Landlock via bubblewrap, Docker/Podman,
  E2B/Daytona remotes). The interface returns a verdict object, never throws,
  so a broken provider degrades instead of killing the loop.
- Everything is a plugin: the loader validates manifests, isolates failures
  per plugin, and the marketplace directory in the repo doubles as the
  on-disk spec.

The phased build is public — ~150 phases are written up in plans/PLAN.md with
their test evidence in plans/AUDIT_REPAIR_STATUS.md, including the phases
where we broke things and repaired them.

Happy to answer questions about any layer. What would you want to configure
first: providers, permissions, or the tool set?
```

## Notes for the poster

- Best window: Tue–Thu, 8–10 AM ET.
- Reply to every substantive comment within the first 3 hours.
- Do not cross-link to other social channels in-thread.
