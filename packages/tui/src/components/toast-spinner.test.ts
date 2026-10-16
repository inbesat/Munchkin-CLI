import { describe, expect, it } from 'bun:test'
import { clampRatio, renderIndeterminate, renderProgressBar, spinnerFrame } from './spinner'
import { type ToastKind, toastColor, toastLabel } from './toast'

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

describe('toast helpers', () => {
  it('maps toast kinds to colors', () => {
    const kinds: ToastKind[] = ['success', 'error', 'warning', 'info']
    expect(toastColor(theme, 'success')).toBe(theme.success)
    expect(toastColor(theme, 'error')).toBe(theme.error)
    expect(toastColor(theme, 'warning')).toBe(theme.warning)
    expect(toastColor(theme, 'info')).toBe(theme.info)
  })
  it('returns labels', () => {
    expect(toastLabel('success')).toBe('✓')
    expect(toastLabel('error')).toBe('✗')
    expect(toastLabel('warning')).toBe('!')
    expect(toastLabel('info')).toBe('i')
  })
})

describe('spinner helpers', () => {
  const frames = ['a', 'b', 'c']

  it('cycles through frames', () => {
    expect(spinnerFrame(0, frames)).toBe('a')
    expect(spinnerFrame(1, frames)).toBe('b')
    expect(spinnerFrame(2, frames)).toBe('c')
    expect(spinnerFrame(3, frames)).toBe('a')
    expect(spinnerFrame(-1, frames)).toBe('c')
  })

  it('handles empty frames', () => {
    expect(spinnerFrame(0, [])).toBe('')
  })
})

describe('progress bar', () => {
  it('clamps ratio', () => {
    expect(clampRatio(-1)).toBe(0)
    expect(clampRatio(2)).toBe(1)
    expect(clampRatio(Number.NaN)).toBe(0)
    expect(clampRatio(0.5)).toBe(0.5)
  })

  it('renders empty at 0', () => {
    expect(renderProgressBar(0, 4)).toBe('░░░░')
  })

  it('renders full at 1', () => {
    expect(renderProgressBar(1, 4)).toBe('████')
  })

  it('renders partial', () => {
    expect(renderProgressBar(0.5, 4)).toBe('██░░')
  })

  it('renders indeterminate and moves', () => {
    const a = renderIndeterminate(0, 6, 2)
    const b = renderIndeterminate(1, 6, 2)
    expect(a.length).toBe(6)
    expect(a).not.toBe(b)
  })
})
