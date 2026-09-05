import { describe, expect, it } from 'bun:test'
import type { ModelCostConfig, TokenUsage } from '../model/types'
import { createCostEngine, dayKey, monthKey } from './engine'
import type { CostEventInput } from './engine'

const ANTHROPIC_PRICING: ModelCostConfig = {
  inputPerToken: 3e-6,
  outputPerToken: 1.5e-5,
  cacheReadPerToken: 3e-7,
  cacheWritePerToken: 3.75e-6,
}
const OPENAI_PRICING: ModelCostConfig = { inputPerToken: 2.5e-6, outputPerToken: 1e-5 }
const OLLAMA_PRICING: ModelCostConfig = { inputPerToken: 0, outputPerToken: 0 }

const PROVIDERS = ['anthropic', 'openai', 'ollama'] as const
const MODELS = [
  'claude-sonnet-4-6',
  'gpt-4o',
  'qwen2.5-coder',
  'llama-3.1-8b',
  'claude-haiku-4-5',
] as const
const SESSIONS = ['s-001', 's-002', 's-003'] as const
const TAGS = ['dev', 'ci', 'review'] as const

function usage(input: number, cacheRead = 0, cacheWrite = 0): TokenUsage {
  return { input, output: 50, total: input + 50, cacheRead, cacheWrite }
}

function pricingFor(provider: string): ModelCostConfig {
  if (provider === 'anthropic') return ANTHROPIC_PRICING
  if (provider === 'openai') return OPENAI_PRICING
  return OLLAMA_PRICING
}

function buildEvents(count: number): CostEventInput[] {
  const events: CostEventInput[] = []
  for (let i = 0; i < count; i++) {
    const provider = PROVIDERS[i % PROVIDERS.length]
    const model = MODELS[i % MODELS.length]
    const isAnthropic = provider === 'anthropic'
    const cacheRead = isAnthropic && i % 3 !== 1 ? 200 : 0
    const cacheWrite = isAnthropic && i % 2 === 0 ? 100 : 0
    events.push({
      sessionId: SESSIONS[i % SESSIONS.length],
      model,
      provider,
      tag: TAGS[i % TAGS.length],
      timestamp: new Date(2026, 6, (i % 28) + 1, 9, 0, 0),
      usage: usage(500, cacheRead, cacheWrite),
      cost: pricingFor(provider),
    })
  }
  return events
}

function sumKeyed(map: Record<string, { cost: number }>): number {
  return Object.values(map).reduce((acc, total) => acc + total.cost, 0)
}

