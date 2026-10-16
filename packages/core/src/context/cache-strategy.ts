/**
 * Prompt caching strategy per provider (Phase 91).
 *
 * - Anthropic: explicit `cache_control: { type: 'ephemeral' }` breakpoints at
 *   optimal positions (the system prompt and the last tool result).
 * - OpenAI: automatic caching — no inline markers.
 * - Google: context caching is created via a server-side API (api-managed),
 *   so no inline markers either.
 * - Hit rates and cost savings are tracked per request; savings assume
 *   cached input is billed at `cacheReadPerToken` instead of `inputPerToken`
 *   (rates mirror the @forge/ai ModelCostConfig shape without importing it —
 *   core must not depend on @forge/ai).
 */

export type CacheMode = 'explicit-blocks' | 'automatic' | 'api-managed' | 'unsupported'

export interface CacheControlBlock {
  content: string
  cache_control: { type: 'ephemeral' }
}

export interface CachePlanInput {
  systemPrompt: string
  lastToolResult?: string
  conversationTail?: string
}

export interface CachePlan {
  provider: string
  mode: CacheMode
  /** Anthropic only: the system prompt wrapped with an ephemeral breakpoint. */
  systemBlocks?: CacheControlBlock[]
  /** Anthropic only: the final tool-result annotated with an ephemeral breakpoint. */
  annotatedLastToolResult?: CacheControlBlock
}

interface CacheableRates {
  inputPerToken: number
  cacheReadPerToken?: number
}

export interface CacheRequestInput {
  inputTokens: number
  cachedTokens: number
  rates: CacheableRates
}

export interface CacheStatsSnapshot {
  requests: number
  cacheHits: number
  /** requests with cachedTokens > 0 over total requests; 0 when no requests. */
  hitRate: number
  cachedTokens: number
  inputTokens: number
  savingsUsd: number
}

const ANTHROPIC_MARKER = { type: 'ephemeral' } as const

/** Plan per-provider prompt caching for one request. */
export function planCacheControl(provider: string, input: CachePlanInput): CachePlan {
  switch (provider) {
    case 'anthropic': {
      const systemBlocks: CacheControlBlock[] = input.systemPrompt
        ? [{ content: input.systemPrompt, cache_control: ANTHROPIC_MARKER }]
        : []
      return {
        provider,
        mode: 'explicit-blocks',
        systemBlocks,
        annotatedLastToolResult: input.lastToolResult
          ? { content: input.lastToolResult, cache_control: ANTHROPIC_MARKER }
          : undefined,
      }
    }
    case 'openai':
      return { provider, mode: 'automatic' }
    case 'google':
      return { provider, mode: 'api-managed' }
    default:
      return { provider, mode: 'unsupported' }
  }
}

/** Aggregate cache hit rates and cost savings across requests. */
export class CacheStatsTracker {
  private requests = 0
  private cacheHits = 0
  private cachedTokens = 0
  private inputTokens = 0
  private savingsUsd = 0

  record(_provider: string, request: CacheRequestInput): void {
    const { inputTokens, cachedTokens, rates } = request
    this.requests += 1
    if (cachedTokens > 0) this.cacheHits += 1
    this.cachedTokens += Math.max(0, cachedTokens)
    this.inputTokens += Math.max(0, inputTokens)
    if (rates.cacheReadPerToken !== undefined) {
      this.savingsUsd +=
        Math.max(0, cachedTokens) * Math.max(0, rates.inputPerToken - rates.cacheReadPerToken)
    }
  }

  snapshot(): CacheStatsSnapshot {
    return {
      requests: this.requests,
      cacheHits: this.cacheHits,
      hitRate: this.requests === 0 ? 0 : this.cacheHits / this.requests,
      cachedTokens: this.cachedTokens,
      inputTokens: this.inputTokens,
      savingsUsd: this.savingsUsd,
    }
  }
}
