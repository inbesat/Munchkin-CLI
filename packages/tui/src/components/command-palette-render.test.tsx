import { describe, expect, it } from 'bun:test'
import React from 'react'
import { render } from 'ink'
import { EventEmitter } from 'node:events'
import { CommandPalette } from './command-palette'

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

describe('CommandPalette (smoke)', () => {
  it('renders when open', () => {
    const { stdout, getOutput } = createMockStdout()
    const { unmount } = render(
      <CommandPalette
        themeColors={mockTheme}
        query="mo"
        isOpen={true}
        isActive={false}
        onSelect={() => {}}
        onClose={() => {}}
      />,
      { stdout }
    )
    const frame = getOutput()
    expect(frame).toContain('/mo')
    expect(frame).toContain('model')
    unmount()
  })

  it('does not render when closed', () => {
    const { stdout, getOutput } = createMockStdout()
    const { unmount } = render(
      <CommandPalette
        themeColors={mockTheme}
        query=""
        isOpen={false}
        onSelect={() => {}}
        onClose={() => {}}
      />,
      { stdout }
    )
    expect(getOutput()).not.toContain('model')
    unmount()
  })

  it('shows no-match message', () => {
    const { stdout, getOutput } = createMockStdout()
    const { unmount } = render(
      <CommandPalette
        themeColors={mockTheme}
        query="zzzzz"
        isOpen={true}
        isActive={false}
        onSelect={() => {}}
        onClose={() => {}}
      />,
      { stdout }
    )
    expect(getOutput()).toContain('No matching commands')
    unmount()
  })
})