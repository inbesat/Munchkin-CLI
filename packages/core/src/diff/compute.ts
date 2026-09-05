// @ts-ignore - diff has no types available
import { diffLines, diffChars, diffWords, type Change } from 'diff'

/** Diff format options. */
export type DiffFormat = 'unified' | 'side-by-side' | 'inline'

/** Diff algorithm options. */
export type DiffAlgorithm = 'lines' | 'words' | 'chars'

/** A single diff hunk. */
export interface DiffHunk {
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  lines: DiffLine[]
}

/** A single line in a diff. */
export interface DiffLine {
  type: 'context' | 'add' | 'remove'
  content: string
  oldLineNumber?: number
  newLineNumber?: number
}

/** Complete diff result. */
export interface DiffResultStructured {
  hunks: DiffHunk[]
  oldFile: string
  newFile: string
  format: DiffFormat
}

/** Options for diff computation. */
export interface ComputeDiffOptions {
  /** Diff format. */
  format?: DiffFormat
  /** Diff algorithm granularity. */
  algorithm?: DiffAlgorithm
  /** Number of context lines around changes. */
  contextLines?: number
  /** Ignore whitespace differences. */
  ignoreWhitespace?: boolean
  /** Maximum file size to diff (bytes). */
  maxSize?: number
}

/** Default options. */
const DEFAULT_OPTIONS: Required<ComputeDiffOptions> = {
  format: 'unified',
  algorithm: 'lines',
  contextLines: 3,
  ignoreWhitespace: false,
  maxSize: 1_000_000,
}

/**
 * Compute a diff between two strings.
 */
export function computeDiff(
  oldContent: string,
  newContent: string,
  options: ComputeDiffOptions = {},
): DiffResultStructured {
  const opts = { ...DEFAULT_OPTIONS, ...options }

  if (oldContent.length > opts.maxSize || newContent.length > opts.maxSize) {
    throw new Error(`File too large for diff (max ${opts.maxSize} bytes)`)
  }

  const oldLines = oldContent.split('\n')
  const newLines = newContent.split('\n')

  let rawDiff: Change[]
  switch (opts.algorithm) {
    case 'words':
      rawDiff = diffWords(oldContent, newContent, { ignoreWhitespace: opts.ignoreWhitespace })
      break
    case 'chars':
      rawDiff = diffChars(oldContent, newContent, { ignoreWhitespace: opts.ignoreWhitespace })
      break
    case 'lines':
    default:
      rawDiff = diffLines(oldContent, newContent, { ignoreWhitespace: opts.ignoreWhitespace })
      break
  }

  const hunks = buildHunks(rawDiff, oldLines, newLines, opts.contextLines)

  return {
    hunks,
    oldFile: oldContent,
    newFile: newContent,
    format: opts.format,
  }
}

/** Build structured hunks from raw diff output. */
function buildHunks(
  rawDiff: Change[],
  _oldLines: string[],
  _newLines: string[],
  contextLines: number,
): DiffHunk[] {
  const hunks: DiffHunk[] = []
  let oldIdx = 0
  let newIdx = 0
  let currentHunk: DiffHunk | null = null

  function flushHunk() {
    if (currentHunk && currentHunk.lines.length > 0) {
      hunks.push(currentHunk)
      currentHunk = null
    }
  }

  function startHunk() {
    currentHunk = {
      oldStart: oldIdx + 1,
      oldLines: 0,
      newStart: newIdx + 1,
      newLines: 0,
      lines: [],
    }
  }

  for (const part of rawDiff) {
    const lines = part.value.split('\n')
    const lastEmpty = lines[lines.length - 1] === '' ? lines.pop() : null

    if (part.added) {
      if (!currentHunk) startHunk()
      for (const line of lines) {
        currentHunk!.lines.push({
          type: 'add',
          content: line,
          newLineNumber: newIdx + 1,
        })
        currentHunk!.newLines++
        newIdx++
      }
    } else if (part.removed) {
      if (!currentHunk) startHunk()
      for (const line of lines) {
        currentHunk!.lines.push({
          type: 'remove',
          content: line,
          oldLineNumber: oldIdx + 1,
        })
        currentHunk!.oldLines++
        oldIdx++
      }
    } else {
      // Context lines
      for (const line of lines) {
        if (!currentHunk) startHunk()
        currentHunk!.lines.push({
          type: 'context',
          content: line,
          oldLineNumber: oldIdx + 1,
          newLineNumber: newIdx + 1,
        })
        currentHunk!.oldLines++
        currentHunk!.newLines++
        oldIdx++
        newIdx++
      }
    }

    if (lastEmpty !== null) {
      // Handle trailing empty line from split
    }
  }

  flushHunk()

  // Apply context line trimming
  return hunks.map((hunk) => trimHunkContext(hunk, contextLines))
}

