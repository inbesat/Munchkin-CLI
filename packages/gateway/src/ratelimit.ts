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
  readonly windowMs: number
  readonly maxRequests: number

  constructor(windowMs: number, maxRequests: number) {
    if (windowMs <= 0) throw new Error('windowMs must be positive')
    if (maxRequests <= 0) throw new Error('maxRequests must be positive')
    this.windowMs = windowMs
    this.maxRequests = maxRequests
  }

  check(key: string, now = Date.now()): LimitDecision {
    const cutoff = now - this.windowMs
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
