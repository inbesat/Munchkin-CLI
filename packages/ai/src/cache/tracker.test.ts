import type { TokenUsage } from '../model/types'
import { createCacheTracker } from './tracker'

function usage(input: number, cacheRead = 0, cacheWrite = 0): TokenUsage {
  return { input, output: 10, total: input + 10, cacheRead, cacheWrite }
}

describe('createCacheTracker', () => {
  it('tracks per-provider calls and pools cache tokens', () => {
    const tracker = createCacheTracker()
    tracker.record('anthropic', usage(1000, 900))
    tracker.record('anthropic', usage(500, 200, 100))
    tracker.record('openai', usage(300))

    const anthropic = tracker.stats('anthropic')
    expect(anthropic).toMatchObject({
      provider: 'anthropic',
      calls: 2,
      inputTokens: 1500,
      cacheReadTokens: 1100,
      cacheWriteTokens: 100,
    })
    expect(anthropic?.hitRate).toBeCloseTo(1100 / 1500, 12)

    const openai = tracker.stats('openai')
    expect(openai?.calls).toBe(1)
    expect(openai?.hitRate).toBe(0)
  })

  it('returns undefined for unknown providers', () => {
    const tracker = createCacheTracker()
    tracker.record('anthropic', usage(100))
    expect(tracker.stats('unknown')).toBeUndefined()
  })

  it('rolls every provider into overall stats', () => {
    const tracker = createCacheTracker()
    tracker.record('anthropic', usage(1000, 700))
    tracker.record('openai', usage(500, 100))

    const snapshot = tracker.snapshot()
    expect(snapshot.providers.map((p) => p.provider)).toEqual(['anthropic', 'openai'])
    expect(snapshot.overall.inputTokens).toBe(1500)
    expect(snapshot.overall.cacheReadTokens).toBe(800)
    expect(snapshot.overall.calls).toBe(2)
    expect(snapshot.overall.hitRate).toBeCloseTo(800 / 1500, 12)
  })

  it('reports cache write rate', () => {
    const tracker = createCacheTracker()
    tracker.record('anthropic', usage(1000, 0, 500))
    tracker.record('anthropic', usage(1000))
    expect(tracker.stats('anthropic')?.cacheWriteRate).toBeCloseTo(500 / 2000, 12)
  })

  it('reset clears the window (optionally per provider)', () => {
    const tracker = createCacheTracker()
    tracker.record('anthropic', usage(100, 50))
    tracker.record('openai', usage(100, 25))

    tracker.reset('anthropic')
    expect(tracker.stats('anthropic')).toBeUndefined()
    expect(tracker.stats('openai')).not.toBeUndefined()

    tracker.record('anthropic', usage(100))
    tracker.reset()
    expect(tracker.stats('anthropic')).toBeUndefined()
    expect(tracker.stats('openai')).toBeUndefined()
    expect(tracker.snapshot().overall.calls).toBe(0)
  })

  it('snapshot overall is empty before any records', () => {
    const snapshot = createCacheTracker().snapshot()
    expect(snapshot.providers).toEqual([])
    expect(snapshot.overall).toMatchObject({ calls: 0, inputTokens: 0, hitRate: 0 })
  })
})
