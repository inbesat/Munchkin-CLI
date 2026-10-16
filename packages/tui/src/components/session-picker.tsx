import { Box, Text, useInput } from 'ink'
import { useEffect, useState } from 'react'
import type { ThemeColors } from '../theme'
import { formatCost } from './status-bar'

export interface SessionSummary {
  id: string
  title: string
  preview: string
  model?: string
  cost?: number
  createdAt: number
  updatedAt?: number
}

/** Case-insensitive search over title/preview/model. Pure. */
export function filterSessions(sessions: SessionSummary[], query: string): SessionSummary[] {
  const q = query.trim().toLowerCase()
  if (!q) return sessions
  const terms = q.split(/\s+/)
  return sessions.filter((s) => {
    const hay = `${s.title} ${s.preview} ${s.model ?? ''}`.toLowerCase()
    return terms.every((t) => hay.includes(t))
  })
}

/** Format a timestamp as YYYY-MM-DD HH:MM. Pure. */
export function formatSessionDate(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function moveSessionSelection(count: number, current: number, dir: 1 | -1): number {
  if (count === 0) return 0
  if (current < 0) return dir === 1 ? 0 : count - 1
  const next = current + dir
  if (next < 0) return 0
  if (next >= count) return count - 1
  return next
}

export interface SessionPickerProps {
  themeColors: ThemeColors
  sessions: SessionSummary[]
  isOpen: boolean
  isActive?: boolean
  query?: string
  selectedId?: string
  onResume: (id: string) => void
  onFork?: (id: string) => void
  onExport?: (id: string) => void
  onClose?: () => void
}

export function SessionPicker({
  themeColors,
  sessions,
  isOpen,
  isActive = true,
  query,
  selectedId,
  onResume,
  onFork,
  onExport,
  onClose,
}: SessionPickerProps) {
  const [internalQuery, setInternalQuery] = useState('')
  const effectiveQuery = query ?? internalQuery
  const results = filterSessions(sessions, effectiveQuery)

  const [selected, setSelected] = useState(0)
  useEffect(() => {
    setSelected((s) => Math.min(s, Math.max(0, results.length - 1)))
  }, [results.length])

  useEffect(() => {
    if (selectedId) {
      const idx = results.findIndex((r) => r.id === selectedId)
      if (idx >= 0) setSelected(idx)
    }
  }, [selectedId, results])

  useInput(
    (input, key) => {
      if (!isOpen) return
      const k = key as unknown as {
        upArrow: boolean
        downArrow: boolean
        return: boolean
        escape: boolean
        backspace: boolean
        ctrl: boolean
        meta: boolean
      }
      if (k.escape) {
        onClose?.()
        return
      }
      if (k.upArrow) {
        setSelected((s) => moveSessionSelection(results.length, s, -1))
        return
      }
      if (k.downArrow) {
        setSelected((s) => moveSessionSelection(results.length, s, 1))
        return
      }
      if (k.return) {
        const sel = results[selected]
        if (sel) onResume(sel.id)
        return
      }
      if (input === 'f' && onFork) {
        const sel = results[selected]
        if (sel) onFork(sel.id)
        return
      }
      if (input === 'e' && onExport) {
        const sel = results[selected]
        if (sel) onExport(sel.id)
        return
      }
      if (query === undefined) {
        if (k.backspace) {
          setInternalQuery((q) => q.slice(0, -1))
          return
        }
        if (input && input.length === 1 && !k.ctrl && !k.meta) {
          setInternalQuery((q) => q + input)
        }
      }
    },
    { isActive: isActive && isOpen },
  )

  if (!isOpen) return null

  return (
    <Box
      flexDirection="column"
      // @ts-ignore runtime-only prop works in Ink
      borderStyle="round"
      // @ts-ignore runtime-only prop works in Ink
      borderColor={themeColors.borderFocus}
      // @ts-ignore runtime-only prop works in Ink
      paddingX={1}
      marginBottom={1}
    >
      <Box marginBottom={1}>
        <Text color={themeColors.borderFocus} bold>
          {' 📂 Sessions '}
        </Text>
        {effectiveQuery ? (
          <Text color={themeColors.textMuted}> (filter: {effectiveQuery})</Text>
        ) : null}
        <Text color={themeColors.textMuted}>
          {' '}
          — {results.length} of {sessions.length}
        </Text>
      </Box>

      {results.length === 0 ? (
        <Text color={themeColors.textMuted}>No sessions match.</Text>
      ) : (
        results.map((s, i) => {
          const isSel = i === selected
          return (
            <Box key={s.id} flexDirection="column">
              <Box flexDirection="row">
                <Text color={isSel ? themeColors.background : themeColors.textMuted}>
                  {isSel ? '▶' : ' '}
                </Text>
                <Box
                  // @ts-ignore runtime-only prop works in Ink
                  backgroundColor={isSel ? themeColors.primary : undefined}
                  flexGrow={1}
                >
                  <Text color={isSel ? themeColors.background : themeColors.textPrimary} bold>
                    {` ${s.title}`}
                  </Text>
                  <Text color={isSel ? themeColors.background : themeColors.textMuted}>
                    {`  ${formatSessionDate(s.createdAt)}`}
                  </Text>
                </Box>
              </Box>
              <Box flexDirection="row" marginLeft={2}>
                <Text color={isSel ? themeColors.background : themeColors.textSecondary}>
                  {s.preview.length > 60 ? s.preview.slice(0, 60) + '…' : s.preview}
                </Text>
                {s.model ? (
                  <Text color={isSel ? themeColors.background : themeColors.accent}>
                    {`  [${s.model}]`}
                  </Text>
                ) : null}
                {s.cost !== undefined ? (
                  <Text color={isSel ? themeColors.background : themeColors.success}>
                    {`  ${formatCost(s.cost)}`}
                  </Text>
                ) : null}
              </Box>
            </Box>
          )
        })
      )}

      <Box marginTop={1}>
        <Text color={themeColors.textMuted}>
          ↑/↓ move · Enter resume · f fork · e export · Esc close
        </Text>
      </Box>
    </Box>
  )
}

export default SessionPicker
