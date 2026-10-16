import { appendFile, mkdir, open, readFile, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { SessionEvent } from './types'
import { SCHEMA_VERSION } from './types'

export class SessionLog {
  private filePath: string
  private sessionId: string
  /** Set after this instance verified/repaired the file tail once. */
  private tailChecked = false

  constructor(baseDir: string, sessionId: string) {
    this.sessionId = sessionId
    this.filePath = join(baseDir, 'sessions', `${sessionId}.jsonl`)
  }

  async append(event: SessionEvent): Promise<void> {
    if (!this.tailChecked) {
      await mkdir(dirname(this.filePath), { recursive: true })
      // First append by this instance: repair a tail torn by a previous
      // process crash so appended events stay complete, replayable lines.
      // Our own appends always terminate with a newline, so subsequent
      // appends can take the fast appendFile path.
      const handle = await open(this.filePath, 'a+')
      try {
        const { size } = await handle.stat()
        if (size > 0) {
          const tail = Buffer.alloc(1)
          await handle.read(tail, 0, 1, size - 1)
          if (tail[0] !== 0x0a) await handle.write('\n')
        }
      } finally {
        await handle.close()
      }
      this.tailChecked = true
    }
    await appendFile(this.filePath, `${JSON.stringify(event)}\n`, 'utf-8')
  }

  async *iterate(): AsyncGenerator<SessionEvent> {
    let content: string
    try {
      content = await readFile(this.filePath, 'utf-8')
    } catch {
      return
    }

    const lines = content.split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        yield JSON.parse(trimmed) as SessionEvent
      } catch {}
    }
  }

  async count(): Promise<number> {
    let content: string
    try {
      content = await readFile(this.filePath, 'utf-8')
    } catch {
      return 0
    }

    const lines = content.split('\n').filter((l) => l.trim() !== '')
    return lines.length
  }

  async exists(): Promise<boolean> {
    try {
      await stat(this.filePath)
      return true
    } catch {
      return false
    }
  }

  getFilePath(): string {
    return this.filePath
  }

  getSessionId(): string {
    return this.sessionId
  }
}

export function createEvent<T extends SessionEvent['type']>(
  type: T,
  sessionId: string,
  payload: Extract<SessionEvent, { type: T }>['payload'],
  id?: string,
): Extract<SessionEvent, { type: T }> {
  return {
    id: id ?? crypto.randomUUID(),
    sessionId,
    timestamp: Date.now(),
    schemaVersion: SCHEMA_VERSION,
    type,
    payload,
  } as Extract<SessionEvent, { type: T }>
}
