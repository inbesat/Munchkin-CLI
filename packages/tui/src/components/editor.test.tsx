import { describe, expect, it } from 'bun:test'
import { EventEmitter } from 'node:events'
import { render } from 'ink'
import { Editor } from './editor'
import { EditorHistory } from './editor-history'

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
  const stdout = new EventEmitter() as unknown as NodeJS.WriteStream & EventEmitter
  ;(stdout as unknown as { write: (c: string) => boolean }).write = (chunk: string) => {
    out += chunk
    return true
  }
  ;(stdout as unknown as { columns: number }).columns = 80
  ;(stdout as unknown as { rows: number }).rows = 24
  ;(stdout as unknown as { isTTY: boolean }).isTTY = true
  return { stdout: stdout as unknown as NodeJS.WriteStream, getOutput: () => stripAnsi(out) }
}

describe('Editor (smoke)', () => {
  it('renders placeholder when empty', () => {
    const { stdout, getOutput } = createMockStdout()
    const { unmount } = render(
      <Editor themeColors={mockTheme} onSubmit={() => {}} isActive={false} />,
      { stdout },
    )
    expect(getOutput()).toContain('Type a message')
    unmount()
  })

  it('renders initial value content', () => {
    const { stdout, getOutput } = createMockStdout()
    const { unmount } = render(
      <Editor
        themeColors={mockTheme}
        initialValue={'hello world'}
        onSubmit={() => {}}
        isActive={false}
      />,
      { stdout },
    )
    expect(getOutput()).toContain('hello world')
    unmount()
  })

  it('renders bash mode label', () => {
    const { stdout, getOutput } = createMockStdout()
    const { unmount } = render(
      <Editor themeColors={mockTheme} initialMode="bash" onSubmit={() => {}} isActive={false} />,
      { stdout },
    )
    expect(getOutput()).toContain('BASH')
    unmount()
  })

  it('renders multiline initial content', () => {
    const { stdout, getOutput } = createMockStdout()
    const { unmount } = render(
      <Editor
        themeColors={mockTheme}
        initialValue={'line1\nline2\nline3'}
        onSubmit={() => {}}
        isActive={false}
      />,
      { stdout },
    )
    const frame = getOutput()
    expect(frame).toContain('line1')
    expect(frame).toContain('line2')
    expect(frame).toContain('line3')
    unmount()
  })

  it('accepts a history instance without crashing', () => {
    const history = new EditorHistory()
    history.add('previous command')
    const { stdout, getOutput } = createMockStdout()
    const { unmount } = render(
      <Editor themeColors={mockTheme} history={history} onSubmit={() => {}} isActive={false} />,
      { stdout },
    )
    expect(getOutput()).toContain('Type a message')
    unmount()
  })

  it('hides mode bar when disabled', () => {
    const { stdout, getOutput } = createMockStdout()
    const { unmount } = render(
      <Editor themeColors={mockTheme} showModeBar={false} onSubmit={() => {}} isActive={false} />,
      { stdout },
    )
    expect(getOutput()).not.toContain('Ctrl+B')
    unmount()
  })
})