/** Trim context lines in a hunk to the specified number. */
function trimHunkContext(hunk: DiffHunk, contextLines: number): DiffHunk {
  const lines = hunk.lines
  if (lines.length <= contextLines * 2) return hunk

  // Keep contextLines before first change and after last change
  let firstChange = lines.findIndex((l) => l.type !== 'context')
  let lastChange = lines.length - 1 - [...lines].reverse().findIndex((l) => l.type !== 'context')

  if (firstChange === -1) return hunk // No changes, shouldn't happen

  const start = Math.max(0, firstChange - contextLines)
  const end = Math.min(lines.length, lastChange + 1 + contextLines)

  const trimmed = lines.slice(start, end)

  // Renumber line numbers
  let oldLine = hunk.oldStart + start
  let newLine = hunk.newStart + start

  const renumbered = trimmed.map((l) => {
    const result = { ...l }
    if (l.type === 'context' || l.type === 'remove') result.oldLineNumber = oldLine++
    if (l.type === 'context' || l.type === 'add') result.newLineNumber = newLine++
    return result
  })

  return {
    ...hunk,
    lines: renumbered,
    oldLines: trimmed.filter((l) => l.type !== 'add').length,
    newLines: trimmed.filter((l) => l.type !== 'remove').length,
  }
}

/** Convert structured diff to unified diff string. */
export function formatUnifiedDiff(diff: DiffResultStructured, oldName = 'a', newName = 'b'): string {
  const lines: string[] = [
    `--- ${oldName}`,
    `+++ ${newName}`,
  ]

  for (const hunk of diff.hunks) {
    const header = `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`
    lines.push(header)

    for (const line of hunk.lines) {
      const prefix = line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '
      lines.push(`${prefix}${line.content}`)
    }
  }

  return lines.join('\n')
}

/** Convert structured diff to side-by-side string. */
export function formatSideBySideDiff(diff: DiffResultStructured): string {
  const lines: string[] = []
  const width = Math.max(
    80,
    ...diff.hunks.flatMap((h) =>
      h.lines.map((l) => l.content.length),
    ),
  )
  const halfWidth = Math.floor((width - 3) / 2)

  for (const hunk of diff.hunks) {
    lines.push(`--- Old (lines ${hunk.oldStart}-${hunk.oldStart + hunk.oldLines - 1}) --- New (lines ${hunk.newStart}-${hunk.newStart + hunk.newLines - 1}) ---`)

    for (const line of hunk.lines) {
      const oldContent = line.type !== 'add' ? line.content : ''
      const newContent = line.type !== 'remove' ? line.content : ''
      const oldNum = line.oldLineNumber?.toString().padStart(4) ?? '    '
      const newNum = line.newLineNumber?.toString().padStart(4) ?? '    '

      const marker = line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '
      const oldSide = `${oldNum} ${oldContent.padEnd(halfWidth)}`
      const newSide = `${newNum} ${newContent.padEnd(halfWidth)}`
      lines.push(`${oldSide} | ${marker} ${newSide}`)
    }
  }

  return lines.join('\n')
}

/** Convert structured diff to inline string. */
export function formatInlineDiff(diff: DiffResultStructured): string {
  const lines: string[] = []

  for (const hunk of diff.hunks) {
    lines.push(`@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`)

    for (const line of hunk.lines) {
      if (line.type === 'context') {
        lines.push(`  ${line.content}`)
      } else if (line.type === 'remove') {
        lines.push(`- ${line.content}`)
      } else if (line.type === 'add') {
        lines.push(`+ ${line.content}`)
      }
    }
  }

  return lines.join('\n')
}

/** Format diff according to specified format. */
export function formatDiff(diff: DiffResultStructured, oldName = 'a', newName = 'b'): string {
  switch (diff.format) {
    case 'side-by-side':
      return formatSideBySideDiff(diff)
    case 'inline':
      return formatInlineDiff(diff)
    case 'unified':
    default:
      return formatUnifiedDiff(diff, oldName, newName)
  }
}