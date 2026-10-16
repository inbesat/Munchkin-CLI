import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { discoverMemoryFiles } from './discovery'

describe('memory file discovery (Phase 88)', () => {
  let root: string

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'forge-memory-'))
    // Root-level memory.
    writeFileSync(join(root, 'AGENTS.md'), 'root agents rules', 'utf-8')
    // Standard alternate placements.
    mkdirSync(join(root, '.forge'), { recursive: true })
    writeFileSync(join(root, '.forge', 'AGENTS.md'), 'forge dir rules', 'utf-8')
    // Nested directory memory.
    mkdirSync(join(root, 'src', 'auth'), { recursive: true })
    writeFileSync(join(root, 'src', 'auth', 'CLAUDE.md'), 'auth claude rules', 'utf-8')
  })

  afterAll(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('loads root and .forge memory for the project root', () => {
    const found = discoverMemoryFiles(root)
    expect(found.map((m) => m.content)).toEqual(['root agents rules', 'forge dir rules'])
    expect(found.every((m) => m.path.startsWith(root))).toBe(true)
  })

  it('includes nested directory memory for files in that directory', () => {
    const target = join(root, 'src', 'auth', 'login.ts')
    const found = discoverMemoryFiles(root, { forFile: target })
    const contents = found.map((m) => m.content)
    // Parent rules come first, then the closer (more specific) ones.
    expect(contents).toEqual(['root agents rules', 'forge dir rules', 'auth claude rules'])
  })

  it('does not include nested memory for files outside that directory', () => {
    const target = join(root, 'src', 'other.ts')
    const found = discoverMemoryFiles(root, { forFile: target })
    expect(found.some((m) => m.content === 'auth claude rules')).toBe(false)
  })

  it('returns entries for missing directories without throwing', () => {
    const found = discoverMemoryFiles(join(root, 'does-not-exist'))
    expect(found).toEqual([])
  })
})
