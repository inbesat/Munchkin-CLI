import { describe, expect, it } from 'bun:test'
import { EventEmitter } from 'node:events'
import { render } from 'ink'
import { StatusBar, type StatusBarState } from './status-bar'

const mockTheme = {
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

describe('StatusBar (smoke)', () => {
  it('renders all segments at full width', () => {
    const { stdout, getOutput } = createMockStdout()
    const { unmount } = render(<StatusBar themeColors={mockTheme} state={state} />, { stdout })
    const frame = getOutput()
    expect(frame).toContain('executing')
    expect(frame).toContain('claude-opus-4')
    expect(frame).toContain('$0.012')
    expect(frame).toContain('main')
    expect(frame).toContain('75%')
    expect(frame).toContain('2')
    unmount()
  })

  it('drops optional segments when narrow', () => {
    const { stdout, getOutput } = createMockStdout()
    const { unmount } = render(<StatusBar themeColors={mockTheme} state={state} width={30} />, {
      stdout,
    })
    const frame = getOutput()
    expect(frame).toContain('executing')
    expect(frame).toContain('1.2k')
    expect(frame).not.toContain('claude-opus-4')
    unmount()
  })

  it('renders idle status', () => {
    const { stdout, getOutput } = createMockStdout()
    const { unmount } = render(
      <StatusBar themeColors={mockTheme} state={{ agentStatus: 'idle' }} />,
      { stdout },
    )
    expect(getOutput()).toContain('idle')
    unmount()
  })
})
