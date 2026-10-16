import { describe, expect, it } from 'bun:test'
import { EventEmitter } from 'node:events'
import { render } from 'ink'
import { ProgressBar, Spinner } from './spinner'
import { Toast, ToastContainer, type Toast as ToastType } from './toast'

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

describe('toast/spinner (smoke)', () => {
  it('renders a toast with kind symbol and message', () => {
    const { stdout, getOutput } = createMockStdout()
    const { unmount } = render(
      <Toast themeColors={mockTheme} toast={{ id: '1', kind: 'success', message: 'Saved!' }} />,
      { stdout },
    )
    const frame = getOutput()
    expect(frame).toContain('Saved!')
    expect(frame).toContain('✓')
    unmount()
  })

  it('renders multiple toasts in a container', () => {
    const toasts: ToastType[] = [
      { id: 'a', kind: 'info', message: 'one' },
      { id: 'b', kind: 'error', message: 'two' },
    ]
    const { stdout, getOutput } = createMockStdout()
    const { unmount } = render(
      <ToastContainer themeColors={mockTheme} toasts={toasts} onDismiss={() => {}} />,
      { stdout },
    )
    const frame = getOutput()
    expect(frame).toContain('one')
    expect(frame).toContain('two')
    unmount()
  })

  it('auto-dismisses after duration', async () => {
    const dismissed: string[] = []
    const toasts: ToastType[] = [{ id: 'x', kind: 'info', message: 'bye', duration: 50 }]
    const { stdout, getOutput } = createMockStdout()
    const { unmount } = render(
      <ToastContainer
        themeColors={mockTheme}
        toasts={toasts}
        onDismiss={(id) => dismissed.push(id)}
        autoDismissMs={50}
      />,
      { stdout },
    )
    expect(getOutput()).toContain('bye')
    await new Promise((r) => setTimeout(r, 150))
    expect(dismissed).toContain('x')
    unmount()
  })

  it('renders spinner frame (inactive)', () => {
    const { stdout, getOutput } = createMockStdout()
    const { unmount } = render(<Spinner themeColors={mockTheme} label="Working" active={false} />, {
      stdout,
    })
    const frame = getOutput()
    expect(frame).toContain('Working')
    expect(frame.length).toBeGreaterThan(0)
    unmount()
  })

  it('renders progress bar', () => {
    const { stdout, getOutput } = createMockStdout()
    const { unmount } = render(
      <ProgressBar themeColors={mockTheme} ratio={0.5} width={10} label="Loading" />,
      { stdout },
    )
    const frame = getOutput()
    expect(frame).toContain('Loading')
    expect(frame).toContain('50%')
    unmount()
  })
})
