import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Box, Text, useInput } from 'ink'
import { useThemeColors } from '../theme'
import { computeDiff, DiffResultStructured, DiffHunk, DiffLine, formatUnifiedDiff, formatSideBySideDiff, formatInlineDiff, ComputeDiffOptions } from '../../../core/dist/diff'
import type { Highlighter } from 'shiki'

/** View mode for diff display */
export type DiffViewMode = 'unified' | 'side-by-side' | 'inline'

/** Action callbacks for diff viewer */
export interface DiffViewerActions {
  /** Called when user accepts a change */
  onAccept?: (hunkIndex: number, lineIndex: number) => void
  /** Called when user rejects a change */
  onReject?: (hunkIndex: number, lineIndex: number) => void
  /** Called when user accepts all changes */
  onAcceptAll?: () => void
  /** Called when user rejects all changes */
  onRejectAll?: () => void
  /** Called when viewer is closed */
  onClose?: () => void
}

/** Props for DiffViewer component */
export interface DiffViewerProps {
  /** Old file content */
  oldContent: string
  /** New file content */
  newContent: string
  /** File path (for language detection) */
  filePath?: string
  /** Diff computation options */
  computeOptions?: ComputeDiffOptions
  /** Initial view mode */
  viewMode?: DiffViewMode
  /** Action callbacks */
  actions?: DiffViewerActions
  /** Whether viewer is open */
  isOpen: boolean
  /** Called when viewer should close */
  onClose?: () => void
}

/** Shared highlighter promise */
let sharedHighlighterPromise: Promise<Highlighter> | null = null

async function getSharedHighlighter(): Promise<Highlighter> {
  if (!sharedHighlighterPromise) {
    const { createHighlighter } = await import('shiki')
    sharedHighlighterPromise = createHighlighter({
      themes: ['github-dark', 'github-light'],
      langs: [
        'typescript', 'javascript', 'python', 'rust', 'go', 'java', 'cpp', 'c',
        'json', 'yaml', 'markdown', 'html', 'css', 'bash', 'shell', 'sql', 'toml', 'xml'
      ],
    })
  }
  return sharedHighlighterPromise
}

/** Highlighted line with segments */
interface HighlightedLine {
  lineNumber: number
  oldLineNumber?: number
  newLineNumber?: number
  type: 'context' | 'add' | 'remove'
  segments: Array<{ text: string; color?: string; backgroundColor?: string; bold?: boolean; italic?: boolean }>
}

/** Detect language from file extension */
export function detectLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase()
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    py: 'python', rs: 'rust', go: 'go', java: 'java', cpp: 'cpp', cc: 'cpp', cxx: 'cpp',
    c: 'c', h: 'c', hpp: 'cpp', json: 'json', yml: 'yaml', yaml: 'yaml',
    md: 'markdown', html: 'html', htm: 'html', css: 'css', scss: 'scss',
    sh: 'bash', bash: 'bash', sql: 'sql', toml: 'toml', xml: 'xml',
  }
  return ext ? map[ext] ?? 'text' : 'text'
}

