import { Database } from 'bun:sqlite'
import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { calculateCost, getModelPricing } from './pricing'
import { CostQueries } from './queries'
import { ensureTokenUsageTable } from './schema'
import { CostTracker } from './tracker'

let db: Database
let tracker: CostTracker
let queries: CostQueries

beforeAll(() => {
  db = new Database(':memory:')
  db.exec('PRAGMA journal_mode = WAL')
  db.exec(`CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    title TEXT,
    model TEXT NOT NULL,
    cwd TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    ended_at INTEGER,
    event_count INTEGER NOT NULL DEFAULT 0,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    total_cost REAL NOT NULL DEFAULT 0
  )`)
  ensureTokenUsageTable(db)
  tracker = new CostTracker(db)
  queries = new CostQueries(db)
})

afterAll(() => {
  db.close()
})

describe('pricing', () => {
  it('returns known pricing for Claude models', () => {
    const pricing = getModelPricing('claude-sonnet-4-20250514')
    expect(pricing.inputPerToken).toBeCloseTo(3 / 1_000_000, 10)
    expect(pricing.outputPerToken).toBeCloseTo(15 / 1_000_000, 10)
  })

  it('returns fallback for unknown models', () => {
    const pricing = getModelPricing('unknown-model-xyz')
    expect(pricing.inputPerToken).toBeGreaterThan(0)
    expect(pricing.outputPerToken).toBeGreaterThan(0)
  })

  it('calculates cost correctly', () => {
    const cost = calculateCost('gpt-4o', 1000, 500)
    expect(cost).toBeCloseTo((2.5 / 1_000_000) * 1000 + (10 / 1_000_000) * 500, 10)
  })

  it('includes cache costs in calculation', () => {
    const cost = calculateCost('gpt-4o', 1000, 500, 200, 50)
    const expected =
      (2.5 / 1_000_000) * 1000 +
      (10 / 1_000_000) * 500 +
      (1.25 / 1_000_000) * 200 +
      (2.5 / 1_000_000) * 50
    expect(cost).toBeCloseTo(expected, 10)
  })

  it('has pricing for all configured models', () => {
    const models = [
      'claude-sonnet-4-20250514',
      'claude-opus-4-20250514',
      'claude-3-5-haiku-20241022',
      'gpt-4o',
      'gpt-4o-mini',
      'gemini-2.5-pro',
      'gemini-2.5-flash',
      'deepseek-chat',
      'deepseek-reasoner',
    ]
    for (const model of models) {
      const pricing = getModelPricing(model)
      expect(pricing.inputPerToken).toBeGreaterThan(0)
      expect(pricing.outputPerToken).toBeGreaterThan(0)
      expect(pricing.cacheReadPerToken).toBeGreaterThan(0)
      expect(pricing.cacheWritePerToken).toBeGreaterThan(0)
    }
  })
})

describe('CostTracker', () => {
  it('records a single LLM call', () => {
    const cost = tracker.recordLLMCall('s1', 0, 'gpt-4o', 'openai', {
      inputTokens: 1000,
      outputTokens: 500,
    })

    expect(cost).toBeGreaterThan(0)

    const usage = tracker.getSessionUsage('s1')
    expect(usage).toHaveLength(1)
    expect(usage[0].model).toBe('gpt-4o')
    expect(usage[0].input_tokens).toBe(1000)
    expect(usage[0].output_tokens).toBe(500)
  })

  it('records multiple calls with correct event indices', () => {
    tracker.recordLLMCall('s2', 0, 'gpt-4o', 'openai', { inputTokens: 100, outputTokens: 50 })
    tracker.recordLLMCall('s2', 1, 'gpt-4o', 'openai', { inputTokens: 200, outputTokens: 100 })
    tracker.recordLLMCall('s2', 2, 'gpt-4o', 'openai', { inputTokens: 300, outputTokens: 150 })

    const usage = tracker.getSessionUsage('s2')
    expect(usage).toHaveLength(3)
    expect(usage[0].event_index).toBe(0)
    expect(usage[1].event_index).toBe(1)
    expect(usage[2].event_index).toBe(2)
  })

  it('records cache tokens', () => {
    tracker.recordLLMCall('s3', 0, 'gpt-4o', 'openai', {
      inputTokens: 1000,
      outputTokens: 500,
      cacheReadTokens: 200,
      cacheWriteTokens: 50,
    })

    const usage = tracker.getSessionUsage('s3')
    expect(usage[0].cache_read_tokens).toBe(200)
    expect(usage[0].cache_write_tokens).toBe(50)
  })

  it('computes session total correctly', () => {
    tracker.recordLLMCall('s4', 0, 'gpt-4o', 'openai', { inputTokens: 1000, outputTokens: 500 })
    tracker.recordLLMCall('s4', 1, 'gpt-4o', 'openai', { inputTokens: 2000, outputTokens: 1000 })

    const total = tracker.getSessionTotal('s4')
    expect(total.input_tokens).toBe(3000)
    expect(total.output_tokens).toBe(1500)
    expect(total.call_count).toBe(2)
    expect(total.cost).toBeGreaterThan(0)
  })

  it('deletes session usage', () => {
    tracker.recordLLMCall('s5', 0, 'gpt-4o', 'openai', { inputTokens: 100, outputTokens: 50 })
    expect(tracker.getSessionUsage('s5')).toHaveLength(1)

    tracker.deleteSessionUsage('s5')
    expect(tracker.getSessionUsage('s5')).toHaveLength(0)
  })

  it('returns empty for nonexistent session', () => {
    expect(tracker.getSessionUsage('nonexistent')).toHaveLength(0)
  })

  it('records via raw insert', () => {
    tracker.record({
      session_id: 's6',
      event_index: 0,
      model: 'claude-sonnet-4-20250514',
      provider: 'anthropic',
      input_tokens: 5000,
      output_tokens: 2000,
      cache_read_tokens: 500,
      cache_write_tokens: 100,
      cost: 0.05,
      timestamp: Date.now(),
    })

    const usage = tracker.getSessionUsage('s6')
    expect(usage[0].model).toBe('claude-sonnet-4-20250514')
    expect(usage[0].cache_read_tokens).toBe(500)
  })
})

