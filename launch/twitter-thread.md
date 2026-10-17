# X/Twitter thread draft (10 posts)

> Post from your account. Attach the GIFs from `packages/landing/public/demos/`
> as noted. Verify the pre-flight checklist in [README.md](./README.md) first.

## Posts

**1/10** (attach `setup.gif`)

> We spent 6 months building forge: an open-source CLI coding agent where
> every layer is swappable — tools, models, permissions, sandboxes, UI.
> TypeScript on Bun, ~150 documented build phases, zero black boxes. 🧵

**2/10**

> The core idea: the agent loop is tiny (~100 lines). The value is the runtime
> around it. So we made everything a plugin — providers, tools, storage, hook
> engine, marketplace. Fork the loop, not the project.

**3/10** (attach `doctor.gif`)

> Every session is one append-only event log. Resume, fork, replay, full-text
> search, trajectory browsing — all derived views of the same stream. No
> second source of truth, nothing to sync.

**4/10** (attach `help.gif`)

> One binary, every surface: interactive TUI, one-shot print mode, a full
> HTTP API (`forge serve`, OpenAPI + Scalar built in), RPC over stdio for
> editors, and worktree/eval/auth/doctor/telemetry CLIs.

**5/10**

> Permission-first by design: six modes from ask-before-writes to fully
> autonomous-with-circuit-breakers, plus layered allow/deny/ask rules per
> user → project → session. Every tool call passes the engine before it
> touches your disk.

**6/10**

> Model switching is two lines of config. Anthropic, OpenAI and Google are
> wired today; DeepSeek, Ollama, Bedrock and Vertex share the adapter layer.
> Local model support is next — the config shape is already there.

**7/10**

> Sandboxing ships with five backends behind one interface: Windows
> restricted tokens, macOS Seatbelt, Linux Landlock (bubblewrap), Docker,
> and remote clouds (E2B/Daytona). A degraded sandbox returns a verdict —
> it never takes the loop down.

**8/10**

> MCP both ways: forge attaches any MCP server's tools as a client, and
> exposes itself as an MCP server over stdio — so your IDE or another agent
> can drive forge.

**9/10**

> Git is built in: checkpoints and rewind over the event log, worktree flows
> (list/create/merge/remove), and a GitHub App that reviews PRs. There's an
> SWE-bench-lite eval runner with a release regression gate, too.

**10/10**

> Prebuilt binaries on GitHub Releases, docs live:
> Repo → https://github.com/inbesat/Munchkin-CLI
> Docs → https://inbesat.github.io/Munchkin-CLI/
> Star it if agent extensibility is your thing; issues welcome. What would
> you configure first — providers, permissions, or tools?

## Notes for the poster

- Alternate posting times: posts 1–3 in the morning, 4–7 midday, 8–10 evening.
- Quote-tweet post 1 from the project account after post 10 lands.
- Update post 10's links if the docs URL changes.
