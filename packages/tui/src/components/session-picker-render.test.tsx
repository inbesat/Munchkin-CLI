import { describe, expect, it } from 'bun:test'
import { EventEmitter } from 'node:events'
import { render } from 'ink'
import { SessionPicker, type SessionSummary } from './session-picker'

const mockTheme = {
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
}

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
}

function createMockStdout() {
  let out = ''
  const stdout = new EventEmitter() as unknown as NodeJS.WriteStream
  ;(stdout as unknown as { write: (c: string) => boolean }).write = (chunk: string) => {
    out += chunk
    return true
  }
  ;(stdout as unknown as { columns: number }).columns = 80
  ;(stdout as unknown as { rows: number }).rows = 24
  ;(stdout as unknown as { isTTY: boolean }).isTTY = true
  return { stdout: stdout as unknown as NodeJS.WriteStream, getOutput: () => stripAnsi(out) }
}

const sessions: SessionSummary[] = [
  {
    id: 'a',
    title: 'Refactor auth',
    preview: 'moved login logic',
    model: 'claude-opus',
    cost: 0.01,
    createdAt: 1_700_000_000_000,
  },
  {
    id: 'b',
    title: 'Fix bug',
    preview: 'null pointer',
    model: 'gpt-4',
    cost: 0.02,
    createdAt: 1_700_000_100_000,
  },
  {
    id: 'c',
    title: 'Write docs',
    preview: 'updated README',
    model: 'claude-opus',
    cost: 0.0,
    createdAt: 1_700_000_200_000,
  },
]

describe('SessionPicker (smoke)', () => {
  it('renders sessions with metadata', () => {
    const { stdout, getOutput } = createMockStdout()
    const { unmount } = render(
      <SessionPicker
        themeColors={mockTheme}
        sessions={sessions}
        isOpen={true}
        isActive={false}
        onResume={() => {}}
      />,
      { stdout },
    )
    const frame = getOutput()
    expect(frame).toContain('Sessions')
    expect(frame).toContain('Refactor auth')
    expect(frame).toContain('claude-opus')
    expect(frame).toContain('$0.010')
    unmount()
  })

  it('does not render when closed', () => {
    const { stdout, getOutput } = createMockStdout()
    const { unmount } = render(
      <SessionPicker
        themeColors={mockTheme}
        sessions={sessions}
        isOpen={false}
        onResume={() => {}}
      />,
      { stdout },
    )
    expect(getOutput()).not.toContain('Sessions')
    unmount()
  })

  it('filters via controlled query', () => {
    const { stdout, getOutput } = createMockStdout()
    const { unmount } = render(
      <SessionPicker
        themeColors={mockTheme}
        sessions={sessions}
        isOpen={true}
        isActive={false}
        query="docs"
        onResume={() => {}}
      />,
      { stdout },
    )
    const frame = getOutput()
    expect(frame).toContain('Write docs')
    expect(frame).not.toContain('Refactor auth')
    unmount()
  })

  it('shows empty message when no match', () => {
    const { stdout, getOutput } = createMockStdout()
    const { unmount } = render(
      <SessionPicker
        themeColors={mockTheme}
        sessions={sessions}
        isOpen={true}
        isActive={false}
        query="zzz"
        onResume={() => {}}
      />,
      { stdout },
    )
    expect(getOutput()).toContain('No sessions match.')
    unmount()
  })
})
