# CLI

Command-line reference for forge, generated from real `forge --help` output of the current source tree (entry point: `packages/server/src/bin/forge.ts`).

::: tip Regenerating
This page is produced by `src/generate-cli-reference.ts` as part of the docs build — do not edit it by hand.
:::

```text
forge 0.1.0

Usage:
  forge serve [options]
  forge rpc [options]
  forge auth <list|create|revoke> [options]
  forge worktree <list|create|merge|remove> [options]
  forge stats [--json] [--base-dir <path>] [--db <path>]
  forge eval <list|run|regress> [--task <id>] [--model <id>] [--config <file>] [--json]
  forge telemetry <status|on|off>
  forge doctor [--json] [--online]
  forge update [--json]
  forge setup [--yes]
  forge help
  forge version

Options:
  --port <n>            TCP port to listen on (default 3000; serve only)
  --host <h>            Interface to bind (default 127.0.0.1; serve only)
  --base-dir <path>     State directory (default $CWD/.forge)
  --db <path>           SQLite path (default <base-dir>/forge.db)
  --cors <origin>       Allow a specific CORS origin (repeatable)
  --no-cors             Disable CORS (default allows '*')
  --auth-token <t>      Require a bearer token on every request (serve only)
  --task <id>           Run a specific eval task (repeatable; eval run only)
  --model <id>          Model id for eval runs (default $FORGE_MODEL)
  GITHUB_WEBHOOK_SECRET  Mount /api/github/webhook (GitHub App; env)
  --help, -h            Show this help
  --version, -v         Show the version

Examples:
  forge serve --port 3845
  forge serve --host 0.0.0.0 --port 8080 --cors https://app.example.com
  forge serve --auth-token $(openssl rand -hex 32)
  forge rpc                          # JSON-RPC over stdio (for editor/Python)
  forge rpc --base-dir /tmp/forge    # custom state dir
  forge auth create --name 'ci-deploy' --env ci
  forge auth list
  forge auth revoke <key-id>
  forge stats                        # usage dashboard (cost, sessions, tools)
  forge stats --json                 # machine-readable stats
  forge eval list                    # list built-in benchmark tasks
  forge eval run --json              # run the eval suite, machine-readable
  forge eval regress                 # release gate: fail on eval regressions
  forge telemetry status             # opt-in state and exactly what is sent
  forge telemetry off                # disable anonymous usage telemetry
  forge doctor                       # diagnose the installation
  forge doctor --json --online       # machine-readable, probe provider reachability
  forge update                       # check npm for a newer forge version
  forge setup                        # first-run onboarding wizard
```