describe('CostQueries', () => {
  beforeAll(() => {
    const now = Date.now()
    const models = ['gpt-4o', 'gpt-4o-mini', 'claude-sonnet-4-20250514']
    const providers = ['openai', 'openai', 'anthropic']

    for (let i = 0; i < 50; i++) {
      const modelIdx = i % 3
      const _timestamp = now - (50 - i) * 3600_000
      tracker.recordLLMCall(`query-s${i}`, i, models[modelIdx], providers[modelIdx], {
        inputTokens: 1000 + i * 10,
        outputTokens: 500 + i * 5,
      })
    }
  })

  it('gets total cost across all sessions', () => {
    const total = queries.getTotalCost()
    expect(total.total_cost).toBeGreaterThan(0)
    expect(total.call_count).toBeGreaterThanOrEqual(50)
    expect(total.total_input_tokens).toBeGreaterThan(0)
    expect(total.total_output_tokens).toBeGreaterThan(0)
  })

  it('gets cost breakdown by model', () => {
    const breakdown = queries.getCostByModel()
    expect(breakdown.length).toBeGreaterThanOrEqual(2)

    const totalCost = breakdown.reduce((sum, b) => sum + b.cost, 0)
    expect(totalCost).toBeGreaterThan(0)

    for (const b of breakdown) {
      expect(b.model).toBeTruthy()
      expect(b.provider).toBeTruthy()
      expect(b.call_count).toBeGreaterThan(0)
    }
  })

  it('gets cost by day', () => {
    const daily = queries.getCostByDay()
    expect(daily.length).toBeGreaterThanOrEqual(1)

    for (const d of daily) {
      expect(d.date).toBeTruthy()
      expect(d.cost).toBeGreaterThan(0)
      expect(d.call_count).toBeGreaterThan(0)
    }
  })

  it('filters cost by date range', () => {
    const today = new Date().toISOString().split('T')[0]
    const daily = queries.getCostByDay(today, today)
    expect(daily.length).toBeGreaterThanOrEqual(0)
  })

  it('gets monthly cost', () => {
    const now = new Date()
    const monthly = queries.getMonthlyCost(now.getFullYear(), now.getMonth() + 1)
    expect(monthly.total_cost).toBeGreaterThan(0)
    expect(monthly.call_count).toBeGreaterThanOrEqual(50)
  })

  it('gets top expensive sessions', () => {
    const top = queries.getTopExpensiveSessions(5)
    expect(top.length).toBeLessThanOrEqual(5)
    expect(top.length).toBeGreaterThan(0)

    for (let i = 1; i < top.length; i++) {
      expect(top[i - 1].total_cost).toBeGreaterThanOrEqual(top[i].total_cost)
    }
  })

  it('gets cost by model and day', () => {
    const daily = queries.getCostByModelAndDay('gpt-4o')
    expect(daily.length).toBeGreaterThanOrEqual(1)
  })
})
