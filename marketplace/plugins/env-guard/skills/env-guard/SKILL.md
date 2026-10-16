---
name: env-guard
description: Block credential-file edits; suggest env-var patterns.
triggers:
  - edit env file
  - change .env
  - add a secret
---

## Env guard protocol

1. Refuse to edit `.env`, `.env.*`, credentials files, and key material. Suggest the change as an instruction instead.
2. New integrations read config from environment variables; document the required keys in a `.env.example` with empty values.
3. Never echo secret values back into chat, logs, or tests ? reference them by KEY name only.
4. If a secret is found committed, state the exposure plainly and the rotation steps; do not just delete the line.
5. Persistent configuration (keys, URLs) goes into the project config system, not hardcoded defaults.
