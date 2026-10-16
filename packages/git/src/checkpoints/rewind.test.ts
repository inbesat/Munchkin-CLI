import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CheckpointEngine } from './engine'
import { RewindService } from './rewind'

describe('rewind service (Phase 132)', () => {
  const dirs: string[] = []
  afterEach(() => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
    dirs.length = 0
  })

  function makeWorkspace(): { dir: string; fileA: string; fileB: string } {
    const dir = mkdtempSync(join(tmpdir(), 'forge-rewind-'))
    dirs.push(dir)
    const fileA = join(dir, 'a.ts')
    const fileB = join(dir, 'b.ts')
    writeFileSync(fileA, 'a1\n', 'utf-8')
    writeFileSync(fileB, 'b1\n', 'utf-8')
    return { dir, fileA, fileB }
  }

  it('rewinds every file to its state at the chosen checkpoint', () => {
    const { dir, fileA, fileB } = makeWorkspace()
    const engine = new CheckpointEngine(dir)
    const service = new RewindService(engine)

    // Turn 1: checkpoint both files (initial state).
    expect(engine.snapshotBeforeEdit(fileA).ok).toBe(true)
    expect(engine.snapshotBeforeEdit(fileB).ok).toBe(true)
    const points = service.listPoints()
    expect(points).toHaveLength(2)
    expect(points[0]?.filesSoFar).toBe(1)
    expect(points[1]?.filesSoFar).toBe(2)

    // Turn 2: edits land.
    writeFileSync(fileA, 'a2\n', 'utf-8')
    expect(engine.snapshotBeforeEdit(fileA).ok).toBe(true)
    writeFileSync(fileB, 'b2\n', 'utf-8')
    expect(engine.snapshotBeforeEdit(fileB).ok).toBe(true)

    // Rewind to turn 1: both files restore to their turn-1 content.
    const rewind = service.rewindTo({ id: points[1]?.id })
    expect(rewind.ok).toBe(true)
    if (rewind.ok) {
      expect(rewind.files.every((f) => f.restored)).toBe(true)
      expect(rewind.files.some((f) => f.alreadyReverted)).toBe(false)
    }
    expect(readFileSync(fileA, 'utf-8')).toBe('a1\n')
    expect(readFileSync(fileB, 'utf-8')).toBe('b1\n')
  })

  it('rewind without an id targets the previous point (already-reverted no-op)', () => {
    const { dir, fileA } = makeWorkspace()
    const engine = new CheckpointEngine(dir)
    const service = new RewindService(engine)

    expect(engine.snapshotBeforeEdit(fileA).ok).toBe(true)
    writeFileSync(fileA, 'a2\n', 'utf-8')
    expect(engine.snapshotBeforeEdit(fileA).ok).toBe(true)

    // Default rewind = previous point => restores a1.
    const rewind = service.rewindTo({})
    expect(rewind.ok).toBe(true)
    if (rewind.ok) {
      expect(rewind.files.every((f) => f.restored && !f.alreadyReverted)).toBe(true)
      expect(rewind.point.id).toBe(service.listPoints()[0]?.id)
    }
    expect(readFileSync(fileA, 'utf-8')).toBe('a1\n')

    // Rewinding again resolves to the same previous point -> full no-op.
    const again = service.rewindTo({})
    expect(again.ok).toBe(true)
    if (again.ok) expect(again.files.every((f) => f.alreadyReverted)).toBe(true)
  })

  it('skips files with no checkpoint at or before the rewind point', () => {
    const { dir, fileA, fileB } = makeWorkspace()
    const engine = new CheckpointEngine(dir)
    const service = new RewindService(engine)

    // Only fileA gets checkpointed (turn 1).
    expect(engine.snapshotBeforeEdit(fileA).ok).toBe(true)
    const points = service.listPoints()

    // Later, fileB is created and checkpointed (after the rewind point).
    writeFileSync(fileB, 'b2\n', 'utf-8')
    expect(engine.snapshotBeforeEdit(fileB).ok).toBe(true)

    const rewind = service.rewindTo({ id: points[0]?.id })
    expect(rewind.ok).toBe(true)
    if (rewind.ok) {
      const restored = rewind.files.find((f) => f.file === fileA)
      const skipped = rewind.files.find((f) => f.file === fileB)
      expect(restored?.restored).toBe(true)
      expect(skipped?.restored).toBe(false)
      expect(skipped?.error).toContain('no checkpoint at or before')
    }
    expect(readFileSync(fileA, 'utf-8')).toBe('a1\n')
  })

  it('rejects unknown checkpoint ids', () => {
    const { dir } = makeWorkspace()
    const engine = new CheckpointEngine(dir)
    const service = new RewindService(engine)
    expect(service.listPoints()).toEqual([])
    const rewind = service.rewindTo({ id: 'nope' })
    expect(rewind.ok).toBe(false)
    if (!rewind.ok) expect(rewind.error).toContain("checkpoint 'nope' not found")
  })
})
