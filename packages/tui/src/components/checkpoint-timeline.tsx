import React, { useEffect, useState } from 'react'
import { Box, Text, useInput } from 'ink'
import type { ThemeColors } from '../theme'

export type CheckpointKind = 'user' | 'tool' | 'assistant' | 'manual' | 'system'

export interface Checkpoint {
  id: string
  label: string
  timestamp: number
  messageIndex: number
  kind: CheckpointKind
}

export function formatCheckpointTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export function kindGlyph(kind: CheckpointKind): string {
  switch (kind) {
    case 'user':
      return '▸'
    case 'tool':
      return '⚙'
    case 'assistant':
      return '◈'
    case 'manual':
      return '✱'
    case 'system':
    default:
      return '•'
  }
}

export function kindColor(theme: ThemeColors, kind: CheckpointKind): string {
  switch (kind) {
    case 'user':
      return theme.primary
    case 'tool':
      return theme.accent
    case 'assistant':
      return theme.success
    case 'manual':
      return theme.warning
    case 'system':
    default:
      return theme.textMuted
  }
}

export function moveCursor(
  checkpoints: Checkpoint[],
  currentId: string | undefined,
  dir: 1 | -1
): string | undefined {
  if (checkpoints.length === 0) return undefined
  if (currentId === undefined) {
    return dir === 1 ? checkpoints[0].id : checkpoints[checkpoints.length - 1].id
  }
  const idx = checkpoints.findIndex((c) => c.id === currentId)
  if (idx === -1) return checkpoints[0].id
  const next = idx + dir
  if (next < 0) return checkpoints[0].id
  if (next >= checkpoints.length) return checkpoints[checkpoints.length - 1].id
  return checkpoints[next].id
}

export interface CheckpointTimelineProps {
  themeColors: ThemeColors
  checkpoints: Checkpoint[]
  cursorId?: string
  isOpen: boolean
  isActive?: boolean
  onRewind: (id: string) => void
  onClose?: () => void
}

export function CheckpointTimeline({
  themeColors,
  checkpoints,
  cursorId,
  isOpen,
  isActive = true,
  onRewind,
  onClose,
}: CheckpointTimelineProps) {
  const [cursor, setCursor] = useState<string | undefined>(cursorId)

  useEffect(() => {
    setCursor(cursorId)
  }, [cursorId, isOpen])

  useInput(
    (input, key) => {
      if (!isOpen) return
      const k = key as unknown as { upArrow: boolean; downArrow: boolean; return: boolean; escape: boolean }
      if (k.escape) {
        onClose?.()
        return
      }
      if (k.upArrow) {
        setCursor((c) => moveCursor(checkpoints, c, -1))
        return
      }
      if (k.downArrow) {
        setCursor((c) => moveCursor(checkpoints, c, 1))
        return
      }
      if (k.return) {
        if (cursor) onRewind(cursor)
        return
      }
      if (input === 'r' && cursor) {
        onRewind(cursor)
      }
    },
    { isActive: isActive && isOpen }
  )

  if (!isOpen) return null

  const sorted = [...checkpoints].sort((a, b) => a.messageIndex - b.messageIndex)

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
          {' ⏮ Checkpoints '}
        </Text>
        <Text color={themeColors.textMuted}>({sorted.length})</Text>
      </Box>

      {sorted.length === 0 ? (
        <Text color={themeColors.textMuted}>No checkpoints yet.</Text>
      ) : (
        sorted.map((cp) => {
          const isCursor = cp.id === cursor
          const color = kindColor(themeColors, cp.kind)
          return (
            <Box key={cp.id} flexDirection="row">
              <Text color={isCursor ? themeColors.background : themeColors.textMuted}>
                {isCursor ? '▶' : ' '}
              </Text>
              <Box
                // @ts-ignore runtime-only prop works in Ink
                backgroundColor={isCursor ? color : undefined}
                flexGrow={1}
              >
                <Text
                  color={isCursor ? themeColors.background : themeColors.textPrimary}
                >
                  {` ${kindGlyph(cp.kind)} ${cp.label} `}
                </Text>
                <Text color={isCursor ? themeColors.background : themeColors.textMuted}>
                  {` ${formatCheckpointTime(cp.timestamp)}`}
                </Text>
              </Box>
            </Box>
          )
        })
      )}

      <Box marginTop={1}>
        <Text color={themeColors.textMuted}>↑/↓ move · Enter/r rewind · Esc close</Text>
      </Box>
    </Box>
  )
}

export default CheckpointTimeline