import React, { useCallback, useRef, useState } from 'react'
import { Box, Text, useInput } from 'ink'
import type { ThemeColors } from '../theme'
import { EditorHistory, type EditorMode } from './editor-history'
import {
  type BufferState,
  type EditorKeyInput,
  reduceEditorKey,
  getMentionQuery,
  getSlashQuery,
} from './editor-buffer'

export interface EditorProps {
  themeColors: ThemeColors
  onSubmit: (content: string, mode: EditorMode) => void
  onCancel?: () => void
  initialValue?: string
  initialMode?: EditorMode
  history?: EditorHistory
  placeholder?: string
  isActive?: boolean
  onChange?: (content: string, mode: EditorMode) => void
  onSlashCommand?: (query: string) => void
  onMention?: (query: string) => void
  showModeBar?: boolean
}

interface EditorKey {
  ctrl: boolean
  shift: boolean
  meta: boolean
  return: boolean
  escape: boolean
  backspace: boolean
  delete: boolean
  tab: boolean
  upArrow: boolean
  downArrow: boolean
  leftArrow: boolean
  rightArrow: boolean
  [key: string]: unknown
}

export function Editor({
  themeColors,
  onSubmit,
  onCancel,
  initialValue = '',
  initialMode = 'prompt',
  history,
  placeholder = 'Type a message…  (Shift+Enter for newline, / for commands, @ to mention)',
  isActive = true,
  onChange,
  onSlashCommand,
  onMention,
  showModeBar = true,
}: EditorProps) {
  const bufferRef = useRef<BufferState>({
    lines: initialValue ? initialValue.split('\n') : [''],
    row: 0,
    col: 0,
  })
  const [buffer, setBuffer] = useState<BufferState>(bufferRef.current)
  const [mode, setMode] = useState<EditorMode>(initialMode)
  const [historyNav, setHistoryNav] = useState(false)
  const draftRef = useRef<string | null>(null)

  const commit = useCallback(
    (next: BufferState) => {
      bufferRef.current = next
      setBuffer(next)
      if (onChange) onChange(next.lines.join('\n'), mode)
    },
    [onChange, mode]
  )

  const handleSubmit = useCallback(() => {
    const text = bufferRef.current.lines.join('\n').replace(/\s+$/, '')
    if (!text) return
    if (history) history.add(text, mode)
    if (onSubmit) onSubmit(text, mode)
    bufferRef.current = { lines: [''], row: 0, col: 0 }
    setBuffer(bufferRef.current)
    setHistoryNav(false)
    draftRef.current = null
    if (onChange) onChange('', mode)
    if (onSlashCommand) onSlashCommand('')
    if (onMention) onMention('')
  }, [history, onSubmit, mode, onChange, onSlashCommand, onMention])

  const toggleMode = useCallback(() => {
    setMode((m) => (m === 'prompt' ? 'bash' : 'prompt'))
  }, [])

  const applyContext = useCallback(
    (lines: string[], row: number, col: number) => {
      if (onSlashCommand) onSlashCommand(getSlashQuery(lines) ?? '')
      if (onMention) onMention(getMentionQuery(lines, row, col) ?? '')
    },
    [onSlashCommand, onMention]
  )

  const loadHistoryPrev = useCallback(() => {
    const { lines } = bufferRef.current
    if (!historyNav && draftRef.current === null) {
      draftRef.current = lines.join('\n')
    }
    const prev = history ? history.previous(draftRef.current ?? undefined) : null
    if (prev !== null) {
      const nextLines = prev.split('\n')
      setHistoryNav(true)
      commit({ lines: nextLines, row: nextLines.length - 1, col: nextLines[nextLines.length - 1].length })
      applyContext(nextLines, bufferRef.current.row, bufferRef.current.col)
    }
  }, [history, historyNav, commit, applyContext])

  const loadHistoryNext = useCallback(() => {
    if (!history || !historyNav) return
    const next = history.next()
    if (next !== null) {
      const nextLines = next.split('\n')
      commit({ lines: nextLines, row: nextLines.length - 1, col: nextLines[nextLines.length - 1].length })
      applyContext(nextLines, bufferRef.current.row, bufferRef.current.col)
    } else {
      const restored = draftRef.current !== null ? draftRef.current.split('\n') : ['']
      draftRef.current = null
      setHistoryNav(false)
      commit({ lines: restored, row: restored.length - 1, col: restored[restored.length - 1].length })
      if (onSlashCommand) onSlashCommand('')
      if (onMention) onMention('')
    }
  }, [history, historyNav, commit, applyContext, onSlashCommand, onMention])

  useInput(
    (input, rawKey) => {
      const key = rawKey as unknown as EditorKey
      const k: EditorKeyInput = {
        input,
        ctrl: key.ctrl,
        shift: key.shift,
        return: key.return,
        escape: key.escape,
        backspace: key.backspace,
        delete: key.delete,
        upArrow: key.upArrow,
        downArrow: key.downArrow,
        leftArrow: key.leftArrow,
        rightArrow: key.rightArrow,
      }
      const result = reduceEditorKey(bufferRef.current, k)
      switch (result.action.type) {
        case 'buffer': {
          commit(result.action.buffer)
          setHistoryNav(false)
          if (onSlashCommand) onSlashCommand(result.slashQuery ?? '')
          if (onMention) onMention(result.mentionQuery ?? '')
          break
        }
        case 'submit':
          handleSubmit()
          break
        case 'cancel':
          if (onCancel) onCancel()
          break
        case 'toggleMode':
          toggleMode()
          break
        case 'historyPrev':
          loadHistoryPrev()
          break
        case 'historyNext':
          loadHistoryNext()
          break
      }
    },
    { isActive }
  )

  const totalText = buffer.lines.join('\n')
  const isEmpty = totalText.length === 0

  return (
    <Box flexDirection="column">
      {showModeBar && (
        <Box marginBottom={1}>
          <Box
            // @ts-ignore runtime-only prop works in Ink
            borderStyle="round"
            // @ts-ignore runtime-only prop works in Ink
            borderColor={mode === 'bash' ? themeColors.warning : themeColors.primary}
            paddingX={1}
          >
            <Text
              color={mode === 'bash' ? themeColors.warning : themeColors.primary}
              bold
            >
              {mode === 'bash' ? 'BASH' : 'PROMPT'}
            </Text>
            <Text color={themeColors.textMuted}>  Ctrl+B: toggle mode · Shift+Enter: newline · ↑/↓: history </Text>
          </Box>
        </Box>
      )}
      <Box flexDirection="column" paddingX={1}>
        {isEmpty ? (
          <Text color={themeColors.textMuted}>{placeholder}</Text>
        ) : (
          buffer.lines.map((line, i) => {
            const isCursor = i === buffer.row && isActive
            if (!isCursor) {
              return (
                <Text key={i} color={themeColors.textPrimary}>
                  {line || ' '}
                </Text>
              )
            }
            const before = line.slice(0, buffer.col)
            const at = line[buffer.col] ?? ' '
            const after = line.slice(buffer.col + 1)
            return (
              <Box key={i} flexDirection="row">
                <Text color={themeColors.textPrimary}>{before}</Text>
                <Text inverse>{at}</Text>
                <Text color={themeColors.textPrimary}>{after}</Text>
              </Box>
            )
          })
        )}
      </Box>
    </Box>
  )
}

export default Editor