import { appendFile, mkdir, readFile, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { SessionEvent } from './types'
import { SCHEMA_VERSION } from './types'

export class SessionLog {
  private filePath: string
  private sessionId: string

  constructor(baseDir: string, sessionId: string) {
    this.sessionId = sessionId
    this.filePath = join(baseDir, 'sessions', `${sessionId}.jsonl`)
  }

  async append(event: SessionEvent): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true })
    const line = `${JSON.stringify(event)}\n`
    await appendFile(this.filePath, line, 'utf-8')
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
