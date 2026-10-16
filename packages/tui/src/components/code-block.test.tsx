import { describe, it } from 'bun:test'
import { render } from 'ink'
import { CodeBlock, InlineCode } from './code-block'

describe('CodeBlock', () => {
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

  it('renders code block with language', () => {
    const { unmount } = render(
      <CodeBlock code="const x = 1" language="typescript" themeColors={mockThemeColors} />,
    )
    unmount()
  })

  it('renders code block without language', () => {
    const { unmount } = render(
      <CodeBlock code="plain text" language="text" themeColors={mockThemeColors} />,
    )
    unmount()
  })

  it('renders incomplete code block', () => {
    const { unmount } = render(
      <CodeBlock
        code="const x = 1"
        language="typescript"
        themeColors={mockThemeColors}
        isIncomplete={true}
      />,
    )
    unmount()
  })

  it('renders with line numbers disabled', () => {
    const { unmount } = render(
      <CodeBlock
        code="line 1\nline 2"
        language="typescript"
        themeColors={mockThemeColors}
        showLineNumbers={false}
      />,
    )
    unmount()
  })

  it('handles empty code', () => {
    const { unmount } = render(
      <CodeBlock code="" language="typescript" themeColors={mockThemeColors} />,
    )
    unmount()
  })

  it('handles multiline code', () => {
    const { unmount } = render(
      <CodeBlock
        code="function test() {\n  return 42\n}"
        language="typescript"
        themeColors={mockThemeColors}
      />,
    )
    unmount()
  })
})

describe('InlineCode', () => {
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

  it('renders inline code', () => {
    const { unmount } = render(<InlineCode themeColors={mockThemeColors}>console.log</InlineCode>)
    unmount()
  })
})