describe('createCostEngine', () => {
  it('aggregates 1000 events accurately across every dimension', () => {
    const engine = createCostEngine()
    const events = buildEvents(1000)
    engine.addMany(events)

    const totals = engine.totals()
    const snapshot = engine.snapshot()
    expect(snapshot).toHaveLength(1000)
    expect(totals.calls).toBe(1000)
    expect(totals.cost).toBeCloseTo(sumKeyed(engine.byProvider(), 'x'), 10)
    expect(totals.cost).toBeCloseTo(sumKeyed(engine.byModel(), 'x'), 10)
    expect(totals.cost).toBeCloseTo(sumKeyed(engine.byDay(), 'x'), 10)
    expect(totals.cost).toBeCloseTo(sumKeyed(engine.byMonth(), 'x'), 10)
    expect(totals.cost).toBeCloseTo(sumKeyed(engine.byTag(), 'x'), 10)
    expect(totals.cost).toBeCloseTo(sumKeyed(engine.bySession(), 'x'), 10)

    expect(totals.input).toBe(500_000)
    expect(totals.output).toBe(50_000)
    expect(totals.cacheRead).toBe(66_800)
    expect(totals.cacheWrite).toBe(16_700)
  })

  it('breaks down by provider, model, session, tag', () => {
    const engine = createCostEngine()
    engine.addMany(buildEvents(30))

    const byProvider = engine.byProvider()
    expect(Object.keys(byProvider).sort()).toEqual(['anthropic', 'ollama', 'openai'])

    const byModel = engine.byModel()
    expect(byModel['gpt-4o']).toBeDefined()

    const bySession = engine.bySession()
    expect(Object.keys(bySession).sort()).toEqual(['s-001', 's-002', 's-003'])
    expect(engine.bySessionId('s-001')).toEqual(bySession['s-001'])

    const byTag = engine.byTag()
    expect(Object.keys(byTag).sort()).toEqual(['ci', 'dev', 'review'])
  })

  it('groups events by calendar day and month', () => {
    const engine = createCostEngine()
    engine.addMany(buildEvents(56))

    const byDay = engine.byDay()
    expect(byDay['2026-07-01']).toBeDefined()
    expect(byDay['2026-07-28']).toBeDefined()
    expect(Object.values(byDay).reduce((a, t) => a + t.calls, 0)).toBe(56)

    const byMonth = engine.byMonth()
    expect(byMonth['2026-07']).toBeDefined()
    expect(Object.values(byMonth).reduce((a, t) => a + t.calls, 0)).toBe(56)
    expect(dayKey(new Date(2026, 6, 15).getTime())).toBe('2026-07-15')
    expect(monthKey(new Date(2026, 6, 15).getTime())).toBe('2026-07')
  })

  it('computeCacheCost math is applied per event', () => {
    const engine = createCostEngine()
    engine.add({
      sessionId: 's-1',
      model: 'claude-sonnet-4-6',
      provider: 'anthropic',
      tag: 'dev',
      timestamp: new Date(2026, 6, 1),
      usage: usage(1000, 900, 80),
      cost: ANTHROPIC_PRICING,
    })

    const total = engine.totals()
    expect(total.calls).toBe(1)
    expect(total.cost).toBeCloseTo(1.38e-3, 12)
    expect(total.baselineCost).toBeCloseTo(3.75e-3, 12)
    expect(total.savings).toBeCloseTo(2.43e-3, 12)
    expect(total.cacheRead).toBe(900)
  })

  it('falls back to overrides and defaults for missing fields', () => {
    const engine = createCostEngine()
    const now = Date.now()
    engine.add({
      model: 'qwen2.5-coder',
      provider: 'ollama',
      timestamp: now,
      usage: usage(10),
      cost: OLLAMA_PRICING,
    })
    const record = engine.snapshot()[0]
    expect(record.sessionId).toBe('untracked')
    expect(record.tag).toBe('untagged')
    const today = dayKey(now)
    const month = monthKey(now)
    expect(engine.bySession().untracked.calls).toBe(1)
    expect(engine.byTag().untagged.calls).toBe(1)
    expect(engine.byDay()[today].calls).toBe(1)
    expect(engine.byMonth()[month].calls).toBe(1)
  })

  it('supports date-range queries', () => {
    const engine = createCostEngine()
    engine.addMany(buildEvents(56))
    const half = engine.costForRange(new Date(2026, 6, 1), new Date(2026, 6, 14, 23, 59, 59))
    expect(half.calls).toBe(28)
    expect(half.cost).toBeCloseTo(
      Object.entries(engine.byDay())
        .filter(([day]) => day <= '2026-07-14')
        .reduce((a, [, t]) => a + t.cost, 0),
      10,
    )
    const all = engine.costForRange(new Date(2026, 6, 1), new Date(2026, 6, 28, 23, 59, 59))
    expect(all.calls).toBe(56)
  })

  it('reset clears all aggregates', () => {
    const engine = createCostEngine()
    engine.addMany(buildEvents(100))
    engine.reset()
    expect(engine.totals().calls).toBe(0)
    expect(engine.snapshot()).toHaveLength(0)
    expect(Object.keys(engine.byProvider())).toHaveLength(0)
    expect(engine.bySessionId('s-001').calls).toBe(0)
  })

  it('snapshot is sorted by timestamp ascending', () => {
    const engine = createCostEngine()
    engine.addMany(buildEvents(200))
    const records = engine.snapshot()
    for (let i = 1; i < records.length; i++) {
      const prev = records[i - 1]
      const curr = records[i]
      if (prev && curr) expect(curr.timestamp).toBeGreaterThanOrEqual(prev.timestamp)
    }
  })

  it('queries complete in well under 50ms for 1000 events', () => {
    const engine = createCostEngine()
    engine.addMany(buildEvents(1000))

    const queries: Array<() => unknown> = [
      () => engine.totals(),
      () => engine.byDay(),
      () => engine.byMonth(),
      () => engine.byModel(),
      () => engine.byProvider(),
      () => engine.bySession(),
      () => engine.byTag(),
      () => engine.costForRange(new Date(2026, 6, 1), new Date(2026, 7, 1)),
    ]
    for (const query of queries) {
      query()
      const start = performance.now()
      query()
      expect(performance.now() - start).toBeLessThan(50)
    }
  })
})
