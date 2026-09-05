import { describe, expect, it } from 'bun:test'
import { percentile } from './startup'

describe('percentile', () => {
  it('returns 0 for empty', () => {
    expect(percentile([], 50)).toBe(0)
  })
  it('returns the value for single element', () => {
    expect(percentile([42], 95)).toBe(42)
  })
  it('computes p50 (median)', () => {
    expect(percentile([1, 2, 3, 4, 5], 50)).toBe(3)
  })
  it('computes p95 with interpolation', () => {
    const r = percentile([10, 20, 30, 40, 50, 60, 70, 80, 90, 100], 95)
    expect(r).toBeGreaterThan(95)
    expect(r).toBeLessThanOrEqual(100)
  })
  it('handles unsorted input', () => {
    expect(percentile([5, 1, 3, 2, 4], 50)).toBe(3)
  })
})
