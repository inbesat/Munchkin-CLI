import { describe, expect, it } from 'bun:test'
import React from 'react'
import { render } from 'ink'
import { EventEmitter } from 'node:events'
import { CheckpointTimeline, type Checkpoint } from './checkpoint-timeline'

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

const checkpoints: Checkpoint[] = [
  { id: 'a', label: 'started', timestamp: 1_700_000_000_000, messageIndex: 0, kind: 'system' },
  { id: 'b', label: 'edited app.ts', timestamp: 1_700_000_001_000, messageIndex: 1, kind: 'tool' },
  { id: 'c', label: 'reply', timestamp: 1_700_000_002_000, messageIndex: 2, kind: 'assistant' },
]

describe('CheckpointTimeline (smoke)', () => {
  it('renders checkpoints sorted by messageIndex', () => {
    const { stdout, getOutput } = createMockStdout()
    const { unmount } = render(
      <CheckpointTimeline themeColors={mockTheme} checkpoints={checkpoints} isOpen={true} isActive={false} onRewind={() => {}} />,
      { stdout }
    )
    const frame = getOutput()
    expect(frame).toContain('Checkpoints')
    expect(frame.indexOf('started')).toBeLessThan(frame.indexOf('edited app.ts'))
    expect(frame.indexOf('edited app.ts')).toBeLessThan(frame.indexOf('reply'))
    unmount()
  })

  it('does not render when closed', () => {
    const { stdout, getOutput } = createMockStdout()
    const { unmount } = render(
      <CheckpointTimeline themeColors={mockTheme} checkpoints={checkpoints} isOpen={false} onRewind={() => {}} />,
      { stdout }
    )
    expect(getOutput()).not.toContain('Checkpoints')
    unmount()
  })

  it('shows empty message when no checkpoints', () => {
    const { stdout, getOutput } = createMockStdout()
    const { unmount } = render(
      <CheckpointTimeline themeColors={mockTheme} checkpoints={[]} isOpen={true} isActive={false} onRewind={() => {}} />,
      { stdout }
    )
    expect(getOutput()).toContain('No checkpoints yet.')
    unmount()
  })

  it('renders key hints footer', () => {
    const { stdout, getOutput } = createMockStdout()
    const { unmount } = render(
      <CheckpointTimeline
        themeColors={mockTheme}
        checkpoints={checkpoints}
        cursorId="b"
        isOpen={true}
        isActive={false}
        onRewind={() => {}}
      />,
      { stdout }
    )
    const frame = getOutput()
    expect(frame).toContain('move')
    expect(frame).toContain('rewind')
    expect(frame).toContain('close')
    unmount()
  })
})
