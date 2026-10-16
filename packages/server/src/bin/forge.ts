#!/usr/bin/env bun
/**
 * `forge` CLI entry. Imports the CLI adapter and runs it against
 * `process.argv`. Kept separate from `src/cli.ts` so tests can import
 * `parseArgs`/`run` without spinning up a real server.
 */
import { run } from '../cli'

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
