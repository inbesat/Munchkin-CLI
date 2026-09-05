import type { ModelCostConfig, TokenUsage } from '../model/types'

/**
 * Cache-aware cost accounting. Providers report cache activity through
 * `TokenUsage.cacheRead` / `cacheWrite` (see anthropic + openai-compatible
 * adapters). This layer turns those token figures into money, honoring the
 * per-provider pricing model:
 *
 * - Anthropic: `cacheReadPerToken` ≈ 0.1 × input, `cacheWritePerToken` ≈ 1.25 × input.
 * - OpenAI/others: cached tokens are reported but billed at the base input
 *   price, so a missing `cacheReadPerToken` means no discount is applied.
 */

export interface CacheCostResult {
  readonly inputTokens: number
  readonly cacheReadTokens: number
  readonly cacheWriteTokens: number
  /** Input tokens billed at the base input rate (not served from / written to cache). */
  readonly uncachedInputTokens: number
  /** Fraction of input tokens served from cache, clamped to [0, 1]. */
  readonly hitRate: number
  readonly inputCost: number
  readonly cacheReadCost: number
  readonly cacheWriteCost: number
  readonly outputCost: number
  /** Actual cost including cache discounts and write surcharges. */
  readonly totalCost: number
  /** What the call would cost if every token were billed at base rates. */
  readonly baselineCost: number
  /** Money saved purely from cache hits (never negative). */
  readonly savings: number
  /** Extra cost when cache writes bill above the base input rate. */
  readonly writeSurcharge: number
}

export const cacheHitRate = (usage: TokenUsage): number => {
  if (usage.input <= 0) return 0
  return Math.min(Math.max((usage.cacheRead ?? 0) / usage.input, 0), 1)
}

export const cacheReadRate = (cost: ModelCostConfig): number =>
  cost.cacheReadPerToken ?? cost.inputPerToken

export const cacheWriteRate = (cost: ModelCostConfig): number =>
  cost.cacheWritePerToken ?? cost.inputPerToken

/** True when the model config declares cache-specific prices. */
export const isCachePriced = (cost: ModelCostConfig): boolean =>
  cost.cacheReadPerToken !== undefined || cost.cacheWritePerToken !== undefined

export function computeCacheCost(usage: TokenUsage, cost: ModelCostConfig): CacheCostResult {
  const inputTokens = usage.input
  const cacheReadTokens = usage.cacheRead ?? 0
  const cacheWriteTokens = usage.cacheWrite ?? 0
  const outputTokens = usage.output
  const uncachedInputTokens = Math.max(inputTokens - cacheReadTokens - cacheWriteTokens, 0)
  const hitRate = cacheHitRate(usage)

  const base = cost.inputPerToken
  const readRate = cacheReadRate(cost)
  const writeRate = cacheWriteRate(cost)

  const inputCost = uncachedInputTokens * base
  const cacheReadCost = cacheReadTokens * readRate
  const cacheWriteCost = cacheWriteTokens * writeRate
  const outputCost = outputTokens * cost.outputPerToken
  const totalCost = inputCost + cacheReadCost + cacheWriteCost + outputCost
  const baselineCost = inputTokens * base + outputTokens * cost.outputPerToken

  const savings = cacheReadTokens * (base - readRate)
  const writeSurcharge = writeRate > base ? cacheWriteTokens * (writeRate - base) : 0

  return {
    inputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    uncachedInputTokens,
    hitRate,
    inputCost,
    cacheReadCost,
    cacheWriteCost,
    outputCost,
    totalCost,
    baselineCost,
    savings,
    writeSurcharge,
  }
}
