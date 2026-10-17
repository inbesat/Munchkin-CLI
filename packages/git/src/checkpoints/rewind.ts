/**
 * Rewind service (Phase 132): restores FILE state across the whole
 * workspace to a previous checkpoint moment. Given a checkpoint id from the
 * Phase-131 journal, every file that has checkpoints is rolled back to its
 * latest checkpoint at-or-before that moment - matching files with no
 * earlier state to their earliest recorded snapshot, and leaving files with
 * no checkpoints untouched.
 * No-throw: per-file failures are collected, never thrown.
 */

import type { CheckpointEngine, CheckpointEntry, RollbackResult } from './engine'

export interface RewindPoint {
  id: string
  savedAt: number
  lastFile: string
  /** Distinct files that had checkpoints at or before this point. */
  filesSoFar: number
}

export interface FileRewindResult {
  file: string
  restored: boolean
  alreadyReverted: boolean
  error?: string
}

export type RewindResult =
  | {
      ok: true
      point: RewindPoint
      files: FileRewindResult[]
    }
  | { ok: false; error: string }

export class RewindService {
  private readonly engine: CheckpointEngine

  constructor(engine: CheckpointEngine) {
    this.engine = engine
  }

  /** Collapse the journal into rewind points, oldest first. */
  listPoints(): RewindPoint[] {
    const journal = this.engine.listCheckpoints()
    const seenFiles = new Set<string>()
    const points: RewindPoint[] = []
    for (const entry of journal) {
      seenFiles.add(entry.file)
      points.push({
        id: entry.id,
        savedAt: entry.savedAt,
        lastFile: entry.file,
        filesSoFar: seenFiles.size,
      })
    }
    return points
  }

  /** Resolve a rewind point: by id, or - by default - the point before the latest (a useful rewind). */
  resolvePoint(id?: string): RewindPoint | undefined {
    const points = this.listPoints()
    if (id === undefined) {
      return points.length >= 2 ? points[points.length - 2] : points[0]
    }
    return points.find((point) => point.id === id)
  }

  /**
   * Restore every file to its state at-or-before `id`. Files whose last
   * checkpoint is newer than the target keep that newer restore point out
   * of scope - they are rolled back to their latest checkpoint at-or-before
   * the target; files with none are skipped.
   *
   * Selection uses journal POSITION, not timestamps: entries written within
   * the same millisecond (fast CI machines) would otherwise resolve
   * non-deterministically against `savedAt` comparisons.
   */
  rewindTo(request: { id?: string }): RewindResult {
    const journal = this.engine.listCheckpoints()
    const point = this.resolvePoint(request.id)
    if (point === undefined) {
      return { ok: false, error: `checkpoint '${request.id ?? 'latest'}' not found in the journal` }
    }
    const targetIndex = journal.findIndex((entry) => entry.id === point.id)
    if (targetIndex === -1) {
      return { ok: false, error: `checkpoint '${point.id}' not found in the journal` }
    }

    const byFile = new Map<string, CheckpointEntry | null>()
    for (let i = 0; i <= targetIndex; i += 1) {
      byFile.set(journal[i].file, journal[i])
    }
    for (let i = targetIndex + 1; i < journal.length; i += 1) {
      const file = journal[i].file
      if (!byFile.has(file)) byFile.set(file, null)
    }

    const files: FileRewindResult[] = []
    for (const [file, entry] of byFile) {
      if (entry === null) {
        files.push({
          file,
          restored: false,
          alreadyReverted: false,
          error: 'no checkpoint at or before the rewind point',
        })
        continue
      }
      const rollback: RollbackResult = this.engine.rollback(file, entry.id)
      files.push({
        file,
        restored: rollback.ok,
        alreadyReverted: rollback.ok && rollback.alreadyReverted,
        error: rollback.ok ? undefined : rollback.error,
      })
    }
    return { ok: true, point, files }
  }
}
