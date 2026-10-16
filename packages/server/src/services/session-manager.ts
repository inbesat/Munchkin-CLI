import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { type SessionStore, createEvent } from '@forge/core'
import { type Logger, getLogger } from '@forge/core'
import type { SessionMeta } from '@forge/core'
import { SessionLog } from '@forge/core'
import type { SessionEvent } from '@forge/core'

export interface SessionManagerOptions {
  store: SessionStore
  baseDir: string
  logger?: Logger
}

export class SessionManager {
  private store: SessionStore
  private baseDir: string
  private log: Logger

  constructor(options: SessionManagerOptions) {
    this.store = options.store
    this.baseDir = options.baseDir
    this.log = options.logger ?? getLogger()
  }

  async createSession(cwd: string, model: string, title?: string): Promise<SessionMeta> {
    const sessionId = randomUUID()

    const sessionDir = path.join(this.baseDir, 'sessions', sessionId)
    await fs.mkdir(sessionDir, { recursive: true })

    const log = new SessionLog(this.baseDir, sessionId)
    await log.append(
      createEvent('session.created', sessionId, {
        model,
        cwd,
        title,
      }),
    )

    const meta = await this.store.syncFromEvents(sessionId)
    if (!meta) {
      throw new Error('Failed to sync new session')
    }

    this.log.info('Session created', { sessionId, model, cwd })
    return meta
  }

  async getSession(id: string): Promise<SessionMeta | null> {
    return this.store.getSession(id)
  }

  async listSessions(limit = 50): Promise<SessionMeta[]> {
    return this.store.getRecentSessions(limit)
  }

  async searchSessions(query: string): Promise<SessionMeta[]> {
    return this.store.searchSessions(query)
  }

  async deleteSession(id: string): Promise<boolean> {
    const meta = this.store.getSession(id)
    if (!meta) return false

    const sessionDir = path.join(this.baseDir, 'sessions', id)
    try {
      await fs.rm(sessionDir, { recursive: true, force: true })
      await fs.rm(new SessionLog(this.baseDir, id).getFilePath(), { force: true })
      await this.store.deleteSession(id)
      this.log.info('Session deleted', { sessionId: id })
      return true
    } catch {
      return false
    }
  }

  async getEvents(sessionId: string, fromIndex?: number): Promise<SessionEvent[]> {
    const log = new SessionLog(this.baseDir, sessionId)
    if (!(await log.exists())) return []

    const events: SessionEvent[] = []
    let index = 0
    for await (const event of log.iterate()) {
      if (fromIndex !== undefined && index < fromIndex) {
        index++
        continue
      }
      events.push(event)
      index++
    }
    return events
  }

  async getEventCount(sessionId: string): Promise<number> {
    const log = new SessionLog(this.baseDir, sessionId)
    if (!(await log.exists())) return 0

    let count = 0
    for await (const _event of log.iterate()) {
      count++
    }
    return count
  }

  close(): void {
    this.store.close()
  }
}
