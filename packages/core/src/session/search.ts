import type { Database } from 'bun:sqlite'
import { type SessionRow, openDatabase } from '../store/schema'
import type { SessionMeta } from '../store/session-store'

export interface SearchFilters {
  title?: string
  model?: string
  dateFrom?: number
  dateTo?: number
  costMin?: number
  costMax?: number
  limit?: number
  offset?: number
}

export interface SearchResult {
  sessions: SessionMeta[]
  total: number
}

export class SessionSearch {
  private db: Database

  constructor(dbPath: string) {
    this.db = openDatabase(dbPath)
  }

  search(filters: SearchFilters): SearchResult {
    const conditions: string[] = []
    const params: (string | number)[] = []

    if (filters.title) {
      conditions.push('title LIKE ?')
      params.push(`%${filters.title}%`)
    }

    if (filters.model) {
      conditions.push('model = ?')
      params.push(filters.model)
    }

    if (filters.dateFrom !== undefined) {
      conditions.push('created_at >= ?')
      params.push(filters.dateFrom)
    }

    if (filters.dateTo !== undefined) {
      conditions.push('created_at <= ?')
      params.push(filters.dateTo)
    }

    if (filters.costMin !== undefined) {
      conditions.push('total_cost >= ?')
      params.push(filters.costMin)
    }

    if (filters.costMax !== undefined) {
      conditions.push('total_cost <= ?')
      params.push(filters.costMax)
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    const countRow = (
      conditions.length > 0
        ? this.db.prepare(`SELECT COUNT(*) as count FROM sessions ${where}`).get(...params)
        : this.db.prepare('SELECT COUNT(*) as count FROM sessions').get()
    ) as { count: number }

    const limit = filters.limit ?? 50
    const offset = filters.offset ?? 0

    const rows = (
      conditions.length > 0
        ? this.db
            .prepare(`SELECT * FROM sessions ${where} ORDER BY updated_at DESC LIMIT ? OFFSET ?`)
            .all(...params, limit, offset)
        : this.db
            .prepare('SELECT * FROM sessions ORDER BY updated_at DESC LIMIT ? OFFSET ?')
            .all(limit, offset)
    ) as SessionRow[]

    return {
      sessions: rows.map((r) => this.toMeta(r)),
      total: countRow.count,
    }
  }

  searchTitleFuzzy(query: string): SessionMeta[] {
    const words = query.trim().split(/\s+/)
    const conditions = words.map(() => 'title LIKE ?')
    const params = words.map((w) => `%${w}%`)

    const rows = this.db
      .prepare(`SELECT * FROM sessions WHERE ${conditions.join(' AND ')} ORDER BY updated_at DESC`)
      .all(...params) as SessionRow[]

    return rows.map((r) => this.toMeta(r))
  }

  searchByModel(model: string): SessionMeta[] {
    const rows = this.db
      .prepare('SELECT * FROM sessions WHERE model = ? ORDER BY updated_at DESC')
      .all(model) as SessionRow[]
    return rows.map((r) => this.toMeta(r))
  }

  searchByDateRange(from: number, to: number): SessionMeta[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM sessions WHERE created_at >= ? AND created_at <= ? ORDER BY updated_at DESC',
      )
      .all(from, to) as SessionRow[]
    return rows.map((r) => this.toMeta(r))
  }

  searchByCostRange(min: number, max: number): SessionMeta[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM sessions WHERE total_cost >= ? AND total_cost <= ? ORDER BY updated_at DESC',
      )
      .all(min, max) as SessionRow[]
    return rows.map((r) => this.toMeta(r))
  }

  getModels(): string[] {
    const rows = this.db
      .prepare('SELECT DISTINCT model FROM sessions ORDER BY model')
      .all() as Array<{ model: string }>
    return rows.map((r) => r.model)
  }

  close(): void {
    this.db.close()
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
