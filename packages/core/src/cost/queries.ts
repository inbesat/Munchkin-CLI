import type { Database } from 'bun:sqlite'
import type { CostSummary, DailyCostBreakdown, ModelCostBreakdown } from './schema'

export class CostQueries {
  private db: Database

  constructor(db: Database) {
    this.db = db
  }

  getTotalCost(): CostSummary {
    return this.db
      .prepare(
        `SELECT
           COALESCE(SUM(input_tokens), 0) as total_input_tokens,
           COALESCE(SUM(output_tokens), 0) as total_output_tokens,
           COALESCE(SUM(cache_read_tokens), 0) as total_cache_read_tokens,
           COALESCE(SUM(cache_write_tokens), 0) as total_cache_write_tokens,
           COALESCE(SUM(cost), 0) as total_cost,
           COUNT(*) as call_count
         FROM token_usage`,
      )
      .get() as CostSummary
  }

  getCostByModel(): ModelCostBreakdown[] {
    return this.db
      .prepare(
        `SELECT
           model,
           provider,
           SUM(input_tokens) as input_tokens,
           SUM(output_tokens) as output_tokens,
           SUM(cost) as cost,
           COUNT(*) as call_count
         FROM token_usage
         GROUP BY model, provider
         ORDER BY cost DESC`,
      )
      .all() as ModelCostBreakdown[]
  }

  getCostByDay(startDate?: string, endDate?: string): DailyCostBreakdown[] {
    let query = `
      SELECT
        date(timestamp / 1000, 'unixepoch', 'localtime') as date,
        SUM(cost) as cost,
        SUM(input_tokens) as input_tokens,
        SUM(output_tokens) as output_tokens,
        COUNT(*) as call_count
      FROM token_usage
    `
    const conditions: string[] = []
    const params: string[] = []

    if (startDate) {
      conditions.push("date(timestamp / 1000, 'unixepoch', 'localtime') >= ?")
      params.push(startDate)
    }
    if (endDate) {
      conditions.push("date(timestamp / 1000, 'unixepoch', 'localtime') <= ?")
      params.push(endDate)
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`
    }

    query += ' GROUP BY date ORDER BY date ASC'

    return this.db.prepare(query).all(...params) as DailyCostBreakdown[]
  }

  getCostByModelAndDay(model: string, startDate?: string, endDate?: string): DailyCostBreakdown[] {
    let query = `
      SELECT
        date(timestamp / 1000, 'unixepoch', 'localtime') as date,
        SUM(cost) as cost,
        SUM(input_tokens) as input_tokens,
        SUM(output_tokens) as output_tokens,
        COUNT(*) as call_count
      FROM token_usage
      WHERE model = ?
    `
    const params: string[] = [model]

    if (startDate) {
      query += " AND date(timestamp / 1000, 'unixepoch', 'localtime') >= ?"
      params.push(startDate)
    }
    if (endDate) {
      query += " AND date(timestamp / 1000, 'unixepoch', 'localtime') <= ?"
      params.push(endDate)
    }

    query += ' GROUP BY date ORDER BY date ASC'

    return this.db.prepare(query).all(...params) as DailyCostBreakdown[]
  }

  getMonthlyCost(year: number, month: number): CostSummary {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`
    const endMonth = month === 12 ? 1 : month + 1
    const endYear = month === 12 ? year + 1 : year
    const endDate = `${endYear}-${String(endMonth).padStart(2, '0')}-01`

    return this.db
      .prepare(
        `SELECT
           COALESCE(SUM(input_tokens), 0) as total_input_tokens,
           COALESCE(SUM(output_tokens), 0) as total_output_tokens,
           COALESCE(SUM(cache_read_tokens), 0) as total_cache_read_tokens,
           COALESCE(SUM(cache_write_tokens), 0) as total_cache_write_tokens,
           COALESCE(SUM(cost), 0) as total_cost,
           COUNT(*) as call_count
         FROM token_usage
         WHERE date(timestamp / 1000, 'unixepoch', 'localtime') >= ?
           AND date(timestamp / 1000, 'unixepoch', 'localtime') < ?`,
      )
      .get(startDate, endDate) as CostSummary
  }

  getTopExpensiveSessions(limit = 10): Array<{
    session_id: string
    total_cost: number
    call_count: number
    input_tokens: number
    output_tokens: number
  }> {
    return this.db
      .prepare(
        `SELECT
           session_id,
           SUM(cost) as total_cost,
           COUNT(*) as call_count,
           SUM(input_tokens) as input_tokens,
           SUM(output_tokens) as output_tokens
         FROM token_usage
         GROUP BY session_id
         ORDER BY total_cost DESC
         LIMIT ?`,
      )
      .all(limit) as Array<{
      session_id: string
      total_cost: number
      call_count: number
      input_tokens: number
      output_tokens: number
    }>
  }
}