/** DiffViewer component */
export function DiffViewer({
  oldContent,
  newContent,
  filePath,
  computeOptions = {},
  viewMode: initialViewMode = 'unified',
  actions,
  isOpen,
  onClose,
}: DiffViewerProps) {
  const colors = useThemeColors()
  const [viewMode, setViewMode] = useState<DiffViewMode>(initialViewMode)
  const [selectedHunk, setSelectedHunk] = useState(0)
  const [selectedLine, setSelectedLine] = useState(0)
  const [highlighter, setHighlighter] = useState<Highlighter | null>(null)
  const [highlightedLines, setHighlightedLines] = useState<HighlightedLine[]>([])
  const [diffResult, setDiffResult] = useState<DiffResultStructured | null>(null)
  const containerRef = useRef<any>(null)

  // Initialize highlighter
  useEffect(() => {
    getSharedHighlighter().then(setHighlighter).catch(console.error)
  }, [])

  // Compute diff when content changes
  useEffect(() => {
    try {
      const diff = computeDiff(oldContent, newContent, computeOptions)
      setDiffResult(diff)
      setSelectedHunk(0)
      setSelectedLine(0)
    } catch (error) {
      console.error('Diff computation failed:', error)
    }
  }, [oldContent, newContent, computeOptions])

  // Highlight lines when diff result or highlighter changes
  useEffect(() => {
    if (!diffResult || !highlighter) return

    try {
      const theme = colors.background.includes('#ffffff') || colors.background.includes('#fff')
        ? 'github-light'
        : 'github-dark'
      const language = filePath ? detectLanguage(filePath) : 'text'

      const lines: HighlightedLine[] = []
      let globalLineIndex = 0

      for (let hunkIndex = 0; hunkIndex < diffResult.hunks.length; hunkIndex++) {
        const hunk = diffResult.hunks[hunkIndex]

        // Add hunk header for side-by-side
        if (viewMode === 'side-by-side') {
          lines.push({
            lineNumber: globalLineIndex++,
            type: 'context',
            segments: [{ text: `--- Old (lines ${hunk.oldStart}-${hunk.oldStart + hunk.oldLines - 1}) --- New (lines ${hunk.newStart}-${hunk.newStart + hunk.newLines - 1}) ---`, color: colors.textMuted, bold: true }],
          })
        }

        for (let lineIndex = 0; lineIndex < hunk.lines.length; lineIndex++) {
          const line = hunk.lines[lineIndex]
          const segments = highlightLine(line, language, theme, colors, viewMode, highlighter)
          lines.push({
            lineNumber: globalLineIndex++,
            oldLineNumber: line.oldLineNumber,
            newLineNumber: line.newLineNumber,
            type: line.type,
            segments,
          })
        }
      }

      setHighlightedLines(lines)
    } catch (error) {
      console.error('Highlighting failed:', error)
    }
  }, [diffResult, highlighter, viewMode, colors, filePath])

  // Keyboard navigation
  const handleKey = useCallback((key: string) => {
    if (!isOpen) return

    const maxLines = highlightedLines.length - 1

    switch (key) {
      case 'j':
      case 'down':
        setSelectedLine((prev) => Math.min(prev + 1, maxLines))
        break
      case 'k':
      case 'up':
        setSelectedLine((prev) => Math.max(prev - 1, 0))
        break
      case 'J':
        setSelectedLine((prev) => Math.min(prev + 10, maxLines))
        break
      case 'K':
        setSelectedLine((prev) => Math.max(prev - 10, 0))
        break
      case 'g':
        setSelectedLine(0)
        break
      case 'G':
        setSelectedLine(maxLines)
        break
      case 'h':
      case 'left':
        setSelectedHunk((prev) => Math.max(prev - 1, 0))
        break
      case 'l':
      case 'right':
        if (diffResult) {
          setSelectedHunk((prev) => Math.min(prev + 1, diffResult.hunks.length - 1))
        }
        break
      case 'a':
        if (actions?.onAccept && diffResult) {
          const line = highlightedLines[selectedLine]
          if (line && (line.type === 'add' || line.type === 'remove')) {
            actions.onAccept(selectedHunk, selectedLine)
          }
        }
        break
      case 'r':
        if (actions?.onReject && diffResult) {
          const line = highlightedLines[selectedLine]
          if (line && (line.type === 'add' || line.type === 'remove')) {
            actions.onReject(selectedHunk, selectedLine)
          }
        }
        break
      case 'A':
        if (actions?.onAcceptAll) {
          actions.onAcceptAll()
        }
        break
      case 'R':
        if (actions?.onRejectAll) {
          actions.onRejectAll()
        }
        break
      case 't':
        setViewMode((prev) => {
          const modes: DiffViewMode[] = ['unified', 'side-by-side', 'inline']
          const idx = modes.indexOf(prev)
          return modes[(idx + 1) % modes.length]
        })
        break
      case 'q':
      case 'escape':
        onClose?.()
        actions?.onClose?.()
        break
    }
  }, [isOpen, highlightedLines, diffResult, selectedHunk, selectedLine, viewMode, colors, actions, onClose])

  useInput(handleKey)

  if (!isOpen) return null

  const totalChanges = diffResult?.hunks.reduce((sum: number, h: DiffHunk) => sum + h.lines.filter((l: DiffLine) => l.type !== 'context').length, 0) ?? 0
  const additions = diffResult?.hunks.reduce((sum: number, h: DiffHunk) => sum + h.lines.filter((l: DiffLine) => l.type === 'add').length, 0) ?? 0
  const deletions = diffResult?.hunks.reduce((sum: number, h: DiffHunk) => sum + h.lines.filter((l: DiffLine) => l.type === 'remove').length, 0) ?? 0

  return (
    <Box
      // @ts-ignore - position works at runtime
      position="absolute"
      // @ts-ignore - top works at runtime
      top={0}
      // @ts-ignore - left works at runtime
      left={0}
      // @ts-ignore - right works at runtime
      right={0}
      // @ts-ignore - bottom works at runtime
      bottom={0}
      // @ts-ignore - backgroundColor works at runtime
      backgroundColor={colors.background + 'ee'}
      // @ts-ignore - zIndex works at runtime
      zIndex={100}
      // @ts-ignore - overflowY works at runtime
      overflowY="auto"
      padding={1}
    >
      <Box
        // @ts-ignore - backgroundColor works at runtime
        backgroundColor={colors.surfaceElevated}
        // @ts-ignore - borderRadius works at runtime
        borderRadius={2}
        // @ts-ignore - marginTop works at runtime
        marginTop={2}
        // @ts-ignore - marginLeft works at runtime
        marginLeft={2}
        // @ts-ignore - marginRight works at runtime
        marginRight={2}
        // @ts-ignore - maxHeight works at runtime
        maxHeight="90%"
        // @ts-ignore - overflowY works at runtime
        overflowY="auto"
        ref={containerRef}
      >
        {/* Header */}
        <Box flexDirection="row" padding={1} borderBottom borderBottomColor={colors.border}>
          <Text color={colors.primary} bold>DIFF VIEWER</Text>
          <Box flexGrow={1} />
          {filePath && <Box marginRight={2}><Text color={colors.textMuted}>{filePath}</Text></Box>}
          <Box flexDirection="row" marginRight={2}>
            <Box marginRight={1}><Text color={viewMode === 'unified' ? colors.primary : colors.textMuted}>[u] unified</Text></Box>
            <Box marginRight={1}><Text color={viewMode === 'side-by-side' ? colors.primary : colors.textMuted}>[s] side-by-side</Text></Box>
            <Text color={viewMode === 'inline' ? colors.primary : colors.textMuted}>[i] inline</Text>
          </Box>
          <Box marginRight={1}><Text color={colors.success}>+{additions}</Text></Box>
          <Box marginRight={2}><Text color={colors.error}>-{deletions}</Text></Box>
          <Text color={colors.textMuted}>hunk {selectedHunk + 1}/{diffResult?.hunks.length || 0}</Text>
        </Box>

        {/* Legend */}
        <Box flexDirection="row" paddingLeft={1} paddingRight={1} paddingTop={0} paddingBottom={0} marginBottom={1}>
          <Box flexDirection="row" marginRight={2}>
            <Box>
              {/* @ts-ignore - paddingLeft/Right works at runtime */}
              <Text color={colors.success} backgroundColor={colors.surface} paddingLeft={1} paddingRight={1}>+ added</Text>
            </Box>
          </Box>
          <Box flexDirection="row" marginRight={2}>
            <Box>
              {/* @ts-ignore - paddingLeft/Right works at runtime */}
              <Text color={colors.error} backgroundColor={colors.surface} paddingLeft={1} paddingRight={1}>- removed</Text>
            </Box>
          </Box>
          <Box flexDirection="row" marginRight={2}>
            <Box>
              {/* @ts-ignore - paddingLeft/Right works at runtime */}
              <Text color={colors.textMuted} backgroundColor={colors.surface} paddingLeft={1} paddingRight={1}>  context</Text>
            </Box>
          </Box>
          <Box flexGrow={1} />
          <Text color={colors.textMuted}>j/k: scroll  h/l: hunk  a/r: accept/reject  A/R: all  t: toggle  q/esc: close</Text>
        </Box>

        {/* Diff content */}
        <Box flexDirection="column">
          {highlightedLines.map((line, index) => {
            const isSelected = index === selectedLine

            const lineStyle = isSelected
              ? { backgroundColor: colors.selection }
              : {}

            return (
              <Box key={index} flexDirection="row" {...lineStyle}>
                {/* Line numbers */}
                <Box width={8} flexDirection="row">
                  <Box width={4}>
                    <Text color={colors.textMuted}>
                      {line.oldLineNumber ? line.oldLineNumber.toString().padStart(4) : '    '}
                    </Text>
                  </Box>
                  <Box width={4}>
                    <Text color={colors.textMuted}>
                      {line.newLineNumber ? line.newLineNumber.toString().padStart(4) : '    '}
                    </Text>
                  </Box>
                </Box>

                {/* Line content */}
                <Box flexGrow={1} flexDirection="row">
                  {line.segments.map((segment, segIndex) => (
                    <Text
                      key={segIndex}
                      color={segment.color}
                      backgroundColor={segment.backgroundColor}
                      bold={segment.bold}
                      italic={segment.italic}
                    >
                      {segment.text}
                    </Text>
                  ))}
                </Box>

                {/* Action indicators for selected line */}
                {isSelected && (line.type === 'add' || line.type === 'remove') && (
                  <Box marginLeft={2} flexDirection="row">
                    <Box marginRight={1}><Text color={colors.success}>[a] accept</Text></Box>
                    <Text color={colors.error}>[r] reject</Text>
                  </Box>
                )}
              </Box>
            )
          })}
          {highlightedLines.length === 0 && (
            <Box padding={2} flexDirection="column" alignItems="center">
              <Text color={colors.textMuted}>No differences found</Text>
            </Box>
          )}
        </Box>

        {/* Footer */}
        <Box flexDirection="row" padding={1} borderTop borderTopColor={colors.border} marginTop={1}>
          <Text color={colors.textMuted}>
            {filePath ? `Language: ${detectLanguage(filePath || '')}` : 'No file'}
          </Text>
          <Box flexGrow={1} />
          <Text color={colors.textMuted}>
            {highlightedLines.length} lines  •  {diffResult?.hunks.length || 0} hunks
          </Text>
        </Box>
      </Box>
    </Box>
  )
}

