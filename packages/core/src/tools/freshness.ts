import { createHash } from 'node:crypto'
import { ErrorCode, ToolError } from '../errors'
import { fileExists } from './file-utils'

/** Stored freshness record for a file. */
export interface FreshnessRecord {
  /** File path (absolute, normalized). */
  path: string
  /** SHA-256 hash of file content at time of read. */
  hash: string
  /** File size in bytes at time of read. */
  size: number
  /** Timestamp when the hash was recorded (ms since epoch). */
  timestamp: number
  /** Session ID this record belongs to. */
  sessionId: string
}

/** Result of a freshness check. */
export interface FreshnessCheckResult {
  /** Whether the file is fresh (unchanged since read). */
  fresh: boolean
  /** Current hash of the file. */
  currentHash: string
  /** Recorded hash from when the file was read. */
  recordedHash: string
  /** Warning message if not fresh. */
  warning?: string
}

/** In-memory freshness tracker. Session-scoped. */
export class FreshnessTracker {
  private records = new Map<string, Map<string, FreshnessRecord>>()

  /** Record a file as read, computing and storing its hash. */
  async recordRead(path: string, sessionId: string): Promise<FreshnessRecord> {
    const normalized = path
    if (!(await fileExists(normalized))) {
      throw new ToolError(ErrorCode.TOOL_INVALID_INPUT, `File not found: ${path}`, 'freshness')
    }

    const content = await Bun.file(normalized).bytes()
    const hash = this.computeHash(content)
    const size = content.length

    const record: FreshnessRecord = {
      path: normalized,
      hash,
      size,
      timestamp: Date.now(),
      sessionId,
    }

    const sessionRecords = this.records.get(sessionId) ?? new Map()
    sessionRecords.set(normalized, record)
    this.records.set(sessionId, sessionRecords)

    return record
  }

  /** Check if a file is still fresh (unchanged since last read). */
  async checkFreshness(path: string, sessionId: string): Promise<FreshnessCheckResult> {
    const normalized = path
    const sessionRecords = this.records.get(sessionId)

    if (!sessionRecords) {
      return {
        fresh: true,
        currentHash: '',
        recordedHash: '',
        warning: 'No freshness record for this session',
      }
    }

    const record = sessionRecords.get(normalized)
    if (!record) {
      return {
        fresh: true,
        currentHash: '',
        recordedHash: '',
        warning: 'File was not read in this session',
      }
    }

    if (!(await fileExists(normalized))) {
      return {
        fresh: false,
        currentHash: '',
        recordedHash: record.hash,
        warning: `File has been deleted since it was read: ${path}`,
      }
    }

    const content = await Bun.file(normalized).bytes()
    const currentHash = this.computeHash(content)

    if (currentHash === record.hash) {
      return { fresh: true, currentHash, recordedHash: record.hash }
    }

    return {
      fresh: false,
      currentHash,
      recordedHash: record.hash,
      warning:
        `File has been modified externally since it was read: ${path}\n` +
        `  Recorded hash: ${record.hash.slice(0, 16)}...\n` +
        `  Current hash:  ${currentHash.slice(0, 16)}...`,
    }
  }

  /** Get the recorded hash for a file in a session. */
  getRecordedHash(path: string, sessionId: string): string | undefined {
    return this.records.get(sessionId)?.get(path)?.hash
  }

  /** Clear all records for a session. */
  clearSession(sessionId: string): void {
    this.records.delete(sessionId)
  }

  /** Clear all records for all sessions. */
  clearAll(): void {
    this.records.clear()
  }

  /** Get all records for a session. */
  getSessionRecords(sessionId: string): FreshnessRecord[] {
    return [...(this.records.get(sessionId)?.values() ?? [])]
  }

  /** Compute SHA-256 hash of content. */
  private computeHash(content: Uint8Array): string {
    return createHash('sha256').update(content).digest('hex')
  }
}

/** Default freshness tracker instance. */
export const defaultFreshnessTracker = new FreshnessTracker()

/** Check freshness before an edit operation. Returns warning if stale, throws if configured to block. */
export async function checkFreshnessBeforeEdit(
  path: string,
  sessionId: string,
  options: { blockOnStale?: boolean; tracker?: FreshnessTracker } = {},
): Promise<string | undefined> {
  const tracker = options.tracker ?? defaultFreshnessTracker
  const result = await tracker.checkFreshness(path, sessionId)

  if (!result.fresh && result.warning) {
    if (options.blockOnStale) {
      throw new ToolError(
        ErrorCode.TOOL_EXECUTION_FAILED,
        `Stale file edit blocked: ${result.warning}`,
        'freshness',
      )
    }
    return result.warning
  }
  return undefined
}

/** Record a file read for freshness tracking. */
export async function recordFileRead(
  path: string,
  sessionId: string,
  tracker: FreshnessTracker = defaultFreshnessTracker,
): Promise<FreshnessRecord> {
  return tracker.recordRead(path, sessionId)
}
