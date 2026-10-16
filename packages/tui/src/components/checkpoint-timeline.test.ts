import { describe, expect, it } from 'bun:test'
import {
  type Checkpoint,
  type CheckpointKind,
  formatCheckpointTime,
  kindColor,
  kindGlyph,
  moveCursor,
} from './checkpoint-timeline'

const theme = {
  background: '#0d1117',
  surface: '#161b22',
  surfaceElevated: '#21262d',
  border: '#30363d',
  borderFocus: '#58a6ff',
  textPrimary: '#e6edf3',
  textSecondary: '#8b949e',
  textMuted: '#6e7681',
  textInverse: '#0d1117',
  primary: '#58a6ff',
  primaryHover: '#79b8ff',
  secondary: '#8b949e',
  accent: '#f78166',
  success: '#3fb950',
  warning: '#d29922',
  error: '#f85149',
  info: '#58a6ff',
  codeBackground: '#161b22',
  codeForeground: '#e6edf3',
  keyword: '#ff7b72',
  string: '#a5d6ff',
  number: '#79b8ff',
  comment: '#8b949e',
  function: '#d2a8ff',
  variable: '#ffa657',
  type: '#ff7b72',
  selection: '#264f78',
  cursor: '#58a6ff',
  scrollbar: '#21262d',
  scrollbarHover: '#30363d',
} as unknown as import('../theme').ThemeColors

function cp(id: string, messageIndex: number, kind: CheckpointKind = 'tool'): Checkpoint {
  return {
    id,
    label: `step-${id}`,
    timestamp: 1_700_000_000_000 + messageIndex * 1000,
    messageIndex,
    kind,
  }
}

describe('formatCheckpointTime', () => {
  it('formats HH:MM:SS', () => {
    const d = new Date(2026, 0, 1, 9, 5, 3)
    expect(formatCheckpointTime(d.getTime())).toBe('09:05:03')
  })
})

describe('kind glyphs and colors', () => {
  it('maps kinds to glyphs', () => {
    expect(kindGlyph('user')).toBe('▸')
    expect(kindGlyph('tool')).toBe('⚙')
    expect(kindGlyph('assistant')).toBe('◈')
    expect(kindGlyph('manual')).toBe('✱')
    expect(kindGlyph('system')).toBe('•')
  })
  it('maps kinds to colors', () => {
    expect(kindColor(theme, 'user')).toBe(theme.primary)
    expect(kindColor(theme, 'tool')).toBe(theme.accent)
    expect(kindColor(theme, 'assistant')).toBe(theme.success)
    expect(kindColor(theme, 'manual')).toBe(theme.warning)
    expect(kindColor(theme, 'system')).toBe(theme.textMuted)
  })
})

describe('moveCursor', () => {
  const list = [cp('a', 0), cp('b', 1), cp('c', 2)]

  it('returns first when no cursor and dir forward', () => {
    expect(moveCursor(list, undefined, 1)).toBe('a')
  })
  it('returns last when no cursor and dir back', () => {
    expect(moveCursor(list, undefined, -1)).toBe('c')
  })
  it('moves forward', () => {
    expect(moveCursor(list, 'a', 1)).toBe('b')
  })
  it('moves back', () => {
    expect(moveCursor(list, 'b', -1)).toBe('a')
  })
  it('clamps at start', () => {
    expect(moveCursor(list, 'a', -1)).toBe('a')
  })
  it('clamps at end', () => {
    expect(moveCursor(list, 'c', 1)).toBe('c')
  })
  it('returns undefined for empty list', () => {
    expect(moveCursor([], 'a', 1)).toBeUndefined()
  })
})