/** Highlight a single diff line */
function highlightLine(
  line: DiffLine,
  language: string,
  theme: string,
  colors: ReturnType<typeof useThemeColors>,
  viewMode: DiffViewMode,
  highlighter: Highlighter | null
): Array<{ text: string; color?: string; backgroundColor?: string; bold?: boolean; italic?: boolean }> {
  const segments: Array<{ text: string; color?: string; backgroundColor?: string; bold?: boolean; italic?: boolean }> = []

  let prefix = ''
  let prefixColor = colors.textMuted
  let lineBg: string | undefined

  switch (line.type) {
    case 'add':
      prefix = '+'
      prefixColor = colors.success
      lineBg = `${colors.success}22`
      break
    case 'remove':
      prefix = '-'
      prefixColor = colors.error
      lineBg = `${colors.error}22`
      break
    case 'context':
    default:
      prefix = ' '
      prefixColor = colors.textMuted
      break
  }

  segments.push({ text: prefix, color: prefixColor, bold: true })

  if (line.content.trim().length > 0 && highlighter) {
    try {
      highlighter.codeToHtml(line.content, { lang: language, theme })
      segments.push({ text: ` ${line.content}`, color: getLineColor(line.type, colors) })
    } catch {
      segments.push({ text: ` ${line.content}`, color: getLineColor(line.type, colors) })
    }
  } else {
    segments.push({ text: ` ${line.content}`, color: getLineColor(line.type, colors) })
  }

  if (lineBg) {
    segments.forEach(s => { s.backgroundColor = lineBg })
  }

  return segments
}

