import type { Database } from 'bun:sqlite'
import { SessionLog } from '../events'
import type { SessionEvent } from '../events'
import { type SessionRow, openDatabase } from './schema'

export interface SessionMeta {
  id: string
  title?: string
  model: string
  cwd: string
  createdAt: number
  updatedAt: number
  endedAt?: number
  eventCount: number
  inputTokens: number
  outputTokens: number
  totalCost: number
}

const INSERT_OR_UPDATE = `
INSERT INTO sessions (id, title, model, cwd, created_at, updated_at, ended_at, event_count, input_tokens, output_tokens, total_cost)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(id) DO UPDATE SET
  title = excluded.title, model = excluded.model, cwd = excluded.cwd,
  created_at = excluded.created_at, updated_at = excluded.updated_at,
  ended_at = excluded.ended_at, event_count = excluded.event_count,
  input_tokens = excluded.input_tokens, output_tokens = excluded.output_tokens,
  total_cost = excluded.total_cost
`

export class SessionStore {
  private db: Database
  private baseDir: string

  constructor(dbPath: string, baseDir: string) {
    this.baseDir = baseDir
    this.db = openDatabase(dbPath)
  }

  async syncFromEvents(sessionId: string): Promise<SessionMeta | null> {
    const log = new SessionLog(this.baseDir, sessionId)
    if (!(await log.exists())) return null

    const meta: Partial<SessionMeta> = { id: sessionId }
    let eventCount = 0
    let inputTokens = 0
    let outputTokens = 0

    for await (const event of log.iterate()) {
      eventCount++
      this.applyEvent(meta, event)
      if (
        event.type === 'session.message' &&
        event.payload.role === 'assistant' &&
        event.payload.tokens
      ) {
        inputTokens += event.payload.tokens.input
        outputTokens += event.payload.tokens.output
      }
    }

    if (eventCount === 0) return null
    if (!meta.model || !meta.cwd || !meta.createdAt || !meta.updatedAt) return null

    const totalCost = meta.totalCost ?? 0
    const row: SessionMeta = {
      id: meta.id ?? sessionId,
      title: meta.title,
      model: meta.model,
      cwd: meta.cwd,
      createdAt: meta.createdAt,
      updatedAt: meta.updatedAt,
      endedAt: meta.endedAt,
      eventCount,
      inputTokens,
      outputTokens,
      totalCost,
    }

    this.db
      .prepare(INSERT_OR_UPDATE)
      .run(
        row.id,
        row.title ?? null,
        row.model,
        row.cwd,
        row.createdAt,
        row.updatedAt,
        row.endedAt ?? null,
        row.eventCount,
        row.inputTokens,
        row.outputTokens,
        row.totalCost,
      )

    return row
  }

  async syncAll(): Promise<SessionMeta[]> {
    const { readdirSync } = await import('node:fs')
    const { join } = await import('node:path')
    const sessionsDir = join(this.baseDir, 'sessions')

    try {
      const files = readdirSync(sessionsDir).filter((f) => f.endsWith('.jsonl'))
      const results: SessionMeta[] = []
      for (const file of files) {
        const sessionId = file.replace('.jsonl', '')
        const meta = await this.syncFromEvents(sessionId)
        if (meta) results.push(meta)
      }
      return results
    } catch {
      return []
    }
  }

  listSessions(): SessionMeta[] {
    const rows = this.db
      .prepare('SELECT * FROM sessions ORDER BY updated_at DESC')
      .all() as SessionRow[]
    return rows.map((r) => this.toMeta(r))
  }

  getSession(id: string): SessionMeta | null {
    const row = this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as
      | SessionRow
      | undefined
    return row ? this.toMeta(row) : null
  }

  searchSessions(query: string): SessionMeta[] {
    const rows = this.db
      .prepare('SELECT * FROM sessions WHERE title LIKE ? ORDER BY updated_at DESC')
      .all(`%${query}%`) as SessionRow[]
    return rows.map((r) => this.toMeta(r))
  }

  getRecentSessions(limit = 10): SessionMeta[] {
    const rows = this.db
      .prepare('SELECT * FROM sessions ORDER BY updated_at DESC LIMIT ?')
      .all(limit) as SessionRow[]
    return rows.map((r) => this.toMeta(r))
  }

  getTotalCost(): number {
    const row = this.db
      .prepare('SELECT COALESCE(SUM(total_cost), 0) as total FROM sessions')
      .get() as { total: number }
    return row.total
  }

  getCostByModel(): Record<string, number> {
    const rows = this.db
      .prepare('SELECT model, COALESCE(SUM(total_cost), 0) as cost FROM sessions GROUP BY model')
      .all() as Array<{ model: string; cost: number }>
    const result: Record<string, number> = {}
    for (const row of rows) {
      result[row.model] = row.cost
    }
    return result
  }

  async deleteSession(id: string): Promise<boolean> {
    const result = this.db.prepare('DELETE FROM sessions WHERE id = ?').run(id)
    return result.changes > 0
  }

  close(): void {
    this.db.close()
  }

  private applyEvent(meta: Partial<SessionMeta>, event: SessionEvent): void {
    meta.updatedAt = event.timestamp

    switch (event.type) {
      case 'session.created':
        meta.model = event.payload.model
        meta.cwd = event.payload.cwd
        meta.createdAt = event.timestamp
        if (event.payload.title) meta.title = event.payload.title
        break
      case 'session.ended':
        meta.endedAt = event.timestamp
        if (event.payload.totalCost) meta.totalCost = event.payload.totalCost
        if (event.payload.totalTokens) {
          meta.inputTokens = event.payload.totalTokens.input
          meta.outputTokens = event.payload.totalTokens.output
        }
        break
    }
  }

  private toMeta(row: SessionRow): SessionMeta {
    return {
      id: row.id,
      title: row.title ?? undefined,
      model: row.model,
      cwd: row.cwd,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      endedAt: row.ended_at ?? undefined,
      eventCount: row.event_count,
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
      totalCost: row.total_cost,
    }
  }
}
