export interface BufferState {
  lines: string[]
  row: number
  col: number
}

export function clampCol(line: string, col: number): number {
  return Math.max(0, Math.min(col, line.length))
}

export function insertText(
  lines: string[],
  row: number,
  col: number,
  text: string
): BufferState {
  const current = lines[row] ?? ''
  const before = current.slice(0, col)
  const after = current.slice(col)
  const parts = text.split('\n')
  if (parts.length === 1) {
    const next = [...lines]
    next[row] = before + text + after
    return { lines: next, row, col: col + text.length }
  }
  const newLines: string[] = []
  newLines.push(before + parts[0])
  for (let i = 1; i < parts.length - 1; i++) {
    newLines.push(parts[i])
  }
  newLines.push(parts[parts.length - 1] + after)
  const next = [...lines]
  next.splice(row, 1, ...newLines)
  return {
    lines: next,
    row: row + parts.length - 1,
    col: parts[parts.length - 1].length,
  }
}

export function backspaceAt(lines: string[], row: number, col: number): BufferState {
  if (col > 0) {
    const current = lines[row]
    const next = [...lines]
    next[row] = current.slice(0, col - 1) + current.slice(col)
    return { lines: next, row, col: col - 1 }
  }
  if (row > 0) {
    const prevLen = lines[row - 1].length
    const merged = lines[row - 1] + lines[row]
    const next = [...lines]
    next.splice(row - 1, 2, merged)
    return { lines: next, row: row - 1, col: prevLen }
  }
  return { lines, row, col }
}

export function deleteAt(lines: string[], row: number, col: number): BufferState {
  const current = lines[row]
  if (col < current.length) {
    const next = [...lines]
    next[row] = current.slice(0, col) + current.slice(col + 1)
    return { lines: next, row, col }
  }
  if (row < lines.length - 1) {
    const merged = current + lines[row + 1]
    const next = [...lines]
    next.splice(row, 2, merged)
    return { lines: next, row, col }
  }
  return { lines, row, col }
}

export function deleteWordAt(lines: string[], row: number, col: number): BufferState {
  if (col === 0) return backspaceAt(lines, row, col)
  const current = lines[row]
  let start = col - 1
  while (start > 0 && /\s/.test(current[start - 1])) start--
  while (start > 0 && !/\s/.test(current[start - 1])) start--
  const next = [...lines]
  next[row] = current.slice(0, start) + current.slice(col)
  return { lines: next, row, col: start }
}

export function getMentionQuery(
  lines: string[],
  row: number,
  col: number
): string | null {
  const line = (lines[row] ?? '').slice(0, col)
  const atIdx = line.lastIndexOf('@')
  if (atIdx === -1) return null
  const before = line[atIdx - 1]
  if (atIdx > 0 && before && !/\s/.test(before)) return null
  const query = line.slice(atIdx + 1)
  if (/\s/.test(query)) return null
  return query
}

export function getSlashQuery(lines: string[]): string | null {
  const first = lines[0] ?? ''
  if (first.startsWith('/') && !/\s/.test(first)) {
    return first.slice(1)
  }
  return null
}

export interface EditorKeyInput {
  input: string
  ctrl: boolean
  shift: boolean
  return: boolean
  escape: boolean
  backspace: boolean
  delete: boolean
  upArrow: boolean
  downArrow: boolean
  leftArrow: boolean
  rightArrow: boolean
}

export type EditorAction =
  | { type: 'buffer'; buffer: BufferState }
  | { type: 'submit' }
  | { type: 'cancel' }
  | { type: 'toggleMode' }
  | { type: 'historyPrev' }
  | { type: 'historyNext' }

export interface EditorKeyResult {
  action: EditorAction
  slashQuery: string | null
  mentionQuery: string | null
}

function bufferResult(buffer: BufferState): EditorKeyResult {
  return {
    action: { type: 'buffer', buffer },
    slashQuery: getSlashQuery(buffer.lines),
    mentionQuery: getMentionQuery(buffer.lines, buffer.row, buffer.col),
  }
}

export function reduceEditorKey(
  state: BufferState,
  key: EditorKeyInput
): EditorKeyResult {
  const { lines, row, col } = state

  if (key.ctrl && key.input === 'c') {
    return { action: { type: 'cancel' }, slashQuery: null, mentionQuery: null }
  }
  if (key.ctrl && key.input === 'b') {
    return { action: { type: 'toggleMode' }, slashQuery: null, mentionQuery: null }
  }
  if (key.ctrl && key.input === 'a') {
    return bufferResult({ lines, row, col: 0 })
  }
  if (key.ctrl && key.input === 'e') {
    return bufferResult({ lines, row, col: lines[row].length })
  }
  if (key.ctrl && key.input === 'u') {
    const nextLines = [...lines]
    nextLines[row] = lines[row].slice(col)
    return bufferResult({ lines: nextLines, row, col: 0 })
  }
  if (key.ctrl && key.input === 'k') {
    const nextLines = [...lines]
    nextLines[row] = lines[row].slice(0, col)
    return bufferResult({ lines: nextLines, row, col })
  }
  if (key.ctrl && key.input === 'w') {
    return bufferResult(deleteWordAt(lines, row, col))
  }
  if (key.return) {
    if (key.shift) {
      return bufferResult(insertText(lines, row, col, '\n'))
    }
    return { action: { type: 'submit' }, slashQuery: null, mentionQuery: null }
  }
  if (key.backspace) {
    return bufferResult(backspaceAt(lines, row, col))
  }
  if (key.delete) {
    return bufferResult(deleteAt(lines, row, col))
  }
  if (key.upArrow) {
    if (row > 0) {
      return bufferResult({ lines, row: row - 1, col: clampCol(lines[row - 1], col) })
    }
    return { action: { type: 'historyPrev' }, slashQuery: null, mentionQuery: null }
  }
  if (key.downArrow) {
    if (row < lines.length - 1) {
      return bufferResult({ lines, row: row + 1, col: clampCol(lines[row + 1], col) })
    }
    return { action: { type: 'historyNext' }, slashQuery: null, mentionQuery: null }
  }
  if (key.leftArrow) {
    if (col > 0) return bufferResult({ lines, row, col: col - 1 })
    if (row > 0) {
      return bufferResult({ lines, row: row - 1, col: lines[row - 1].length })
    }
    return bufferResult(state)
  }
  if (key.rightArrow) {
    if (col < lines[row].length) return bufferResult({ lines, row, col: col + 1 })
    if (row < lines.length - 1) {
      return bufferResult({ lines, row: row + 1, col: 0 })
    }
    return bufferResult(state)
  }
  if (key.escape) {
    return { action: { type: 'buffer', buffer: state }, slashQuery: '', mentionQuery: '' }
  }
  if (key.input && key.input.length > 0) {
    return bufferResult(insertText(lines, row, col, key.input))
  }
  return { action: { type: 'buffer', buffer: state }, slashQuery: null, mentionQuery: null }
}
