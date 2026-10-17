#!/usr/bin/env bun
/**
 * Bundles the forge CLI into a single JavaScript file for npm distribution
 * (Phase 150). The published `forge` package runs on the Bun runtime; the
 * standalone binaries from `scripts/build-binary.ts` serve package managers
 * (Homebrew, Scoop, WinGet).
 */
import { statSync } from 'node:fs'
import { join, resolve } from 'node:path'

export const BUNDLE_ENTRY = 'packages/server/src/bin/forge.ts'
export const BUNDLE_OUTFILE = 'dist/forge.js'

export function bundleCommandArgs(entry: string, outfile: string): string[] {
  return ['build', entry, '--outfile', outfile, '--target=bun']
}

export function formatSize(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export async function main(): Promise<number> {
  const packageDir = join(import.meta.dir, '..')
  const root = join(packageDir, '..', '..')
  const entry = join(root, BUNDLE_ENTRY)
  const outfile = resolve(packageDir, BUNDLE_OUTFILE)
  const proc = Bun.spawn(['bun', ...bundleCommandArgs(entry, outfile)], {
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const code = await proc.exited
  if (code !== 0) {
    const stderr = await new Response(proc.stderr).text()
    process.stderr.write(`error: bundle failed\n${stderr}\n`)
    return 1
  }
  process.stdout.write(
    `bundled ${BUNDLE_ENTRY} -> ${BUNDLE_OUTFILE} (${formatSize(statSync(outfile).size)})\n`,
  )
  return 0
}

if (import.meta.main) {
  process.exit(await main())
}
