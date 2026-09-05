import { performance } from 'node:perf_hooks'
import { EventEmitter } from 'node:events'
import React from 'react'

const start = performance.now()

// Import the full public TUI barrel — this is the cold startup cost
// (React + Ink + all components + theme). Shiki is intentionally lazy now
// (see code-block.tsx / diff-viewer.tsx) so it is NOT part of this path.
const tui = await import('../dist/index')
const { render, Box } = await import('ink')

// A minimal "first paint" against a fake stdout represents reaching the
// interactive prompt. We render a tiny static component to prove the
// module graph is fully evaluated and Ink is ready.
const stdout = new EventEmitter() as unknown as NodeJS.WriteStream
;(stdout as unknown as { write: (c: string) => boolean }).write = () => true
;(stdout as unknown as { columns: number }).columns = 80
;(stdout as unknown as { rows: number }).rows = 24
;(stdout as unknown as { isTTY: boolean }).isTTY = true

const instance = render(
  React.createElement(Box, null),
  { stdout },
)
instance.unmount()

const ms = performance.now() - start
// eslint-disable-next-line no-console
console.log(JSON.stringify({ ms: Math.round(ms * 100) / 100, components: Object.keys(tui).length }))
