import { Box, Text, useInput } from 'ink'
import { useEffect, useRef, useState } from 'react'
import type { ThemeColors } from '../theme'

export interface Command {
  id: string
  title: string
  description?: string
  group?: string
  shortcut?: string
}

export const defaultCommands: Command[] = [
  { id: 'help', title: 'help', description: 'Show help and available commands', group: 'builtin' },
  { id: 'clear', title: 'clear', description: 'Clear the conversation screen', group: 'builtin' },
  { id: 'model', title: 'model', description: 'Switch the active model', group: 'builtin' },
  { id: 'theme', title: 'theme', description: 'Change the color theme', group: 'builtin' },
  {
    id: 'permissions',
    title: 'permissions',
    description: 'Open the permissions manager',
    group: 'builtin',
  },
  {
    id: 'compact',
    title: 'compact',
    description: 'Compact the conversation context',
    group: 'builtin',
  },
  { id: 'export', title: 'export', description: 'Export the transcript', group: 'builtin' },
  { id: 'status', title: 'status', description: 'Show session and token usage', group: 'builtin' },
  {
    id: 'context',
    title: 'context',
    description: 'Show a live context-window usage grid',
    group: 'builtin',
  },
  {
    id: 'tasks',
    title: 'tasks',
    description: 'List background tasks and their results',
    group: 'builtin',
  },
  {
    id: 'goal',
    title: 'goal',
    description: 'Set an autonomous goal (`/goal <condition>`, `/goal clear`)',
    group: 'builtin',
  },
  {
    id: 'plugin',
    title: 'plugin',
    description: 'Plugin marketplace (`/plugin installed`, `/plugin marketplace add owner/repo`)',
    group: 'builtin',
  },
  { id: 'init', title: 'init', description: 'Generate project configuration', group: 'builtin' },
  { id: 'review', title: 'review', description: 'Run a code review on the diff', group: 'builtin' },
  { id: 'terminal', title: 'terminal', description: 'Open an interactive shell', group: 'builtin' },
  {
    id: 'summarize',
    title: 'summarize',
    description: 'Summarize the current changes',
    group: 'builtin',
  },
]

export function filterCommands(commands: Command[], query: string): Command[] {
  const q = query.trim().toLowerCase()
  if (!q) return commands
  const terms = q.split(/\s+/).filter(Boolean)
  const scored: Array<{ cmd: Command; score: number }> = []
  for (const cmd of commands) {
    const title = cmd.title.toLowerCase()
    const hay = `${cmd.title} ${cmd.description ?? ''} ${cmd.id} ${cmd.group ?? ''}`.toLowerCase()
    const matchesAll = terms.every((term) => hay.includes(term))
    if (!matchesAll) continue
    let score = 0
    if (title.startsWith(terms[0])) score += 100
    else if (title.includes(terms[0])) score += 50
    score -= cmd.title.length - terms[0].length
    scored.push({ cmd, score })
  }
  scored.sort((a, b) => b.score - a.score)
  return scored.map((s) => s.cmd)
}

export function moveSelection(index: number, delta: number, count: number): number {
  if (count === 0) return 0
  const next = index + delta
  if (next < 0) return count - 1
  if (next >= count) return 0
  return next
}

interface PaletteKey {
  ctrl: boolean
  shift: boolean
  return: boolean
  escape: boolean
  upArrow: boolean
  downArrow: boolean
  leftArrow: boolean
  rightArrow: boolean
  [key: string]: unknown
}

export interface CommandPaletteProps {
  themeColors: ThemeColors
  commands?: Command[]
  query: string
  isOpen: boolean
  isActive?: boolean
  onSelect: (command: Command) => void
  onClose: () => void
  maxVisible?: number
}

export function CommandPalette({
  themeColors,
  commands = defaultCommands,
  query,
  isOpen,
  isActive = true,
  onSelect,
  onClose,
  maxVisible = 10,
}: CommandPaletteProps) {
  const filtered = useRef<Command[]>(filterCommands(commands, query))
  filtered.current = filterCommands(commands, query)
  const [selected, setSelected] = useState(0)

  useEffect(() => {
    setSelected(0)
  }, [query])

  useInput(
    (input, rawKey) => {
      const key = rawKey as unknown as PaletteKey
      if (key.escape) {
        onClose()
        return
      }
      if (key.upArrow) {
        setSelected((i) => moveSelection(i, -1, filtered.current.length))
        return
      }
      if (key.downArrow) {
        setSelected((i) => moveSelection(i, 1, filtered.current.length))
        return
      }
      if (key.return) {
        const cmd = filtered.current[selected]
        if (cmd) onSelect(cmd)
        return
      }
      void input
    },
    { isActive: isActive && isOpen },
  )

  if (!isOpen) return null

  const list = filtered.current
  const visible = list.slice(0, maxVisible)
  const offset = selected >= maxVisible ? selected - maxVisible + 1 : 0
  const paged = list.slice(offset, offset + maxVisible)

  return (
    <Box
      flexDirection="column"
      // @ts-ignore runtime-only prop works in Ink
      borderStyle="round"
      // @ts-ignore runtime-only prop works in Ink
      borderColor={themeColors.primary}
      paddingX={1}
      marginBottom={1}
    >
      <Box marginBottom={1}>
        <Text color={themeColors.textMuted}>› </Text>
        <Text color={themeColors.textPrimary}>/{query}</Text>
        <Text color={themeColors.textMuted}>
          {' '}
          ({list.length} command{list.length === 1 ? '' : 's'})
        </Text>
      </Box>
      {paged.length === 0 ? (
        <Text color={themeColors.textMuted}>No matching commands</Text>
      ) : (
        paged.map((cmd, i) => {
          const actualIndex = offset + i
          const isSel = actualIndex === selected
          return (
            <Box key={cmd.id} flexDirection="row">
              <Text color={isSel ? themeColors.background : themeColors.textMuted}>
                {isSel ? '▶' : ' '}
              </Text>
              <Box
                // @ts-ignore runtime-only prop works in Ink
                backgroundColor={isSel ? themeColors.primary : undefined}
                flexGrow={1}
              >
                <Text color={isSel ? themeColors.background : themeColors.textPrimary} bold={isSel}>
                  {' '}
                  /{cmd.title}
                </Text>
                {cmd.description ? (
                  <Text color={isSel ? themeColors.background : themeColors.textSecondary}>
                    {'  '}
                    {cmd.description}
                  </Text>
                ) : null}
                {cmd.shortcut ? (
                  <Text color={isSel ? themeColors.background : themeColors.textMuted}>
                    {'  '}
                    {cmd.shortcut}
                  </Text>
                ) : null}
              </Box>
            </Box>
          )
        })
      )}
      <Box marginTop={1}>
        <Text color={themeColors.textMuted}>↑/↓ navigate · Enter select · Esc cancel</Text>
      </Box>
    </Box>
  )
}

export default CommandPalette
