import type { ModelCostConfig, TokenUsage } from '../model/types'
import {
  cacheHitRate,
  cacheReadRate,
  cacheWriteRate,
  computeCacheCost,
  isCachePriced,
} from './cost'

function cost(overrides: Partial<ModelCostConfig> = {}): ModelCostConfig {
  return { inputPerToken: 3e-6, outputPerToken: 1.5e-5, ...overrides }
}

function usage(overrides: Partial<TokenUsage> = {}): TokenUsage {
  return { input: 1000, output: 200, total: 1200, ...overrides }
}

describe('computeCacheCost', () => {
  it('applies anthropic-style discounts on cache reads and write surcharges', () => {
    const result = computeCacheCost(
      usage({ cacheRead: 900, cacheWrite: 80 }),
      cost({ cacheReadPerToken: 3e-7, cacheWritePerToken: 3.75e-6 }),
    )
    expect(result.uncachedInputTokens).toBe(20)
    expect(result.hitRate).toBe(0.9)
    expect(result.cacheReadCost).toBeCloseTo(900 * 3e-7, 12)
    expect(result.cacheWriteCost).toBeCloseTo(80 * 3.75e-6, 12)
    expect(result.inputCost).toBeCloseTo(20 * 3e-6, 12)
    expect(result.outputCost).toBeCloseTo(200 * 1.5e-5, 12)
    expect(result.baselineCost).toBeCloseTo(1000 * 3e-6 + 200 * 1.5e-5, 12)
    expect(result.totalCost).toBeCloseTo(
      result.baselineCost - result.savings + result.writeSurcharge,
      12,
    )
    expect(result.savings).toBeCloseTo(900 * (3e-6 - 3e-7), 12)
    expect(result.writeSurcharge).toBeCloseTo(80 * (3.75e-6 - 3e-6), 12)
  })

  it('bills cached tokens at the base rate when no cache prices are declared', () => {
    const result = computeCacheCost(usage({ cacheRead: 900 }), cost())
    expect(result.cacheReadCost).toBeCloseTo(900 * 3e-6, 12)
    expect(result.savings).toBe(0)
    expect(result.totalCost).toBe(result.baselineCost)
    expect(result.hitRate).toBe(0.9)
  })

  it('keeps cache activity visible even without a discount', () => {
    const result = computeCacheCost(usage({ cacheRead: 500, cacheWrite: 300 }), cost())
    expect(result.cacheReadTokens).toBe(500)
    expect(result.cacheWriteTokens).toBe(300)
    expect(result.uncachedInputTokens).toBe(200)
  })

  it('handles zero input', () => {
    const result = computeCacheCost(usage({ input: 0, total: 200 }), cost())
    expect(result.hitRate).toBe(0)
    expect(result.totalCost).toBe(200 * 1.5e-5)
    expect(result.savings).toBe(0)
  })

  it('clamps the hit rate to [0, 1]', () => {
    expect(cacheHitRate(usage({ cacheRead: 2000 }))).toBe(1)
    expect(cacheHitRate(usage({ cacheRead: -50 }))).toBe(0)
  })
})

describe('rate helpers', () => {
  it('falls back to the base input rate when cache pricing is missing', () => {
    const plain = cost()
    expect(cacheReadRate(plain)).toBe(3e-6)
    expect(cacheWriteRate(plain)).toBe(3e-6)
    expect(isCachePriced(plain)).toBe(false)

    const priced = cost({ cacheReadPerToken: 3e-7, cacheWritePerToken: 3.75e-6 })
    expect(cacheReadRate(priced)).toBe(3e-7)
    expect(cacheWriteRate(priced)).toBe(3.75e-6)
    expect(isCachePriced(priced)).toBe(true)
  })
})
