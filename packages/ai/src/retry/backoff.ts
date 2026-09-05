/** Exponential backoff with full jitter + a generic retry helper. */

export interface BackoffOptions {
  /** Base delay for the first retry, ms (default 250). */
  baseMs?: number
  /** Hard cap on a single delay, ms (default 8000). */
  maxMs?: number
  /** Multiplier applied per attempt (default 2). */
  factor?: number
  /** Randomized delay inside `[0, cap]` per RFC 6249-style jitter (default true). */
  jitter?: boolean
  /** Total attempts including the first call (default 3). */
  maxAttempts?: number
  /** Called right before sleeping on a retry. */
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void
}

export const DEFAULT_BASE_MS = 250
export const DEFAULT_MAX_MS = 8000
export const DEFAULT_FACTOR = 2
export const DEFAULT_MAX_ATTEMPTS = 3

/**
 * Exponential backoff delay for a 0-indexed retry attempt.
 * Uses full jitter: `U(0, min(maxMs, base * factor^attempt))`.
 */
export function computeBackoffDelay(
  attempt: number,
  opts: Pick<BackoffOptions, 'baseMs' | 'maxMs' | 'factor' | 'jitter'> = {},
): number {
  const baseMs = opts.baseMs ?? DEFAULT_BASE_MS
  const maxMs = opts.maxMs ?? DEFAULT_MAX_MS
  const factor = opts.factor ?? DEFAULT_FACTOR
  const safe = Math.max(0, attempt)
  const cap = Math.min(maxMs, baseMs * factor ** safe)
  if (opts.jitter === false) return cap
  return Math.random() * cap
}

/** Resolves after `ms`, rejecting immediately if `signal` aborts first. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException('The operation was aborted.', 'AbortError'))
      return
    }
    const timer = setTimeout(() => {
      cleanup()
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(signal?.reason ?? new DOMException('The operation was aborted.', 'AbortError'))
    }
    const cleanup = () => signal?.removeEventListener('abort', onAbort)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/** HTTP statuses that are safe to retry. */
export const RETRYABLE_HTTP_STATUSES: readonly number[] = [408, 429, 500, 502, 503, 504]

export function isRetryableHttpStatus(status: number): boolean {
  return RETRYABLE_HTTP_STATUSES.includes(status)
}

/**
 * Runs `fn`, retrying failures that satisfy `retryOn` (defaults to retryable
 * status errors) with exponential backoff. The last error is rethrown once
 * attempts are exhausted.
 */
export async function withRetry<T>(
  fn: () => Promise<T> | T,
  opts: BackoffOptions & { retryOn?: (error: unknown) => boolean; abortSignal?: AbortSignal } = {},
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS
  let attempt = 0
  for (;;) {
    try {
      return await fn()
    } catch (error) {
      if (opts.abortSignal?.aborted) throw error
      if (opts.retryOn && !opts.retryOn(error)) throw error
      attempt += 1
      if (attempt >= maxAttempts) throw error
      const delayMs = computeBackoffDelay(attempt, opts)
      opts.onRetry?.(error, attempt, delayMs)
      await sleep(delayMs, opts.abortSignal)
    }
  }
}
