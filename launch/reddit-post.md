# Reddit post drafts

> Read each subreddit's self-promotion rules before posting; both drafts are
> written as discussions, not ads. Verify the pre-flight checklist in
> [README.md](./README.md) first. Account age/karma requirements may apply.

---

## Variant A — r/LocalLLaMA

**Title:** We built an open-source CLI coding agent with a plugin architecture — local model wiring is the next milestone, arch feedback welcome

**Body:**

```
Over the last months we built forge, an open-source terminal coding agent in
TypeScript/Bun: https://github.com/inbesat/Munchkin-CLI

Why post it here: we want local/self-hosted model support to be a first-class
path, and the groundwork is in. Being upfront about current state:

- Wired today: Anthropic, OpenAI, Google (the model resolver resolves presets
  + API keys for these three).
- Adapter layer already covers DeepSeek, Ollama, Bedrock and Vertex on the
  same config shape — local wiring is the next milestone, literally the next
  thing on the board.

What exists around the model layer that we think matters for this community:

- Self-hosted gateway package (packages/gateway): an OpenAI-compatible relay
  with quotas, so teams can front whatever backend they run with one API.
- Everything provider-agnostic by config: switching providers is literally
  editing two lines in ~/.config/forge/settings.json.
- Zero telemetry by default. The opt-in payload is documented in
  docs/privacy.md (install-id + counters; no code, no prompts) — and it stays
  off unless you flip it on.

The rest of the stack, briefly: event-sourced sessions (one append-only log;
resume/fork/replay/search), a permission engine (six modes + layered
allow/deny/ask rules, every tool call gated), 11 built-in tools, sandbox
providers (Windows ACL restricted tokens, macOS Seatbelt, Linux
Landlock/bubblewrap, Docker, E2B/Daytona remotes), MCP client + server,
plugin marketplace, checkpoints/rewind/worktrees, and an SWE-bench-lite
eval runner with a per-release regression gate.

Prebuilt binaries ship via GitHub Releases; build from source needs just Bun.

Questions we'd love input on:
1. For those running local models through Ollama/vLLM: which quirks matter
   most to an agent harness (tool-call format differences, context-window
   accounting, streaming timeouts)?
2. Is an OpenAI-compatible relay the right contract for local backends, or
   would you want a native provider interface for each?

Repo: https://github.com/inbesat/Munchkin-CLI
Docs: https://inbesat.github.io/Munchkin-CLI/
```

---

## Variant B — r/programming

**Title:** We wrote a coding agent with a ~100-line loop and a fully inspectable event log — here's the architecture

**Body:**

```
forge is an open-source terminal coding agent: the loop is deliberately tiny
(~100 lines, mini-swe-agent style) and everything interesting lives in the
runnable, swappable layers around it. Code + a public build log (~150 phases
with test evidence): https://github.com/inbesat/Munchkin-CLI

Three design decisions we think are worth discussing:

1) State is one append-only event log per session
   Resume, fork, replay, full-text search, the trajectory browser, even
   telemetry are readers over that single stream. There is no separate
   session store to keep in sync, which killed a whole class of bugs before
   they could happen.

2) The permission engine gates every tool call
   Six modes (from ask-before-writes to autonomous-with-circuit-breakers)
   plus layered allow/deny/ask rules per user → project → session. Plan mode
   is read-only *by construction* — writes and shell are denied, not
   discouraged.

3) Everything is a plugin
   Providers, tools, sandbox backends (Windows restricted tokens, Seatbelt,
   Landlock/bubblewrap, Docker, E2B/Daytona), storage, UI hooks. The loader
   isolates plugin failures so one broken plugin degrades its own features
   instead of killing the agent.

The honest scoreboard: Anthropic/OpenAI/Google wiring works today; local
model wiring (Ollama) is next; interactive TUI is in preview; npm publication
is pending a rename. The whole phased history — including phases where we
broke the build and repaired it — is in the repo's plans/ directory.

What we found hardest, ask-us-anything: deterministic replay across provider
streaming differences, sandbox API differences across three OSes, and
permission UX that doesn't train users to click "allow" reflexively.
```

---

## Notes for the poster

- r/LocalLLaMA: answer model questions in the first hour; do not post the
  local-wiring milestone as done — the draft only claims it as next.
- r/programming: expect architecture pushback; link the plans/ build log
  rather than arguing from memory.
