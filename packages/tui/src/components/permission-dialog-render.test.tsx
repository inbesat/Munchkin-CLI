import { describe, expect, it } from 'bun:test'
import React from 'react'
import { render } from 'ink'
import { EventEmitter } from 'node:events'
import { PermissionDialog, type PermissionRequest } from './permission-dialog'

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

const req: PermissionRequest = {
  id: 'req-9',
  tool: { name: 'bash', description: 'Run a shell command' },
  args: { command: 'rm -rf build' },
  category: 'destructive',
  sessionId: 's1',
  permissionMode: 'default',
  riskLevel: 'high',
  riskReason: 'recursive delete',
}

describe('PermissionDialog (smoke)', () => {
  it('renders when open', () => {
    const { stdout, getOutput } = createMockStdout()
    const { unmount } = render(
      <PermissionDialog
        themeColors={mockTheme}
        request={req}
        isOpen={true}
        isActive={false}
        onResolve={() => {}}
      />,
      { stdout }
    )
    const frame = getOutput()
    expect(frame).toContain('Permission required')
    expect(frame).toContain('bash')
    expect(frame).toContain('Run shell command: rm -rf build')
    expect(frame).toContain('HIGH')
    expect(frame).toContain('Allow (once)')
    expect(frame).toContain('Deny')
    unmount()
  })

  it('does not render when closed', () => {
    const { stdout, getOutput } = createMockStdout()
    const { unmount } = render(
      <PermissionDialog
        themeColors={mockTheme}
        request={req}
        isOpen={false}
        onResolve={() => {}}
      />,
      { stdout }
    )
    expect(getOutput()).not.toContain('Permission required')
    unmount()
  })

  it('omits remember options when allowRemember is false', () => {
    const { stdout, getOutput } = createMockStdout()
    const { unmount } = render(
      <PermissionDialog
        themeColors={mockTheme}
        request={req}
        isOpen={true}
        isActive={false}
        allowRemember={false}
        onResolve={() => {}}
      />,
      { stdout }
    )
    const frame = getOutput()
    expect(frame).toContain('Allow (once)')
    expect(frame).not.toContain('Allow for this session')
    expect(frame).not.toContain('Allow always')
    unmount()
  })

  it('renders arguments list', () => {
    const { stdout, getOutput } = createMockStdout()
    const { unmount } = render(
      <PermissionDialog
        themeColors={mockTheme}
        request={req}
        isOpen={true}
        isActive={false}
        onResolve={() => {}}
      />,
      { stdout }
    )
    expect(getOutput()).toContain('Arguments:')
    expect(getOutput()).toContain('command:')
    unmount()
  })
})