import { describe, expect, it } from 'bun:test'
import { parseUsage } from './proxy'
import { SqliteQuotaEngine } from './quota'
import { SlidingWindowLimiter } from './ratelimit'

describe('untrusted usage', () => {
  for (const value of [
    -1,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    1.5,
    '3',
    null,
    Number.MAX_SAFE_INTEGER + 1,
  ]) {
    it(`rejects invalid token count ${String(value)}`, () => {
      expect(parseUsage({ usage: { total_tokens: value } })).toBeNull()
      const quota = new SqliteQuotaEngine()
      try {
        quota.addUsage('ip:test', { tokens: 5 })
        expect(() => quota.addUsage('ip:test', { tokens: value as number })).toThrow()
        expect(quota.getUsage('ip:test').tokens).toBe(5)
      } finally {
        quota.close()
      }
    })
  }

  it('rejects empty or internally inconsistent usage', () => {
    expect(parseUsage({ usage: {} })).toBeNull()
    expect(
      parseUsage({ usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 1 } }),
    ).toBeNull()
    expect(
      parseUsage({ usage: { prompt_tokens: Number.MAX_SAFE_INTEGER, completion_tokens: 1 } }),
    ).toBeNull()
  })

  it('derives totals and allows zero or total-only usage', () => {
    expect(parseUsage({ usage: { prompt_tokens: 2, completion_tokens: 3 } })?.totalTokens).toBe(5)
    expect(parseUsage({ usage: { total_tokens: 0 } })?.totalTokens).toBe(0)
    expect(parseUsage({ usage: { total_tokens: 5 } })?.totalTokens).toBe(5)
  })

  for (const value of [-1, Number.NaN, Number.POSITIVE_INFINITY, '3', null]) {
    it(`rejects invalid cost ${String(value)} without changing balance`, () => {
      const quota = new SqliteQuotaEngine()
      try {
        expect(() => quota.addUsage('ip:test', { tokens: 1, costUsd: value as number })).toThrow()
        expect(quota.getUsage('ip:test')).toEqual({ tokens: 0, costUsd: 0 })
      } finally {
        quota.close()
      }
    })
  }
})

describe('limiter configuration', () => {
  for (const value of [Number.NaN, Number.POSITIVE_INFINITY, 1.5, 0, -1]) {
    it(`rejects non-positive or non-integer settings ${String(value)}`, () => {
      expect(() => new SlidingWindowLimiter(value, 1)).toThrow()
      expect(() => new SlidingWindowLimiter(1000, value)).toThrow()
    })
  }

  it('incrementally removes expired keys without retaining an unbounded map', () => {
    const limiter = new SlidingWindowLimiter(10, 1)
    for (let i = 0; i < 2000; i++) limiter.check(`ip:${i}`, 0)
    for (let i = 0; i < 20; i++) limiter.check('active', 20)
    expect(limiter.trackedKeys).toBe(1)
  })
})
