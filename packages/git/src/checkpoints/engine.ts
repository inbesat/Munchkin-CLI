/**
 * Checkpointing engine (Phase 131): before every file edit, snapshot the
 * file into `.forge/checkpoints/` with content-addressed dedup so repeated
 * edits of identical content never duplicate storage.
 *
 * Layout under the root directory:
 *   .forge/checkpoints/blobs/<sha256>   content-addressed snapshots
 *   .forge/checkpoints/journal.jsonl    append-only checkpoint journal
 *
 * No-throw convention: missing files, unreadable content, and IO failures
 * are result objects. Rollback restores file content exactly.
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

export interface CheckpointEntry {
  id: string
  /** Absolute path of the checkpointed file. */
  file: string
  /** sha256 of the snapshot content (blob key). */
  hash: string
  savedAt: number
  size: number
}

export type SnapshotResult =
  | {
      ok: true
      entry: CheckpointEntry
      blobWritten: boolean
      deduplicated: boolean
      emptyFile: boolean
    }
  | { ok: false; error: string }

export type RollbackResult =
  | { ok: true; entry: CheckpointEntry; alreadyReverted: boolean }
  | { ok: false; error: string }

export class CheckpointEngine {
  private readonly root: string
  private sequence = 0

  constructor(rootDir: string = process.cwd()) {
    this.root = resolve(rootDir)
  }

  private get dirPath(): string {
    return join(this.root, '.forge', 'checkpoints')
  }

  private get blobsPath(): string {
    return join(this.dirPath, 'blobs')
  }

  private get journalPath(): string {
    return join(this.dirPath, 'journal.jsonl')
  }

  /** Content hash (sha256 hex) of the given text. */
  static hashContent(content: string): string {
    return createHash('sha256').update(content, 'utf-8').digest('hex')
  }

  private ensureDirs(): void {
    mkdirSync(this.blobsPath, { recursive: true })
  }

  private readJournal(): CheckpointEntry[] {
    if (!existsSync(this.journalPath)) return []
    try {
      return readFileSync(this.journalPath, 'utf-8')
        .split('\n')
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line) as CheckpointEntry)
    } catch {
      return []
    }
  }

  private appendJournal(entry: CheckpointEntry): void {
    writeFileSync(this.journalPath, `${JSON.stringify(entry)}\n`, { flag: 'a', encoding: 'utf-8' })
  }

  /**
   * Snapshot `filePath` before an edit lands. Content-addressed: identical
   * content reuses the stored blob (deduplicated) while the journal still
   * records the checkpoint.
   */
  snapshotBeforeEdit(filePath: string): SnapshotResult {
    try {
      const absolute = resolve(filePath)
      const content = existsSync(absolute) ? readFileSync(absolute, 'utf-8') : ''
      const emptyFile = !existsSync(absolute)
      const hash = CheckpointEngine.hashContent(content)
      this.ensureDirs()
      const blob = join(this.blobsPath, hash)
      const blobWritten = !existsSync(blob)
      if (blobWritten) writeFileSync(blob, content, 'utf-8')

      this.sequence += 1
      const entry: CheckpointEntry = {
        id: `${Date.now().toString(36)}-${this.sequence.toString(36)}`,
        file: absolute,
        hash,
        savedAt: Date.now(),
        size: Buffer.byteLength(content, 'utf-8'),
      }
      this.appendJournal(entry)
      return { ok: true, entry, blobWritten, deduplicated: !blobWritten, emptyFile }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  /** Checkpoints for one file (or all), oldest first. */
  listCheckpoints(filePath?: string): CheckpointEntry[] {
    const all = this.readJournal()
    if (filePath === undefined) return all
    const target = resolve(filePath)
    return all.filter((entry) => entry.file === target)
  }

  /**
   * Restore `filePath` from a checkpoint (default: latest for that file).
   * `alreadyReverted` reports the no-op case (content hash matches).
   */
  rollback(filePath: string, checkpointId?: string): RollbackResult {
    try {
      const absolute = resolve(filePath)
      const history = this.listCheckpoints(absolute)
      if (history.length === 0) {
        return { ok: false, error: `no checkpoints recorded for '${filePath}'` }
      }
      const entry =
        checkpointId === undefined
          ? history[history.length - 1]
          : history.find((candidate) => candidate.id === checkpointId)
      if (entry === undefined) {
        return {
          ok: false,
          error: `checkpoint '${checkpointId ?? 'latest'}' not found for '${filePath}'`,
        }
      }
      if (
        existsSync(absolute) &&
        CheckpointEngine.hashContent(readFileSync(absolute, 'utf-8')) === entry.hash
      ) {
        return { ok: true, entry, alreadyReverted: true }
      }
      const blob = join(this.blobsPath, entry.hash)
      if (!existsSync(blob)) {
        return { ok: false, error: `snapshot blob '${entry.hash}' is missing from storage` }
      }
      writeFileSync(absolute, readFileSync(blob, 'utf-8'), 'utf-8')
      return { ok: true, entry, alreadyReverted: false }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  /** Storage stats for the dedup contract: journal entries vs stored blobs. */
  stats(): { entries: number; blobs: number } {
    const blobDir = this.blobsPath
    const blobs = existsSync(blobDir)
      ? Array.from(new Set(this.readJournal().map((entry) => entry.hash))).filter((hash) =>
          existsSync(join(blobDir, hash)),
        ).length
      : 0
    return { entries: this.readJournal().length, blobs }
  }

  /** Remove every snapshot (blob store + journal). Used by full resets. */
  clear(): void {
    if (existsSync(this.dirPath)) {
      rmSync(this.dirPath, { recursive: true, force: true })
    }
  }
}
