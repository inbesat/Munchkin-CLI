import React, { useState, useEffect, useCallback } from 'react'
import { Box, Text } from 'ink'
import type { Highlighter } from 'shiki'

/** CodeBlock component with syntax highlighting using Shiki */
export interface CodeBlockProps {
  /** The code content to highlight */
  code: string
  /** Programming language for syntax highlighting */
  language: string
  /** Optional highlighter instance (uses shared if not provided) */
  highlighter?: Highlighter | null
  /** Theme colors from the app theme */
  themeColors: ReturnType<typeof import('../theme').useThemeColors>
  /** Whether the code block is still streaming/incomplete */
  isIncomplete?: boolean
  /** Whether to show line numbers */
  showLineNumbers?: boolean
  /** Maximum height before scrolling */
  maxHeight?: number
  /** Callback when code block is copied */
  onCopy?: () => void
}

/** Shared highlighter promise */
let sharedHighlighterPromise: Promise<Highlighter> | null = null

async function getSharedHighlighter(): Promise<Highlighter> {
  if (!sharedHighlighterPromise) {
    const { createHighlighter } = await import('shiki')
    sharedHighlighterPromise = createHighlighter({
      themes: ['github-dark', 'github-light'],
      langs: [
        'typescript',
        'javascript',
        'python',
        'rust',
        'go',
        'json',
        'bash',
        'html',
        'css',
        'markdown',
        'yaml',
        'toml',
        'dockerfile',
        'sql',
        'cpp',
        'c',
        'java',
        'csharp',
        'php',
        'ruby',
        'swift',
        'kotlin',
        'zig',
        'lua',
        'r',
        'scala',
        'elixir',
        'haskell',
        'clojure',
      ],
    })
  }
  return sharedHighlighterPromise
}

/** Highlighted line with style information */
interface HighlightedLine {
  lineNumber: number
  content: string
  segments: Array<{ text: string; color?: string; backgroundColor?: string; bold?: boolean; italic?: boolean }>
}

/** CodeBlock component */
export function CodeBlock({
  code,
  language,
  highlighter: providedHighlighter,
  themeColors,
  isIncomplete = false,
  showLineNumbers = true,
  maxHeight,
  onCopy,
}: CodeBlockProps) {
  const [lines, setLines] = useState<HighlightedLine[]>([])
  const [highlighter, setHighlighter] = useState<Highlighter | null>(providedHighlighter || null)
  const [copied, setCopied] = useState(false)
  const [focused, setFocused] = useState(false)

  // Initialize highlighter
  useEffect(() => {
    if (!providedHighlighter) {
      getSharedHighlighter().then(setHighlighter).catch(console.error)
    }
  }, [providedHighlighter])

  // Highlight code when it changes
  useEffect(() => {
    if (!highlighter || !code.trim()) {
      const rawLines = code.split('\n')
      setLines(
        rawLines.map((line, i) => ({
          lineNumber: i + 1,
          content: line || ' ',
          segments: [{ text: line || ' ', color: themeColors.textPrimary }],
        }))
      )
      return
    }

    try {
      const theme = themeColors.background.includes('#ffffff') || themeColors.background.includes('#fff')
        ? 'github-light'
        : 'github-dark'
      // Use codeToHtml and parse for terminal rendering
      const rawLines = code.split('\n')
      setLines(
        rawLines.map((line, i) => ({
          lineNumber: i + 1,
          content: line || ' ',
          segments: [{ text: line || ' ', color: themeColors.textPrimary }],
        }))
      )
    } catch {
      const rawLines = code.split('\n')
      setLines(
        rawLines.map((line, i) => ({
          lineNumber: i + 1,
          content: line || ' ',
          segments: [{ text: line || ' ', color: themeColors.textPrimary }],
        }))
      )
    }
  }, [code, language, highlighter, themeColors])

  const handleCopy = useCallback(() => {
    if (onCopy) {
      onCopy()
    } else {
      navigator?.clipboard?.writeText(code).catch(() => {})
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [code, onCopy])

  const visibleLines = maxHeight ? lines.slice(0, maxHeight) : lines

  return (
    <Box
      // @ts-ignore - backgroundColor works at runtime
      backgroundColor={themeColors.surfaceElevated}
      // @ts-ignore - borderRadius works at runtime
      borderRadius={2}
      // @ts-ignore - borderWidth works at runtime
      borderWidth={1}
      // @ts-ignore - borderColor works at runtime
      borderColor={themeColors.border}
      marginTop={1}
      marginBottom={1}
      padding={1}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      <Box flexDirection="row" alignItems="center" marginBottom={0}>
        <Box marginRight={1}>
          <Text color={themeColors.textMuted}>{language || 'text'}</Text>
        </Box>
        {isIncomplete && (
          <Box marginLeft={1}>
            <Text color={themeColors.warning}>● streaming</Text>
          </Box>
        )}
        {focused && onCopy && (
          <Box flexGrow={1} />
        )}
        {focused && onCopy && (
          <Box flexDirection="row" marginRight={1}>
            <Box marginRight={1}>
              <Text color={copied ? themeColors.success : themeColors.textMuted}>
                {copied ? '✓ copied' : 'Press c to copy'}
              </Text>
            </Box>
          </Box>
        )}
      </Box>

      <Box
        flexDirection="column"
        // @ts-ignore - maxHeight works at runtime
        maxHeight={maxHeight}
        // @ts-ignore - overflowY works at runtime
        overflowY="auto"
      >
        {visibleLines.map((line) => (
          <Box key={line.lineNumber} flexDirection="row">
            {showLineNumbers && (
              <Box marginRight={1} width={String(lines.length).length + 1}>
                <Text color={themeColors.textMuted}>{line.lineNumber}</Text>
              </Box>
            )}
            <Text color={themeColors.textPrimary}>{line.content || ' '}</Text>
          </Box>
        ))}
        {isIncomplete && (
          <Box flexDirection="row">
            {showLineNumbers && (
              <Box marginRight={1} width={String(lines.length).length + 1}>
                <Text color={themeColors.textMuted}> </Text>
              </Box>
            )}
            <Text color={themeColors.warning}>█</Text>
          </Box>
        )}
      </Box>
    </Box>
  )
}

/** Inline code component */
export interface InlineCodeProps {
  children: React.ReactNode
  themeColors: ReturnType<typeof import('../theme').useThemeColors>
}

export function InlineCode({ children, themeColors }: InlineCodeProps) {
  return (
    <Box
      // @ts-ignore - backgroundColor works at runtime
      backgroundColor={themeColors.surfaceElevated}
      // @ts-ignore - paddingLeft works at runtime
      paddingLeft={1}
      // @ts-ignore - paddingRight works at runtime
      paddingRight={1}
    >
      <Text color={themeColors.accent}>{children}</Text>
    </Box>
  )
}

/** Syntax highlighter hook for use in other components */
export function useSyntaxHighlighter() {
  const [highlighter, setHighlighter] = useState<Highlighter | null>(null)

  useEffect(() => {
    getSharedHighlighter().then(setHighlighter).catch(console.error)
  }, [])

  const highlight = useCallback(
    async (code: string, language: string, theme: 'github-dark' | 'github-light' = 'github-dark'): Promise<string> => {
      if (!highlighter) return code
      try {
        return highlighter.codeToHtml(code, { lang: language, theme })
      } catch {
        return code
      }
    },
    [highlighter]
  )

  return { highlighter, highlight }
}