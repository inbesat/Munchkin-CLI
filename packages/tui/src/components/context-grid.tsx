import { Box, Text } from 'ink'
import { useEffect, useState } from 'react'

/**
 * `/context` grid (Phase 90). Pure computation lives here so it is testable;
 * the Ink component is a thin shell over `computeContextRows`.
 */

const FILLED = '█'
const EMPTY = '░'

export interface ContextBreakdown {
  systemPrompt: number
  conversationHistory: number
  toolSchemas: number
  mcpToolSchemas: number
  reservedForResponse: number
}

export interface ContextGridInput {
  totalBudget: number
  breakdown: ContextBreakdown
}

export interface ContextGridRow {
  readonly label: string
  readonly tokens: number
  readonly fraction: number
  readonly bar: string
  readonly percentText: string
}

export interface ContextGrid {
  readonly headerText: string
  readonly rows: readonly ContextGridRow[]
}

const SEGMENTS: ReadonlyArray<{ label: string; pick: (b: ContextBreakdown) => number }> = [
  { label: 'system prompt', pick: (b) => b.systemPrompt },
  { label: 'conversation', pick: (b) => b.conversationHistory },
  { label: 'tool schemas', pick: (b) => b.toolSchemas },
  { label: 'mcp tools', pick: (b) => b.mcpToolSchemas },
  { label: 'response reserve', pick: (b) => b.reservedForResponse },
]

function renderBar(fraction: number, width: number): string {
  const safeWidth = Math.max(1, Math.floor(width))
  const filled = Math.min(safeWidth, Math.max(0, Math.round(fraction * safeWidth)))
  return FILLED.repeat(filled) + EMPTY.repeat(safeWidth - filled)
}

function formatTokens(tokens: number): string {
  return tokens.toLocaleString('en-US')
}

/** Compute the `/context` grid rows for a budget snapshot. */
export function computeContextRows(
  input: ContextGridInput,
  options: { width?: number } = {},
): ContextGrid {
  const width = Math.max(1, Math.floor(options.width ?? 40))
  const { totalBudget, breakdown } = input
  const budget = Math.max(1, totalBudget)

  const used = SEGMENTS.reduce((sum, s) => sum + Math.max(0, s.pick(breakdown)), 0)
  const available = Math.max(0, totalBudget - used)

  const rows: ContextGridRow[] = SEGMENTS.map(({ label, pick }) => {
    const tokens = Math.max(0, pick(breakdown))
    const fraction = Math.min(1, tokens / budget)
    return {
      label,
      tokens,
      fraction,
      bar: renderBar(fraction, width),
      percentText: `${(fraction * 100).toFixed(1)}%`,
    }
  })

  const availableFraction = Math.min(1, available / budget)
  rows.push({
    label: 'available',
    tokens: available,
    fraction: availableFraction,
    bar: renderBar(availableFraction, width),
    percentText: `${(availableFraction * 100).toFixed(1)}%`,
  })

  return {
    headerText: `context budget: ${formatTokens(used)} / ${formatTokens(totalBudget)} tokens used`,
    rows,
  }
}

export interface ContextGridProps {
  /** Snapshot provider so mounted grids stay real-time. */
  snapshot: () => ContextGridInput
  /** Refresh cadence in ms (default 500). */
  refreshMs?: number
  /** Bar width in characters (default 32). */
  width?: number
}

/** Live `/context` grid. Re-renders on the cadence of `refreshMs`. */
export function ContextGrid({ snapshot, refreshMs = 500, width = 32 }: ContextGridProps) {
  const [, setTick] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), refreshMs)
    return () => clearInterval(timer)
  }, [refreshMs])

  const grid = computeContextRows(snapshot(), { width })

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold>{grid.headerText}</Text>
      {grid.rows.map((row) => (
        <Box key={row.label} flexDirection="row" gap={1}>
          <Box width={18}>
            <Text>{row.label}</Text>
          </Box>
          <Box width={34}>
            <Text>{row.bar}</Text>
          </Box>
          <Text color="gray">
            {formatTokens(row.tokens)} ({row.percentText})
          </Text>
        </Box>
      ))}
      <Text dimColor>updates automatically — any key returns</Text>
    </Box>
  )
}
