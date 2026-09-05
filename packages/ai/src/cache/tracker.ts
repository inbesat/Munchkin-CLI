import type { TokenUsage } from '../model/types'
import { cacheHitRate } from './cost'

/**
 * Per-provider cache hit/miss tracking. The agent loop records every
 * successful generation's usage here, and queries cache performance through
 * `snapshot()` — the surface Phase 28's cost engine / `/cost` dashboard reads.
 * Numbers are plain in-memory accumulators; call `reset()` to start a window.
 */

export interface CacheProviderStats {
  readonly provider: string
  readonly calls: number
  readonly inputTokens: number
  readonly outputTokens: number
  readonly cacheReadTokens: number
  readonly cacheWriteTokens: number
  /** cacheRead / input across all recorded calls, in [0, 1]. */
  readonly hitRate: number
  /** cacheWrite / input across all recorded calls, in [0, 1]. */
  readonly cacheWriteRate: number
}

export interface CacheSnapshot {
  readonly providers: readonly CacheProviderStats[]
  /** Rollup across every provider (provider name `'overall'`). */
  readonly overall: CacheProviderStats
}

export interface CacheTracker {
  record(provider: string, usage: TokenUsage): void
  stats(provider: string): CacheProviderStats | undefined
  snapshot(): CacheSnapshot
  reset(provider?: string): void
}

interface Accumulator {
  provider: string
  calls: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}

function toStats(acc: Accumulator): CacheProviderStats {
  return {
    provider: acc.provider,
    calls: acc.calls,
    inputTokens: acc.inputTokens,
    outputTokens: acc.outputTokens,
    cacheReadTokens: acc.cacheReadTokens,
    cacheWriteTokens: acc.cacheWriteTokens,
    hitRate: cacheHitRate({
      input: acc.inputTokens,
      output: acc.outputTokens,
      cacheRead: acc.cacheReadTokens,
      cacheWrite: acc.cacheWriteTokens,
      total: acc.inputTokens + acc.outputTokens,
    }),
    cacheWriteRate: acc.inputTokens > 0 ? Math.min(acc.cacheWriteTokens / acc.inputTokens, 1) : 0,
  }
}

export function createCacheTracker(): CacheTracker {
  const providers = new Map<string, Accumulator>()

  function get(provider: string): Accumulator {
    let acc = providers.get(provider)
    if (!acc) {
      acc = {
        provider,
        calls: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      }
      providers.set(provider, acc)
    }
    return acc
  }

  function rollup(): Accumulator {
    const out: Accumulator = {
      provider: 'overall',
      calls: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    }
    for (const acc of providers.values()) {
      out.calls += acc.calls
      out.inputTokens += acc.inputTokens
      out.outputTokens += acc.outputTokens
      out.cacheReadTokens += acc.cacheReadTokens
      out.cacheWriteTokens += acc.cacheWriteTokens
    }
    return out
  }

  return {
    record(provider, usage) {
      const acc = get(provider)
      acc.calls += 1
      acc.inputTokens += usage.input
      acc.outputTokens += usage.output
      acc.cacheReadTokens += usage.cacheRead ?? 0
      acc.cacheWriteTokens += usage.cacheWrite ?? 0
    },
    stats(provider) {
      const acc = providers.get(provider)
      return acc ? toStats(acc) : undefined
    },
    snapshot() {
      const perProvider = [...providers.values()].map(toStats)
      return { providers: perProvider, overall: toStats(rollup()) }
    },
    reset(provider) {
      if (provider) providers.delete(provider)
      else providers.clear()
    },
  }
}
