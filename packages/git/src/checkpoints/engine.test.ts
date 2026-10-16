import { afterEach, describe, expect, it } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CheckpointEngine } from './engine'

describe('checkpointing engine (Phase 131)', () => {
  const dirs: string[] = []
  afterEach(() => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
    dirs.length = 0
  })

  function makeWorkspace(content = 'v0\n'): { dir: string; file: string } {
    const dir = mkdtempSync(join(tmpdir(), 'forge-checkpoints-'))
    dirs.push(dir)
    const file = join(dir, 'src.ts')
    writeFileSync(file, content, 'utf-8')
    return { dir, file }
  }

  it('snapshots before an edit and creates the journal + blob', () => {
    const { dir, file } = makeWorkspace()
    const engine = new CheckpointEngine(dir)
    const snapshot = engine.snapshotBeforeEdit(file)
    expect(snapshot.ok).toBe(true)
    if (snapshot.ok) {
      expect(snapshot.entry.hash).toHaveLength(64)
      expect(snapshot.blobWritten).toBe(true)
      expect(existsSync(join(dir, '.forge', 'checkpoints', 'blobs', snapshot.entry.hash))).toBe(
        true,
      )
    }
    expect(engine.listCheckpoints(file)).toHaveLength(1)
  })

  it('rollback restores the exact pre-edit content (blueprint: undo any edit)', () => {
    const { dir, file } = makeWorkspace('original body')
    const engine = new CheckpointEngine(dir)

    const snapshot = engine.snapshotBeforeEdit(file)
    expect(snapshot.ok).toBe(true)

    // The "edit" lands.
    writeFileSync(file, 'edited body', 'utf-8')
    expect(readFileSync(file, 'utf-8')).toBe('edited body')

    const rollback = engine.rollback(file)
    expect(rollback.ok).toBe(true)
    if (rollback.ok) expect(rollback.alreadyReverted).toBe(false)
    expect(readFileSync(file, 'utf-8')).toBe('original body')
  })

  it('rolls back to a specific checkpoint id, and detects already-reverted', () => {
    const { dir, file } = makeWorkspace('v1')
    const engine = new CheckpointEngine(dir)

    const s1 = engine.snapshotBeforeEdit(file)
    expect(s1.ok).toBe(true)
    writeFileSync(file, 'v2', 'utf-8')
    expect(engine.snapshotBeforeEdit(file).ok).toBe(true)
    writeFileSync(file, 'v3', 'utf-8')
    expect(engine.snapshotBeforeEdit(file).ok).toBe(true)

    const history = engine.listCheckpoints(file)
    expect(history).toHaveLength(3)
    const first = s1.ok ? s1.entry.id : ''

    const rollback = engine.rollback(file, first)
    expect(rollback.ok).toBe(true)
    expect(readFileSync(file, 'utf-8')).toBe('v1')

    // Rolling back again detects the no-op.
    const noop = engine.rollback(file, first)
    expect(noop.ok).toBe(true)
    if (noop.ok) expect(noop.alreadyReverted).toBe(true)
  })

  it('deduplicates identical content: many checkpoints, few blobs', () => {
    const { dir, file } = makeWorkspace('same\n')
    const engine = new CheckpointEngine(dir)

    // Five snapshots of alternating content - only two unique blobs exist.
    for (const content of ['same\n', 'different\n', 'same\n', 'different\n', 'same\n']) {
      writeFileSync(file, content, 'utf-8')
      expect(engine.snapshotBeforeEdit(file).ok).toBe(true)
    }

    const entries = engine.listCheckpoints(file)
    expect(entries).toHaveLength(5)
    const uniqueHashes = new Set(entries.map((entry) => entry.hash))
    expect(uniqueHashes.size).toBe(2)
    const stats = engine.stats()
    expect(stats.entries).toBe(5)
    expect(stats.blobs).toBe(2)
  })

  it('clear removes all snapshot storage; unknown files report cleanly', () => {
    const { dir, file } = makeWorkspace()
    const engine = new CheckpointEngine(dir)
    engine.snapshotBeforeEdit(file)
    engine.clear()
    expect(engine.listCheckpoints()).toEqual([])
    expect(engine.stats()).toEqual({ entries: 0, blobs: 0 })

    const missingRollback = engine.rollback(file)
    expect(missingRollback.ok).toBe(false)
    if (!missingRollback.ok) expect(missingRollback.error).toContain('no checkpoints')
  })
})
