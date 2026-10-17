#!/usr/bin/env bun
/**
 * `forge` CLI entry. Imports the CLI adapter and runs it against
 * `process.argv`. Kept separate from `src/cli.ts` so tests can import
 * `parseArgs`/`run` without spinning up a real server.
 */
import { VERSION, refreshUpdateCache, updateNotice } from '@forge/core'
import { run } from '../cli'

// Phase 150: launch-time update check. The notice itself is cache-only (no
// network, instant); a stale cache triggers a background refresh for the next
// launch. `FORGE_NO_UPDATE_CHECK=1` disables both (CI, smoke tests).
if (process.env.FORGE_NO_UPDATE_CHECK !== '1') {
  const notice = updateNotice({ currentVersion: VERSION })
  if (notice) process.stderr.write(`${notice}\n`)
  void refreshUpdateCache({ currentVersion: VERSION })
}

run(process.argv.slice(2)).then(
  (code) => {
    if (code !== 0) process.exit(code)
  },
  (err) => {
    process.stderr.write(
      `forge: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`,
    )
    process.exit(1)
  },
)
