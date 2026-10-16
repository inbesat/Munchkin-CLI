import type { Database } from 'bun:sqlite'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { CostQueries } from '../cost/queries'
import type { CostSummary, DailyCostBreakdown, ModelCostBreakdown } from '../cost/schema'
import { SessionLog } from '../events/log'

export interface SessionStats {
  total: number
  /** Sessions without an `ended_at` timestamp. */
  active: number
  /** Average wall-clock duration of ended sessions (ms); null when none ended. */
  avgDurationMs: number | null
  /** Average event count per session; null when there are no sessions. */
  avgEvents: number | null
}

export interface ToolUsageEntry {
  tool: string
  calls: number
}

export interface ForgeStats {
  sessions: SessionStats
  cost: CostSummary
  costByModel: ModelCostBreakdown[]
  costByDay: DailyCostBreakdown[]
  toolUsage: ToolUsageEntry[]
}

export function gatherSessionStats(db: Database): SessionStats {
  const row = db
    .prepare(
      `SELECT
         COUNT(*) as total,
         COALESCE(SUM(CASE WHEN ended_at IS NULL THEN 1 ELSE 0 END), 0) as active,
         AVG(CASE WHEN ended_at IS NOT NULL THEN ended_at - created_at END) as avg_duration_ms,
         AVG(event_count) as avg_events
       FROM sessions`,
    )
    .get() as {
    total: number
    active: number
    avg_duration_ms: number | null
    avg_events: number | null
  }
  return {
    total: row.total,
    active: row.active,
    avgDurationMs: row.avg_duration_ms,
    avgEvents: row.avg_events,
  }
}

/** Counts `session.tool_call` events across every `<baseDir>/sessions/*.jsonl` log. */
export async function gatherToolUsage(baseDir: string): Promise<ToolUsageEntry[]> {
  let files: string[]
  try {
    files = await readdir(join(baseDir, 'sessions'))
  } catch {
    return []
  }
  const counts = new Map<string, number>()
  for (const file of files) {
    if (!file.endsWith('.jsonl')) continue
    const log = new SessionLog(baseDir, file.slice(0, -'.jsonl'.length))
    for await (const event of log.iterate()) {
      if (event.type !== 'session.tool_call') continue
      const name = event.payload.toolName
      counts.set(name, (counts.get(name) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .map(([tool, calls]) => ({ tool, calls }))
    .sort((a, b) => b.calls - a.calls || a.tool.localeCompare(b.tool))
}

export async function gatherStats(options: { db: Database; baseDir: string }): Promise<ForgeStats> {
  const queries = new CostQueries(options.db)
  return {
    sessions: gatherSessionStats(options.db),
    cost: queries.getTotalCost(),
    costByModel: queries.getCostByModel(),
    costByDay: queries.getCostByDay(),
    toolUsage: await gatherToolUsage(options.baseDir),
  }
}
