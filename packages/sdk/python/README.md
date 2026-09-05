# forge-sdk (Python)

Typed Python client for the [Forge](https://github.com/forge/forge) server.
Phase 79: drives the `forge rpc` JSON-RPC 2.0 server over a subprocess
(stdin/stdout newline-delimited JSON). Zero external dependencies.

## Install

```bash
# Editable install (from the monorepo)
cd packages/sdk/python
pip install -e .

# Or copy `forge_sdk/` into your project
```

You also need a `forge` binary on `PATH` (or set `FORGE_BIN=/path/to/forge`).
The monorepo build emits one at `packages/server/dist/bin/forge.js`; you
can run it via Bun:

```bash
export FORGE_BIN="$REPO/packages/server/dist/bin/forge.js"
```

## Usage

### Sync

```python
from forge_sdk import ForgeClient

with ForgeClient.spawn(base_dir="/tmp/forge") as forge:
    health = forge.system.health()
    session = forge.sessions.create(cwd="/tmp", model="auto")
    result = forge.prompts.submit(session["id"], "Summarize the repo")
    print(result["response"])
```

### Async

```python
import asyncio
from forge_sdk import AsyncForgeClient

async def main():
    async with await AsyncForgeClient.spawn() as forge:
        ready = await forge.system.ready()
        sessions = await forge.sessions.list()

asyncio.run(main())
```

### Custom transport (tests)

```python
from forge_sdk.client import ForgeClient
from forge_sdk.transport import ProcessTransport

transport = ProcessTransport(forge_path="/usr/local/bin/forge", base_dir="/tmp/forge")
client = ForgeClient(transport)
# ...
client.close()
```

## Resource groups

| Resource    | Methods                                              |
| ----------- | ---------------------------------------------------- |
| `system`    | `health()`, `ready()`                                |
| `sessions`  | `create()`, `list()`, `get()`, `delete()`, `search()`, `events()` |
| `prompts`   | `submit()`                                           |
| `tools`     | `list()`, `get()`, `execute()`                       |
| `config`    | `all()`, `defaults()`                                |
| `sse`       | `subscribe()`                                        |

## Errors

- `ForgeTransportError` — couldn't start the subprocess, EOF, timeout.
- `ForgeApiError` — server returned a JSON-RPC error (carries `code`,
  `message`, `data`).

## Tests

```bash
# Pure unit tests (no forge binary required)
python -m unittest tests.test_protocol

# End-to-end (spawns a real `forge rpc` subprocess)
FORGE_BIN="$REPO/packages/server/dist/bin/forge.js" \
  python -m unittest tests.test_e2e
```

## Part of the Forge Monorepo

- Spec: `plans/PLAN.md` (Phase 79)
- Decisions: `plans/DECISIONS_LOG.md` (ADR-038)
- TypeScript SDK: `../js/` (Phase 76)
- Server JSON-RPC surface: `packages/server/src/rpc/`
