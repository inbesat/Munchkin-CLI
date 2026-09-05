import { computeCacheCost } from '../cache/cost'
import type { ModelCostConfig, TokenUsage } from '../model/types'

/**
 * Cost tracking engine. Ingests per-call cost events (session, model,
 * provider, optional custom tag, timestamp, token usage + pricing) and keeps
 * precomputed aggregates so every breakdown query is a fast keyed lookup —
 * well under the 50ms budget even with thousands of recorded events.
 *
 * The `/cost` CLI command and the API endpoint (later phases) read from here.
 */

export interface CostEventInput {
  sessionId?: string
  model: string
  provider: string
  /** Free-form tag (owner, feature, env...). Defaults to `'untagged'`. */
  tag?: string
  timestamp?: string | number | Date
  usage: TokenUsage
  cost: ModelCostConfig
}

export interface CostRecord {
  sessionId: string
  model: string
  provider: string
  tag: string
  timestamp: number
  usage: TokenUsage
  cost: number
  baselineCost: number
  savings: number
  writeSurcharge: number
  hitRate: number
}

export interface CostTotal {
  calls: number
  cost: number
  baselineCost: number
  savings: number
  writeSurcharge: number
  input: number
  cacheRead: number
  cacheWrite: number
  output: number
}

export interface CostEngine {
  add(event: CostEventInput): void
  addMany(events: readonly CostEventInput[]): void
  /** Raw recorded events (sorted by timestamp ascending). */
  snapshot(): readonly CostRecord[]
  totals(): CostTotal
  bySession(): Record<string, CostTotal>
  bySessionId(sessionId: string): CostTotal
  byModel(): Record<string, CostTotal>
  byProvider(): Record<string, CostTotal>
  byDay(): Record<string, CostTotal>
  byMonth(): Record<string, CostTotal>
  byTag(): Record<string, CostTotal>
  costForRange(from: Date, to: Date): CostTotal
  reset(): void
}

export type CostDimension = 'sessionId' | 'model' | 'provider' | 'tag' | 'day' | 'month'

export const emptyTotal = (): CostTotal => ({
  calls: 0,
  cost: 0,
  baselineCost: 0,
  savings: 0,
  writeSurcharge: 0,
  input: 0,
  cacheRead: 0,
  cacheWrite: 0,
  output: 0,
})

export function mergeTotal(target: CostTotal, event: CostRecord): CostTotal {
  target.calls += 1
  target.cost += event.cost
  target.baselineCost += event.baselineCost
  target.savings += event.savings
  target.writeSurcharge += event.writeSurcharge
  target.input += event.usage.input
  target.cacheRead += event.usage.cacheRead ?? 0
  target.cacheWrite += event.usage.cacheWrite ?? 0
  target.output += event.usage.output
  return target
}

export function toTimestamp(value: string | number | Date): number {
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'number') return value
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? Date.now() : parsed
}

export function dayKey(ts: number): string {
  const d = new Date(ts)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

export function monthKey(ts: number): string {
  const d = new Date(ts)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${d.getFullYear()}-${mm}`
}

export function dimensionKey(dim: CostDimension, record: CostRecord): string {
  switch (dim) {
    case 'sessionId':
      return record.sessionId
    case 'model':
      return record.model
    case 'provider':
      return record.provider
    case 'tag':
      return record.tag
    case 'day':
      return dayKey(record.timestamp)
    case 'month':
      return monthKey(record.timestamp)
  }
}

function toRecordObject(map: Map<string, CostTotal>): Record<string, CostTotal> {
  const out: Record<string, CostTotal> = {}
  for (const [key, total] of map) out[key] = { ...total }
  return out
}

export function createCostEngine(): CostEngine {
  const records: CostRecord[] = []
  const totals = emptyTotal()
  const bySession = new Map<string, CostTotal>()
  const byModel = new Map<string, CostTotal>()
  const byProvider = new Map<string, CostTotal>()
  const byTag = new Map<string, CostTotal>()
  const byDay = new Map<string, CostTotal>()
  const byMonth = new Map<string, CostTotal>()
  const maps: ReadonlyArray<readonly [CostDimension, Map<string, CostTotal>]> = [
    ['sessionId', bySession],
    ['model', byModel],
    ['provider', byProvider],
    ['tag', byTag],
    ['day', byDay],
    ['month', byMonth],
  ]

  function append(event: CostEventInput): void {
    const timestamp = toTimestamp(event.timestamp ?? Date.now())
    const usage = { ...event.usage }
    const c = computeCacheCost(usage, event.cost)

    const record: CostRecord = {
      sessionId: event.sessionId ?? 'untracked',
      model: event.model,
      provider: event.provider,
      tag: event.tag ?? 'untagged',
      timestamp,
      usage,
      cost: c.totalCost,
      baselineCost: c.baselineCost,
      savings: c.savings,
      writeSurcharge: c.writeSurcharge,
      hitRate: c.hitRate,
    }

    records.push(record)
    mergeTotal(totals, record)
    for (const [dim, map] of maps) {
      let bucket = map.get(dimensionKey(dim, record))
      if (!bucket) {
        bucket = emptyTotal()
        map.set(dimensionKey(dim, record), bucket)
      }
      mergeTotal(bucket, record)
    }
  }

  return {
    add: append,
    addMany(events) {
      for (const event of events) append(event)
    },
    snapshot() {
      return [...records].sort((a, b) => a.timestamp - b.timestamp)
    },
    totals() {
      return { ...totals }
    },
    bySession: () => toRecordObject(bySession),
    bySessionId(sessionId) {
      return { ...(bySession.get(sessionId) ?? emptyTotal()) }
    },
    byModel: () => toRecordObject(byModel),
    byProvider: () => toRecordObject(byProvider),
    byDay: () => toRecordObject(byDay),
    byMonth: () => toRecordObject(byMonth),
    byTag: () => toRecordObject(byTag),
    costForRange(from, to) {
      const out = emptyTotal()
      for (const record of records) {
        if (record.timestamp >= from.getTime() && record.timestamp <= to.getTime()) {
          mergeTotal(out, record)
        }
      }
      return out
    },
    reset() {
      records.length = 0
      Object.assign(totals, emptyTotal())
      for (const [, map] of maps) map.clear()
    },
  }
}