/** Get color for line type */
function getLineColor(type: 'context' | 'add' | 'remove', colors: ReturnType<typeof useThemeColors>): string {
  switch (type) {
    case 'add': return colors.success
    case 'remove': return colors.error
    default: return colors.textPrimary
  }
}

/** Simple diff viewer for inline use (non-overlay) */
export interface SimpleDiffViewerProps {
  oldContent: string
  newContent: string
  filePath?: string
  computeOptions?: ComputeDiffOptions
  viewMode?: DiffViewMode
  maxHeight?: number
}

export function SimpleDiffViewer({
  oldContent,
  newContent,
  filePath,
  computeOptions = {},
  viewMode = 'unified',
  maxHeight,
}: SimpleDiffViewerProps) {
  const colors = useThemeColors()
  const [diffResult, setDiffResult] = useState<DiffResultStructured | null>(null)

  useEffect(() => {
    try {
      const diff = computeDiff(oldContent, newContent, computeOptions)
      setDiffResult(diff)
    } catch (error) {
      console.error('Diff computation failed:', error)
    }
  }, [oldContent, newContent, computeOptions])

  if (!diffResult) return <Text color={colors.textMuted}>Computing diff...</Text>

  const formatted = viewMode === 'side-by-side'
    ? formatSideBySideDiff(diffResult)
    : viewMode === 'inline'
    ? formatInlineDiff(diffResult)
    : formatUnifiedDiff(diffResult)

  return (
    <Box
      // @ts-ignore - maxHeight works at runtime
      maxHeight={maxHeight}
      // @ts-ignore - overflowY works at runtime
      overflowY="auto"
      padding={1}
      // @ts-ignore - backgroundColor works at runtime
      backgroundColor={colors.surface}
      // @ts-ignore - borderRadius works at runtime
      borderRadius={2}
    >
      <Text color={colors.textMuted}>{formatted}</Text>
    </Box>
  )
}

export { computeDiff, formatUnifiedDiff, formatSideBySideDiff, formatInlineDiff } from '../../../core/dist/diff'
export type { DiffResultStructured, DiffHunk, DiffLine, ComputeDiffOptions } from '../../../core/dist/diff'