import { describe, expect, it } from 'bun:test'
import { computeBackoffDelay, isRetryableHttpStatus, sleep, withRetry } from './backoff'

describe('computeBackoffDelay', () => {
  it('respects base, factor, and clamping when jitter is off', () => {
    const opts = { baseMs: 100, maxMs: 1000, factor: 3, jitter: false }
    expect(computeBackoffDelay(0, opts)).toBe(100)
    expect(computeBackoffDelay(1, opts)).toBe(300)
    expect(computeBackoffDelay(2, opts)).toBe(900)
    expect(computeBackoffDelay(3, opts)).toBe(1000)
    expect(computeBackoffDelay(50, opts)).toBe(1000)
  })

  it('never exceeds [0, maxMs] with full jitter', () => {
    const opts = { baseMs: 10, maxMs: 30, factor: 2 }
    for (let attempt = 0; attempt < 20; attempt++) {
      const delay = computeBackoffDelay(attempt, opts)
      expect(delay).toBeGreaterThanOrEqual(0)
      expect(delay).toBeLessThanOrEqual(30)
    }
  })

  it('grows exponentially without jitter', () => {
    const base = { baseMs: 10, maxMs: 10_000, factor: 2, jitter: false }
    expect(computeBackoffDelay(4, base)).toBe(160)
  })
})

describe('withRetry', () => {
  it('retries until success and reports attempts', async () => {
    let calls = 0
    const retried: Array<{ attempt: number; delayMs: number }> = []
    const value = await withRetry(
      async () => {
        calls++
        if (calls < 3) throw new Error('boom')
        return 'ok'
      },
      {
        baseMs: 1,
        maxAttempts: 5,
        retryOn: () => true,
        onRetry: (_e, attempt, delayMs) => retried.push({ attempt, delayMs }),
      },
    )
    expect(value).toBe('ok')
    expect(calls).toBe(3)
    expect(retried).toHaveLength(2)
    const [first, second] = retried
    expect(first?.attempt).toBe(1)
    expect(second?.attempt).toBe(2)
    expect(first?.delayMs ?? 0).toBeGreaterThanOrEqual(0)
    expect(first?.delayMs ?? 0).toBeLessThanOrEqual(2)
    expect(second?.delayMs ?? 0).toBeGreaterThanOrEqual(0)
    expect(second?.delayMs ?? 0).toBeLessThanOrEqual(4)
  })

  it('throws immediately when retryOn rejects the error', async () => {
    let calls = 0
    await expect(
      withRetry(
        async () => {
          calls++
          throw new Error('fatal')
        },
        { maxAttempts: 3, retryOn: () => false },
      ),
    ).rejects.toThrow('fatal')
    expect(calls).toBe(1)
  })

  it('exhausts attempts then rethrows', async () => {
    let calls = 0
    await expect(
      withRetry(
        async () => {
          calls++
          throw new Error('still failing')
        },
        { baseMs: 1, maxAttempts: 3, retryOn: () => true },
      ),
    ).rejects.toThrow('still failing')
    expect(calls).toBe(3)
  })

  it('does not retry when the signal is already aborted', async () => {
    let calls = 0
    const controller = new AbortController()
    controller.abort()
    await expect(
      withRetry(
        async () => {
          calls++
          throw new Error('x')
        },
        { abortSignal: controller.signal, maxAttempts: 3, retryOn: () => true },
      ),
    ).rejects.toThrow('x')
    expect(calls).toBe(1)
  })
})

describe('sleep', () => {
  it('resolves after the delay', async () => {
    const start = Date.now()
    await sleep(10)
    expect(Date.now() - start).toBeGreaterThanOrEqual(9)
  })

  it('rejects when the signal aborts', async () => {
    const controller = new AbortController()
    const promise = sleep(10_000, controller.signal)
    setTimeout(() => controller.abort(), 5)
    await expect(promise).rejects.toThrow()
  })
})

describe('isRetryableHttpStatus', () => {
  it('accepts the standard retry statuses', () => {
    for (const status of [408, 429, 500, 502, 503, 504]) {
      expect(isRetryableHttpStatus(status)).toBe(true)
    }
    expect(isRetryableHttpStatus(400)).toBe(false)
    expect(isRetryableHttpStatus(401)).toBe(false)
    expect(isRetryableHttpStatus(503)).toBe(true)
  })
})
