# Getting started

Everything you need to install forge, connect a model provider, and run your first agent turn.

## Requirements

- A terminal (Windows, macOS, or Linux).
- A provider API key for at least one of the wired providers: **Anthropic**, **OpenAI**, or **Google**. (Config entries for DeepSeek, Bedrock, and Vertex are stored too, but the model resolver currently activates the three wired providers only.)
- **For prebuilt binaries:** nothing else — they are self-contained.
- **For running from source:** [Bun](https://bun.sh) >= 1.2 (`bun install` in the repo root, then `bun packages/server/src/bin/forge.ts`).

## Install

The npm package is prepared in `packages/cli` but publication is pending — the
unscoped `forge` name on the npm registry is already occupied and a scoped rename
is tracked in [`packaging/README.md`](https://github.com/inbesat/Munchkin-CLI/tree/main/packaging).
Until then, use one of these channels:

- **GitHub Releases (recommended):** download the platform archive for your OS
  (for example `forge-win-x64.zip`) plus `checksums.txt` from the
  [Releases page](https://github.com/inbesat/Munchkin-CLI/releases).
- **Homebrew:** the `packaging/homebrew/forge.rb` formula uses the release
  binaries (tap setup described in the packaging README).
- **Scoop (Windows):** manifest at `packaging/scoop/forge.json`.
- **WinGet (Windows):** manifests `packaging/winget/Inbesat.Forge.yaml`.

## Configure: `forge setup`

```sh
forge setup
```

The wizard walks through five questions and writes your global config:

1. **Provider** — anthropic / openai / google / deepseek / bedrock / vertex (bedrock and vertex use cloud credentials instead of an API key; deepseek shows a "not yet wired" note).
2. **API key** — stored under `providers.<name>.apiKey`; the value may also reference an environment variable as `"$ANTHROPIC_API_KEY"`, which the model resolver expands at run time.
3. **Model** — chosen from the provider's real model presets (for Anthropic these include `claude-opus-4-20250514`, `claude-sonnet-4-20250514`, and `claude-haiku-3-5-20241022`).
4. **Theme** — TUI color theme.
5. **Permission mode** — one of `default`, `acceptEdits`, `plan`, `auto`, `bypass`, `dontAsk`.

Everything lands in the global config file:

- **Windows:** `%USERPROFILE%\.config\forge\settings.json`
- **macOS / Linux:** `~/.config/forge/settings.json`

`--yes` accepts all defaults; existing keys and any unknown keys are preserved, and weird input never corrupts the file (invalid JSON is refused). Project-level overrides live in `.forge/settings.json`.

A minimal `settings.json` looks like:

```json
{
  "model": { "provider": "anthropic", "model": "claude-sonnet-4-20250514" },
  "providers": { "anthropic": { "apiKey": "$ANTHROPIC_API_KEY" } },
  "permissions": { "mode": "default" }
}
```

## Run your first turn

```sh
# print mode: one prompt, events streamed to stdout (add --json for the raw event log)
forge -p "Explain this repository's build pipeline"

# pick a model for one run (flag > FORGE_MODEL env > config default)
forge --model google/gemini-2.5-pro -p "Summarize docs/privacy.md"

# interactive TUI
forge
```

In print mode with no `--model`, forge falls back to the configured
`provider/model` from `settings.json` — so after `forge setup`, plain
`forge -p "…"` just works.

## Verify and go further

- `forge doctor` — check the environment (versions, config, providers).
- `forge serve --port 8787` — run the HTTP API server (`GET /health`, OpenAPI at `GET /api/openapi.json`, Scalar UI at `/docs`). See the [HTTP API reference](/reference/api).
- `forge update` — check for a newer release on the npm registry (cached for 24 hours; `FORGE_NO_UPDATE_CHECK=1` disables it, `FORGE_UPDATE_ENDPOINT` overrides the endpoint).
- `forge telemetry` — opt into anonymized usage events (off by default).
- `forge eval` — run the bundled regression/eval suites.
