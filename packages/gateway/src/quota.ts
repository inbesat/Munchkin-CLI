import { Database } from 'bun:sqlite'
import type { KillSwitch, KillSwitchAdmin } from './killswitch'

export interface QuotaConfig {
  /** SQLite path; defaults to `:memory:` (use a file path in production) */
  dbPath?: string
  /** Daily hard cap on total tokens per quota key */
  dailyTokenCap?: number
  /** Optional daily cost cap in USD, estimated from battery token usage */
  dailyCostCapUsd?: number
}

export interface UsageAdd {
  tokens: number
  costUsd?: number
}

export function todayKey(now = new Date()): string {
  return now.toISOString().slice(0, 10)
}

export interface QuotaState {
  tokens: number
  costUsd: number
}

/**
 * SQLite-backed usage quota. Counters persist across gateway restarts so a
 * reboot can't silently reset the daily budget. Also owns the persistent kill
 * switch table — one file, one handle.
 */
export class SqliteQuotaEngine implements KillSwitch, KillSwitchAdmin {
  #db: Database
  readonly dailyTokenCap: number | undefined
  readonly dailyCostCapUsd: number | undefined

  constructor(config: QuotaConfig = {}) {
    this.dailyTokenCap = config.dailyTokenCap
    this.dailyCostCapUsd = config.dailyCostCapUsd
    this.#db = new Database(config.dbPath ?? ':memory:', { create: true })
    this.#db.run(
      'CREATE TABLE IF NOT EXISTS usage (date TEXT NOT NULL, key TEXT NOT NULL, tokens INTEGER NOT NULL DEFAULT 0, cost REAL NOT NULL DEFAULT 0, PRIMARY KEY (date, key))',
    )
    this.#db.run(
      'CREATE TABLE IF NOT EXISTS killswitches (upstream TEXT PRIMARY KEY, disabled INTEGER NOT NULL DEFAULT 0)',
    )
  }

  getUsage(key: string, date = todayKey()): QuotaState {
    const row = this.#db
      .query('SELECT tokens, cost FROM usage WHERE date = ? AND key = ?')
      .get(date, key) as { tokens: number; cost: number } | undefined
    if (!row) return { tokens: 0, costUsd: 0 }
    return { tokens: Number(row.tokens), costUsd: Number(row.cost) }
  }

  addUsage(key: string, add: UsageAdd, date = todayKey()): QuotaState {
    if (!Number.isSafeInteger(add.tokens) || add.tokens < 0) {
      throw new Error('tokens must be a nonnegative safe integer')
    }
    if (
      add.costUsd !== undefined &&
      (typeof add.costUsd !== 'number' || !Number.isFinite(add.costUsd) || add.costUsd < 0)
    ) {
      throw new Error('costUsd must be finite and nonnegative')
    }
    this.#db
      .query(
        'INSERT INTO usage (date, key, tokens, cost) VALUES (?, ?, ?, ?) ON CONFLICT(date, key) DO UPDATE SET tokens = tokens + excluded.tokens, cost = cost + excluded.cost',
      )
      .run(date, key, add.tokens, add.costUsd ?? 0)
    return this.getUsage(key, date)
  }

  isOverQuota(key: string, date = todayKey()): boolean {
    const usage = this.getUsage(key, date)
    if (this.dailyTokenCap !== undefined && usage.tokens >= this.dailyTokenCap) return true
    if (this.dailyCostCapUsd !== undefined && usage.costUsd >= this.dailyCostCapUsd) return true
    return false
  }

  isDisabled(upstreamKey: string): boolean {
    const row = this.#db
      .query('SELECT disabled FROM killswitches WHERE upstream = ?')
      .get(upstreamKey) as { disabled: number } | null | undefined
    if (!row) return false
    return Number(row.disabled) === 1
  }

  disable(upstreamKey: string): void {
    this.#db
      .query(
        'INSERT INTO killswitches (upstream, disabled) VALUES (?, 1) ON CONFLICT(upstream) DO UPDATE SET disabled = 1',
      )
      .run(upstreamKey)
  }

  enable(upstreamKey: string): void {
    this.#db
      .query(
        'INSERT INTO killswitches (upstream, disabled) VALUES (?, 0) ON CONFLICT(upstream) DO UPDATE SET disabled = 0',
      )
      .run(upstreamKey)
  }

  list(): readonly string[] {
    const rows = this.#db
      .query('SELECT upstream FROM killswitches WHERE disabled = 1')
      .all() as unknown as Array<{ upstream: string }>
    return rows.map((r) => r.upstream).sort()
  }

  close(): void {
    this.#db.close()
  }
}
