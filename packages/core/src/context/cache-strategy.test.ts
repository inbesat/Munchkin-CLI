import { describe, expect, it } from 'bun:test'
import { CacheStatsTracker, planCacheControl } from './cache-strategy'

describe('planCacheControl (Phase 91)', () => {
  it('marks the system prompt and last tool result for Anthropic', () => {
    const plan = planCacheControl('anthropic', {
      systemPrompt: 'You are forge.',
      lastToolResult: 'file contents here',
      conversationTail: 'Run the tests.',
    })

    expect(plan.mode).toBe('explicit-blocks')
    expect(plan.systemBlocks).toEqual([
      { content: 'You are forge.', cache_control: { type: 'ephemeral' } },
    ])
    expect(plan.annotatedLastToolResult).toMatchObject({
      content: 'file contents here',
      cache_control: { type: 'ephemeral' },
    })
  })

  it('never emits markers for OpenAI (automatic caching)', () => {
    const plan = planCacheControl('openai', { systemPrompt: 'sys', lastToolResult: 'tr' })
    expect(plan.mode).toBe('automatic')
    expect(plan.systemBlocks).toBeUndefined()
    expect(plan.annotatedLastToolResult).toBeUndefined()
  })

  it('routes Google to the context-caching API mode', () => {
    const plan = planCacheControl('google', { systemPrompt: 'sys' })
    expect(plan.mode).toBe('api-managed')
    expect(plan.systemBlocks).toBeUndefined()
  })

  it('reports unsupported providers without markers', () => {
    const plan = planCacheControl('mystery-provider', { systemPrompt: 'sys', lastToolResult: 'tr' })
    expect(plan.mode).toBe('unsupported')
    expect(plan.systemBlocks).toBeUndefined()
    expect(plan.annotatedLastToolResult).toBeUndefined()
  })
})

describe('CacheStatsTracker (Phase 91)', () => {
  const anthropicRates = { inputPerToken: 3e-6, cacheReadPerToken: 3e-7 }

  it('computes savings from cache-read discounts', () => {
    const tracker = new CacheStatsTracker()
    tracker.record('anthropic', {
      inputTokens: 1000,
      cachedTokens: 800,
      rates: anthropicRates,
    })
    const snapshot = tracker.snapshot()
    expect(snapshot.requests).toBe(1)
    expect(snapshot.cacheHits).toBe(1)
    expect(snapshot.hitRate).toBe(1)
    expect(snapshot.cachedTokens).toBe(800)
    // 800 * (3e-6 - 3e-7) = 2.16e-3 USD saved.
    expect(snapshot.savingsUsd).toBeCloseTo(800 * 2.7e-6, 10)
  })

  it('misses and hit-rate math across mixed requests', () => {
    const tracker = new CacheStatsTracker()
    tracker.record('anthropic', { inputTokens: 500, cachedTokens: 0, rates: anthropicRates })
    tracker.record('anthropic', { inputTokens: 500, cachedTokens: 400, rates: anthropicRates })
    tracker.record('openai', { inputTokens: 100, cachedTokens: 0, rates: { inputPerToken: 5e-7 } })

    const snapshot = tracker.snapshot()
    expect(snapshot.requests).toBe(3)
    expect(snapshot.cacheHits).toBe(1)
    expect(snapshot.hitRate).toBeCloseTo(1 / 3, 10)
    expect(snapshot.cachedTokens).toBe(400)
    expect(snapshot.savingsUsd).toBeCloseTo(400 * 2.7e-6, 10)
  })

  it('keeps savings at zero when a provider has no cache-read rate', () => {
    const tracker = new CacheStatsTracker()
    tracker.record('openai', { inputTokens: 100, cachedTokens: 100, rates: { inputPerToken: 5e-7 } })
    expect(tracker.snapshot().savingsUsd).toBe(0)
  })

  it('returns a zeroed snapshot before any request', () => {
    const snapshot = new CacheStatsTracker().snapshot()
    expect(snapshot.hitRate).toBe(0)
    expect(snapshot.savingsUsd).toBe(0)
    expect(snapshot.requests).toBe(0)
  })
})
