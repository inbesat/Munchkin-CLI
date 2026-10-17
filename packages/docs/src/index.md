---
layout: doc
---

# forge

A from-scratch, fully customizable, open-source CLI coding agent — TypeScript on Bun, with a plugin-everything architecture.

<div style="display:flex;gap:.75rem;flex-wrap:wrap">
  <a class="VPButton medium primary" href="/Munchkin-CLI/docs/guide/getting-started.html">Get started</a>
  <a class="VPButton medium" href="https://github.com/inbesat/Munchkin-CLI/releases">Download</a>
</div>

## Why forge

- **Event-sourced core.** Every session is an append-only log — resume, fork, replay, and share without losing state.
- **Permission-first.** Six permission modes and layered allow/deny rules mean you decide exactly what the agent may do.
- **Provider-agnostic.** Switch between Anthropic, OpenAI, Google, DeepSeek, Ollama, Bedrock and Vertex by changing two lines of config.
- **Client/server split.** The TUI is one client; the API server (Hono + SSE + OpenAPI) is the product your IDE, dashboard or bot talks to.
- **Experimental free-model gateway** and MCP/connectors for wider model access, plus a **plugin marketplace** for tools and hooks.

## Quick start

```sh
# install (binaries from Releases; see Getting started)
brew install forge            # or scoop / winget / a GitHub release asset

# configure provider + key + model + theme + permissions
forge setup

# run one prompt in print mode, or open the interactive TUI
forge -p "Summarize this repository"
forge

# check the environment, or expose the HTTP API
forge doctor
forge serve --port 8787
```

Use the sidebar on the left for the full guide. The landing page lives at the
[site root](https://inbesat.github.io/Munchkin-CLI/); source of truth for
architecture decisions is [`plans/`](https://github.com/inbesat/Munchkin-CLI/tree/main/plans).
