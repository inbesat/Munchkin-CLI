import { describe, expect, it } from 'bun:test'
import { computeContextRows, type ContextGridInput } from './context-grid'

const input = (overrides: Partial<ContextGridInput['breakdown']> = {}): ContextGridInput => ({
  totalBudget: 2000,
  breakdown: {
    systemPrompt: 400,
    conversationHistory: 600,
    toolSchemas: 200,
    mcpToolSchemas: 0,
    reservedForResponse: 200,
    ...overrides,
  },
})

describe('computeContextRows (Phase 90)', () => {
  it('creates one bar per breakdown segment plus available', () => {
    const result = computeContextRows(input(), { width: 20 })
    const labels = result.rows.map((r) => r.label)
    expect(labels).toEqual([
      'system prompt',
      'conversation',
      'tool schemas',
      'mcp tools',
      'response reserve',
      'available',
    ])
  })

  it('scales bars proportionally to the total budget', () => {
    const result = computeContextRows(input(), { width: 20 })
    const system = result.rows[0]
    expect(system?.tokens).toBe(400)
    expect(system?.fraction).toBeCloseTo(0.2)
    // 20 chars * 0.2 filled = 4 filled; available = 600/2000 = 0.3 -> 6 filled.
    expect(system?.bar).toBe('████░░░░░░░░░░░░░░░░')
    const available = result.rows.at(-1)
    expect(available?.bar).toBe('██████░░░░░░░░░░░░░░')
  })

  it('clamps rounding so a bar never exceeds its width', () => {
    const result = computeContextRows(
      input({ systemPrompt: 2000, conversationHistory: 0, toolSchemas: 0, reservedForResponse: 0 }),
      { width: 16 },
    )
    const rows = result.rows
    for (const row of rows) expect(row.bar.length).toBe(16)
    expect(rows[0]?.bar).toBe('████████████████')
    expect(rows[0]?.fraction).toBe(1)
  })

  it('renders zero-size segments as empty bars with 0%', () => {
    const result = computeContextRows(input({ systemPrompt: 0 }), { width: 10 })
    expect(result.rows[0]?.bar).toBe('░░░░░░░░░░')
    expect(result.rows[0]?.percentText).toBe('0.0%')
  })

  it('reports accurate percent text among filled segments', () => {
    const result = computeContextRows(input(), { width: 20 })
    const conversation = result.rows[1]
    expect(conversation?.percentText).toBe('30.0%')
    expect(result.headerText).toContain('2,000')
  })

  it('degrades safely to a 1-char bar for a zero or negative width', () => {
    const result = computeContextRows(input(), { width: 0 })
    for (const row of result.rows) expect(row.bar.length).toBe(1)
  })

  it('reflects new inputs on recomputation (real-time updates)', () => {
    const before = computeContextRows(input(), { width: 20 })
    const grown = computeContextRows(input({ conversationHistory: 1200 }), { width: 20 })
    const conversationBefore = before.rows[1]?.bar ?? ''
    const conversationAfter = grown.rows[1]?.bar ?? ''
    expect(conversationAfter).not.toBe(conversationBefore)
  })
})
