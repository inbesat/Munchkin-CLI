# Forge Plugin Format (Phase 108)

A **forge plugin** is a directory that packages extension parts for the forge CLI. Plugins distribute via npm, git repositories, or plain local paths — all reduce to a directory on disk.

## Layout

```
<plugin-name>/
  forge.plugin.json     # required manifest
  skills/               # SKILL.md skill folders (Phase 106 loader)
  hooks/                # hook configs / scripts (Phases 103-105 engine)
  agents/               # agent definition .md files (Phase 94 loader)
  mcp/                  # MCP server configs (Phase 117+)
  commands/             # slash command definitions
```

Every part directory is optional; ship only what the plugin needs.

## Manifest: `forge.plugin.json`

```json
{
  "name": "forge-test-plugin",
  "version": "1.2.0",
  "description": "A sample forge plugin.",
  "author": "forge-tester",
  "forgeVersion": ">=0.1.0",
  "parts": {
    "skills": true,
    "hooks": true,
    "agents": true,
    "mcp": true,
    "commands": true
  }
}
```

| Field | Required | Type | Notes |
|---|---|---|---|
| `name` | yes | string | Non-empty plugin name |
| `version` | yes | string | Semver (`1.0.0`) |
| `description` | no | string | Human-readable summary |
| `author` | no | string | Attribution |
| `forgeVersion` | no | string | Forge compatibility constraint |
| `parts` | no | object | Booleans per part directory |

Validation is strict on required fields and types; unknown fields are tolerated forward-compatibly.

## Loading

```ts
import { loadPlugin } from '@forge/plugin-kernel'

const plugin = loadPlugin('./my-plugin')
// { ok: true, manifest, parts, presentDirs, errors }
```

Failures (missing/invalid manifest) return `ok: false` with collected `errors` — never throws.
