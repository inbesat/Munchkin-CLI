import type { Database } from 'bun:sqlite'
import { calculateCost } from './pricing'
import { type TokenUsageInsert, type TokenUsageRow, ensureTokenUsageTable } from './schema'

export interface LLMUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
}

export class CostTracker {
  private db: Database
  private insertStmt: ReturnType<Database['prepare']>

  constructor(db: Database) {
    this.db = db
    ensureTokenUsageTable(db)

    this.insertStmt = db.prepare(`
      INSERT INTO token_usage (session_id, event_index, model, provider, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
  }

  record(usage: TokenUsageInsert): void {
    this.insertStmt.run(
      usage.session_id,
      usage.event_index,
      usage.model,
      usage.provider,
      usage.input_tokens,
      usage.output_tokens,
      usage.cache_read_tokens ?? 0,
      usage.cache_write_tokens ?? 0,
      usage.cost,
      usage.timestamp,
    )
  }

  recordLLMCall(
    sessionId: string,
    eventIndex: number,
    model: string,
    provider: string,
    usage: LLMUsage,
    timestamp: number = Date.now(),
  ): number {
    const cost = calculateCost(
      model,
      usage.inputTokens,
      usage.outputTokens,
      usage.cacheReadTokens ?? 0,
      usage.cacheWriteTokens ?? 0,
    )

    this.record({
      session_id: sessionId,
      event_index: eventIndex,
      model,
      provider,
      input_tokens: usage.inputTokens,
      output_tokens: usage.outputTokens,
      cache_read_tokens: usage.cacheReadTokens ?? 0,
      cache_write_tokens: usage.cacheWriteTokens ?? 0,
      cost,
      timestamp,
    })

    return cost
  }

  getSessionUsage(sessionId: string): TokenUsageRow[] {
    return this.db
      .prepare('SELECT * FROM token_usage WHERE session_id = ? ORDER BY event_index')
      .all(sessionId) as TokenUsageRow[]
  }

  getSessionTotal(sessionId: string): {
    input_tokens: number
    output_tokens: number
    cost: number
    call_count: number
  } {
    return this.db
      .prepare(
        `SELECT
           COALESCE(SUM(input_tokens), 0) as input_tokens,
           COALESCE(SUM(output_tokens), 0) as output_tokens,
           COALESCE(SUM(cost), 0) as cost,
           COUNT(*) as call_count
         FROM token_usage WHERE session_id = ?`,
      )
      .get(sessionId) as {
      input_tokens: number
      output_tokens: number
      cost: number
      call_count: number
    }
  }

  deleteSessionUsage(sessionId: string): void {
    this.db.prepare('DELETE FROM token_usage WHERE session_id = ?').run(sessionId)
  }
}
