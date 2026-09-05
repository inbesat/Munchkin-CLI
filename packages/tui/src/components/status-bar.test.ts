import { describe, expect, it } from 'bun:test'
import {
  buildStatusBarSegments,
  formatCost,
  formatTokens,
  selectVisibleSegments,
  statusColor,
  type StatusBarState,
  type StatusSegment,
} from './status-bar'

const theme = {
  background: '#1e1e1e',
  surface: '#252526',
  surfaceElevated: '#2d2d2d',
  border: '#3c3c3c',
  borderFocus: '#007acc',
  textPrimary: '#cccccc',
  textSecondary: '#969696',
  textMuted: '#6a6a6a',
  textInverse: '#1e1e1e',
  primary: '#007acc',
  primaryHover: '#0099ff',
  secondary: '#6a6a6a',
  accent: '#dcdcaa',
  success: '#4ec9b0',
  warning: '#dcdcaa',
  error: '#f44747',
  info: '#9cdcfe',
  codeBackground: '#1e1e1e',
  selection: '#264f78',
} as unknown as import('../theme').ThemeColors

describe('formatTokens', () => {
  it('formats small numbers', () => {
    expect(formatTokens(0)).toBe('0')
    expect(formatTokens(999)).toBe('999')
  })
  it('formats thousands', () => {
    expect(formatTokens(1234)).toBe('1.2k')
    expect(formatTokens(1500)).toBe('1.5k')
  })
  it('formats millions', () => {
    expect(formatTokens(1_500_000)).toBe('1.5M')
  })
  it('handles undefined', () => {
    expect(formatTokens(undefined)).toBe('0')
  })
})

describe('formatCost', () => {
  it('formats zero', () => {
    expect(formatCost(0)).toBe('$0.00')
  })
  it('formats sub-dollar', () => {
    expect(formatCost(0.0123)).toBe('$0.012')
  })
  it('formats dollars', () => {
    expect(formatCost(2.5)).toBe('$2.50')
  })
})

describe('statusColor', () => {
  it('maps agent statuses', () => {
    expect(statusColor(theme, 'thinking')).toBe(theme.info)
    expect(statusColor(theme, 'executing')).toBe(theme.warning)
    expect(statusColor(theme, 'error')).toBe(theme.error)
    expect(statusColor(theme, 'waiting')).toBe(theme.textSecondary)
    expect(statusColor(theme, 'idle')).toBe(theme.textMuted)
    expect(statusColor(theme, undefined)).toBe(theme.textMuted)
  })
})

describe('buildStatusBarSegments', () => {
  const state: StatusBarState = {
    gitBranch: 'main',
    modelName: 'claude-opus-4',
    tokensUsed: 1234,
    tokenLimit: 200000,
    cost: 0.0123,
    agentStatus: 'executing',
    backgroundTasks: 2,
    contextUsed: 150000,
    contextLimit: 200000,
    mode: 'default',
  }

  it('always includes status and tokens (required)', () => {
    const segs = buildStatusBarSegments(state, theme)
    expect(segs[0].key).toBe('status')
    expect(segs[0].required).toBe(true)
    expect(segs[1].key).toBe('tokens')
    expect(segs[1].required).toBe(true)
  })

  it('includes all optional segments when present', () => {
    const keys = buildStatusBarSegments(state, theme).map((s) => s.key)
    expect(keys).toContain('model')
    expect(keys).toContain('cost')
    expect(keys).toContain('git')
    expect(keys).toContain('ctx')
    expect(keys).toContain('bg')
    expect(keys).toContain('mode')
  })

  it('shows context percentage and high-usage warning color', () => {
    const seg = buildStatusBarSegments(state, theme).find((s) => s.key === 'ctx')!
    expect(seg.value).toBe('75%')
    expect(seg.color).toBe(theme.warning)
  })

  it('omits segments with missing data', () => {
    const minimal = buildStatusBarSegments({ agentStatus: 'idle' }, theme)
    const keys = minimal.map((s) => s.key)
    expect(keys).toEqual(['status', 'tokens'])
  })
})

describe('selectVisibleSegments', () => {
  function seg(key: string, len: number, required = false): StatusSegment {
    return { key, label: '', value: 'x'.repeat(len), color: theme.textPrimary, required }
  }

  it('keeps required segments even when narrow', () => {
    const segs = [seg('a', 5, true), seg('b', 5, true), seg('c', 50)]
    const vis = selectVisibleSegments(segs, 20)
    expect(vis.map((s) => s.key)).toEqual(['a', 'b'])
  })

  it('drops optional segments that do not fit', () => {
    const segs = [seg('a', 5, true), seg('b', 30), seg('c', 30)]
    const vis = selectVisibleSegments(segs, 35)
    expect(vis.map((s) => s.key)).toEqual(['a'])
  })

  it('keeps optional segments that fit', () => {
    const segs = [seg('a', 5, true), seg('b', 10), seg('c', 10)]
    const vis = selectVisibleSegments(segs, 60)
    expect(vis.map((s) => s.key)).toEqual(['a', 'b', 'c'])
  })
})