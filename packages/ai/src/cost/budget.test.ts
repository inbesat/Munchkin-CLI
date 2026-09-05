import { describe, expect, it } from 'bun:test'
import type { ModelCostConfig, TokenUsage } from '../model/types'
import { createBudgetMonitor } from './budget'
import { createCostEngine } from './engine'

const PRICING: ModelCostConfig = { inputPerToken: 1e-6, outputPerToken: 1e-6 }

function usage(): TokenUsage {
  return { input: 100, output: 100, total: 200 }
}

describe('createBudgetMonitor', () => {
  it('fires a daily warning + block at the daily ceiling', () => {
    const engine = createCostEngine()
    const monitor = createBudgetMonitor(engine, { daily: 0.005 })
    const now = new Date(2026, 6, 15, 12, 0, 0)

    engine.add({
      model: 'gpt-4o',
      provider: 'openai',
      timestamp: now,
      usage: usage(),
      cost: PRICING,
    })

    const earlier = new Date(2026, 6, 15, 8, 0, 0)
    expect(monitor.check(earlier).ok).toBe(true)

    for (let i = 0; i < 29; i++) {
      engine.add({
        model: 'gpt-4o',
        provider: 'openai',
        timestamp: now,
        usage: usage(),
        cost: PRICING,
      })
    }

    const status = monitor.check(now)
    expect(status.exceeded.daily).toBe(true)
    expect(status.ok).toBe(false)
    expect(status.warnings.some((w) => w.includes('daily budget exceeded'))).toBe(true)
    expect(monitor.shouldBlock(now)).toBe(true)
  })

  it('warns at warnAt fraction before the ceiling is reached', () => {
    const engine = createCostEngine()
    const warnings: string[] = []
    const monitor = createBudgetMonitor(
      engine,
      { daily: 0.0006 },
      { warnAt: 0.3, onWarn: (w) => warnings.push(...w) },
    )
    const now = new Date(2026, 6, 15, 12, 0, 0)

    engine.add({
      model: 'gpt-4o',
      provider: 'openai',
      timestamp: now,
      usage: usage(),
      cost: PRICING,
    })

    const status = monitor.check(now)
    expect(status.exceeded.daily).toBe(false)
    expect(status.ok).toBe(true)
    expect(status.warnings.some((w) => w.includes('daily budget at'))).toBe(true)
    expect(warnings.length).toBeGreaterThan(0)
    expect(monitor.shouldBlock(now)).toBe(false)
  })

  it('separates daily, monthly and session budgets', () => {
    const engine = createCostEngine()
    const monitor = createBudgetMonitor(
      engine,
      { daily: 0.1, monthly: 0.1, session: 0.01 },
      { sessionId: 's-1' },
    )
    const now = new Date(2026, 6, 15, 12, 0, 0)
    const lastMonth = new Date(2026, 5, 15, 12, 0, 0)

    engine.add({
      sessionId: 's-1',
      model: 'gpt-4o',
      provider: 'openai',
      timestamp: lastMonth,
      usage: usage(),
      cost: PRICING,
    })
    // 60 calls today in session s-1 => $0.012, above session, under daily+monthly.
    for (let i = 0; i < 60; i++) {
      engine.add({
        sessionId: 's-1',
        model: 'gpt-4o',
        provider: 'openai',
        timestamp: now,
        usage: usage(),
        cost: PRICING,
      })
    }

    const status = monitor.check(now)
    expect(status.exceeded.session).toBe(true)
    expect(status.exceeded.daily).toBe(false)
    expect(status.exceeded.monthly).toBe(false)
    expect(status.warnings.some((w) => w.includes('session budget exceeded'))).toBe(true)
    expect(monitor.shouldBlock(now)).toBe(true)
  })

  it('reports used and remaining amounts', () => {
    const engine = createCostEngine()
    const monitor = createBudgetMonitor(engine, { daily: 0.01 })
    const now = new Date(2026, 6, 15, 12, 0, 0)
    engine.add({
      model: 'gpt-4o',
      provider: 'openai',
      timestamp: now,
      usage: usage(),
      cost: PRICING,
    })

    const status = monitor.check(now)
    expect(status.used.daily).toBeCloseTo(0.0002, 12)
    expect(status.remaining.daily).toBeCloseTo(0.0098, 12)
  })

  it('is a no-op when no budgets are configured', () => {
    const engine = createCostEngine()
    const monitor = createBudgetMonitor(engine, {})
    engine.add({
      model: 'gpt-4o',
      provider: 'openai',
      timestamp: new Date(),
      usage: usage(),
      cost: PRICING,
    })
    const status = monitor.check()
    expect(status.ok).toBe(true)
    expect(status.warnings).toEqual([])
    expect(monitor.shouldBlock()).toBe(false)
  })
})
