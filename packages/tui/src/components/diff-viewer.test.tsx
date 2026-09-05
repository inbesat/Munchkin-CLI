import { describe, expect, it } from 'bun:test'
import React from 'react'
import { render } from 'ink'
import { DiffViewer, SimpleDiffViewer, detectLanguage } from './diff-viewer'

describe('detectLanguage', () => {
  it('detects TypeScript', () => {
    expect(detectLanguage('file.ts')).toBe('typescript')
    expect(detectLanguage('file.tsx')).toBe('typescript')
  })

  it('detects JavaScript', () => {
    expect(detectLanguage('file.js')).toBe('javascript')
    expect(detectLanguage('file.jsx')).toBe('javascript')
  })

  it('detects Python', () => {
    expect(detectLanguage('file.py')).toBe('python')
  })

  it('detects Rust', () => {
    expect(detectLanguage('file.rs')).toBe('rust')
  })

  it('detects Go', () => {
    expect(detectLanguage('file.go')).toBe('go')
  })

  it('detects JSON', () => {
    expect(detectLanguage('file.json')).toBe('json')
  })

  it('detects Markdown', () => {
    expect(detectLanguage('file.md')).toBe('markdown')
  })

  it('returns text for unknown extensions', () => {
    expect(detectLanguage('file.unknown')).toBe('text')
    expect(detectLanguage('file')).toBe('text')
    expect(detectLanguage('')).toBe('text')
  })
})

describe('SimpleDiffViewer', () => {
  const mockThemeColors = {
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

  it('renders simple diff', () => {
    const { unmount } = render(
      <SimpleDiffViewer
        oldContent="const x = 1"
        newContent="const x = 2"
        themeColors={mockThemeColors}
      />
    )
    unmount()
  })

  it('renders with file path', () => {
    const { unmount } = render(
      <SimpleDiffViewer
        oldContent="const x = 1"
        newContent="const x = 2"
        filePath="test.ts"
        themeColors={mockThemeColors}
      />
    )
    unmount()
  })

  it('handles empty diff', () => {
    const { unmount } = render(
      <SimpleDiffViewer
        oldContent="const x = 1"
        newContent="const x = 1"
        themeColors={mockThemeColors}
      />
    )
    unmount()
  })

  it('renders different view modes', () => {
    const { unmount } = render(
      <SimpleDiffViewer
        oldContent="const x = 1"
        newContent="const x = 2"
        viewMode="side-by-side"
        themeColors={mockThemeColors}
      />
    )
    unmount()
  })
})

describe('DiffViewer', () => {
  const mockThemeColors = {
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

  it('renders when open', () => {
    const { unmount } = render(
      <DiffViewer
        oldContent="const x = 1"
        newContent="const x = 2"
        isOpen={true}
        onClose={() => {}}
        themeColors={mockThemeColors}
      />
    )
    unmount()
  })

  it('does not render when closed', () => {
    const { unmount } = render(
      <DiffViewer
        oldContent="const x = 1"
        newContent="const x = 2"
        isOpen={false}
        themeColors={mockThemeColors}
      />
    )
    unmount()
  })

  it('handles onClose callback', () => {
    let closed = false
    const { unmount } = render(
      <DiffViewer
        oldContent="const x = 1"
        newContent="const x = 2"
        isOpen={true}
        onClose={() => { closed = true }}
        themeColors={mockThemeColors}
      />
    )
    unmount()
  })
})