# Configuration

forge merges three config scopes with later sources winning:

1. **Defaults** (built in)
2. **Global** — `%USERPROFILE%\.config\forge\settings.json` (Windows) or `~/.config/forge/settings.json` (macOS/Linux)
3. **Project** — `.forge/settings.json` in the repo
4. **Local** — `.forge/settings.local.json` in the repo

Unknown keys are preserved across edits. Invalid JSON is refused rather than silently rewritten. `forge setup` only writes the global scope.

## Keys

| Key | Shape | Notes |
| --- | --- | --- |
| `model` | `{ "provider": "anthropic", "model": "claude-sonnet-4-20250514" }` | Default for print mode; used when no `--model` flag or `FORGE_MODEL` env is given |
| `providers.<name>.apiKey` | `"sk-…"` or `"$ANTHROPIC_API_KEY"` | A `"$VAR"` string is expanded from the environment by the model resolver at run time; keys stored in other config spots are also looked up as a fallback |
| `permissions.mode` | `"default" \| "acceptEdits" \| "plan" \| "auto" \| "bypass" \| "dontAsk"` | See the permission modes table below |
| `permissions.rules` | allow/deny/ask patterns | Layered user → project → session, matched by tool name + input |
| `theme` | string | TUI color theme id |
| `telemetry.enabled` | boolean | Off by default; `forge telemetry` manages opt-in |

Environment variables recognized directly by the CLI: `FORGE_MODEL`,
`FORGE_NO_UPDATE_CHECK=1`, `FORGE_UPDATE_ENDPOINT`. The server additionally
accepts `--port/--host/--base-dir/--db/--cors/--auth-token` flags (run
`forge serve --help`).

## Permission modes

The active mode decides how tool calls are evaluated without any explicit rule:

| Mode | Read operations | Write operations | Bash commands |
| --- | --- | --- | --- |
| `default` | allow | ask | ask |
| `acceptEdits` | allow | allow | ask |
| `plan` | allow | deny | deny |
| `auto` | allow | allow | allow (with safety checks) |
| `bypass` | allow | allow | allow (circuit breakers active) |
| `dontAsk` | allow | allow | allow (no prompts) |

Rules layered on top can allow, deny, or always-ask specific tools/patterns regardless of mode, in order: user rules → project rules → session rules (`/permissions`) → mode defaults.

## Example

```json
{
  "model": { "provider": "google", "model": "gemini-2.5-pro" },
  "providers": {
    "google": { "apiKey": "$GOOGLE_API_KEY" },
    "anthropic": { "apiKey": "$ANTHROPIC_API_KEY" }
  },
  "permissions": {
    "mode": "acceptEdits",
    "rules": [
      { "type": "deny", "tool": "Bash", "pattern": "rm -rf*" }
    ]
  }
}
```
