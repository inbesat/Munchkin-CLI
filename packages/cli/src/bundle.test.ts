import { describe, expect, it } from 'bun:test'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { BUNDLE_ENTRY, BUNDLE_OUTFILE, bundleCommandArgs } from './bundle'

describe('cli bundle script (Phase 150)', () => {
  it('constructs the bun bundle command', () => {
    expect(bundleCommandArgs('entry.ts', 'out.js')).toEqual([
      'build',
      'entry.ts',
      '--outfile',
      'out.js',
      '--target=bun',
    ])
  })

  it('points at the real CLI entry inside the repo', () => {
    const root = join(import.meta.dir, '..', '..', '..')
    expect(existsSync(join(root, BUNDLE_ENTRY))).toBe(true)
    expect(BUNDLE_OUTFILE).toBe('dist/forge.js')
  })
})
