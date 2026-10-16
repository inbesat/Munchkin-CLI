export interface LimitDecision {
  allowed: boolean
  retryAfterMs: number
}

export interface Limiter {
  check(key: string, now?: number): LimitDecision
}

/**
 * Fixed-window sliding rate limiter. Tracks timestamps per key and allows at
 * most `maxRequests` within `windowMs`. Returns a 429-compatible Retry-After
 * duration when denied. In-memory (a restart resets counters) — Phase 32 ops
 * layer can swap in a shared store for multi-instance deployments.
 */
export class SlidingWindowLimiter implements Limiter {
  #hits = new Map<string, number[]>()
  #cleanup: MapIterator<[string, number[]]> | undefined
  readonly windowMs: number
  readonly maxRequests: number

  constructor(windowMs: number, maxRequests: number) {
    if (!Number.isSafeInteger(windowMs) || windowMs <= 0) {
      throw new Error('windowMs must be a positive safe integer')
    }
    if (!Number.isSafeInteger(maxRequests) || maxRequests <= 0) {
      throw new Error('maxRequests must be a positive safe integer')
    }
    this.windowMs = windowMs
    this.maxRequests = maxRequests
  }

  get trackedKeys(): number {
    return this.#hits.size
  }

  /** Amortized, bounded cleanup work per check; no timers or full-map scans. */
  #prune(cutoff: number): void {
    this.#cleanup ??= this.#hits.entries()
    for (let i = 0; i < 128; i++) {
      const entry = this.#cleanup.next()
      if (entry.done) {
        this.#cleanup = undefined
        break
      }
      const [key, hits] = entry.value
      if (hits[hits.length - 1] <= cutoff) this.#hits.delete(key)
    }
  }

  check(key: string, now = Date.now()): LimitDecision {
    const cutoff = now - this.windowMs
    this.#prune(cutoff)
    const hits = (this.#hits.get(key) ?? []).filter((t) => t > cutoff)

    if (hits.length >= this.maxRequests) {
      const oldest = hits[0]
      return { allowed: false, retryAfterMs: Math.max(1, oldest + this.windowMs - now) }
    }

    hits.push(now)
    this.#hits.set(key, hits)
    return { allowed: true, retryAfterMs: 0 }
  }
}
