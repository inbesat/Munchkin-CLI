import { describe, expect, it } from 'bun:test'
import {
  filterSessions,
  formatSessionDate,
  moveSessionSelection,
  type SessionSummary,
} from './session-picker'

function sess(id: string, title: string, preview = '', model?: string): SessionSummary {
  return {
    id,
    title,
    preview,
    model,
    cost: id.length,
    createdAt: 1_700_000_000_000 + id.charCodeAt(0) * 1000,
  }
}

describe('filterSessions', () => {
  const list = [
    sess('a', 'Refactor auth', 'moved login logic', 'claude-opus'),
    sess('b', 'Fix bug', 'null pointer in parser', 'gpt-4'),
    sess('c', 'Write docs', 'updated README', 'claude-opus'),
  ]

  it('returns all when query empty', () => {
    expect(filterSessions(list, '')).toHaveLength(3)
    expect(filterSessions(list, '   ')).toHaveLength(3)
  })

  it('matches title', () => {
    expect(filterSessions(list, 'auth').map((s) => s.id)).toEqual(['a'])
  })

  it('matches model', () => {
    expect(filterSessions(list, 'gpt').map((s) => s.id)).toEqual(['b'])
  })

  it('matches preview', () => {
    expect(filterSessions(list, 'parser').map((s) => s.id)).toEqual(['b'])
  })

  it('supports multi-term AND', () => {
    expect(filterSessions(list, 'claude docs').map((s) => s.id)).toEqual(['c'])
  })

  it('is case-insensitive', () => {
    expect(filterSessions(list, 'AUTH').map((s) => s.id)).toEqual(['a'])
  })

  it('returns none when no match', () => {
    expect(filterSessions(list, 'zzz')).toHaveLength(0)
  })
})

describe('formatSessionDate', () => {
  it('formats date and time', () => {
    const d = new Date(2026, 7, 29, 9, 5)
    expect(formatSessionDate(d.getTime())).toBe('2026-08-29 09:05')
  })
})

describe('moveSessionSelection', () => {
  it('returns 0 for empty', () => {
    expect(moveSessionSelection(0, 0, 1)).toBe(0)
  })
  it('seeds first when negative and forward', () => {
    expect(moveSessionSelection(3, -1, 1)).toBe(0)
  })
  it('seeds last when negative and back', () => {
    expect(moveSessionSelection(3, -1, -1)).toBe(2)
  })
  it('moves and clamps', () => {
    expect(moveSessionSelection(3, 0, 1)).toBe(1)
    expect(moveSessionSelection(3, 2, 1)).toBe(2)
    expect(moveSessionSelection(3, 0, -1)).toBe(0)
  })
})
