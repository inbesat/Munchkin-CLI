import { Box, Text, useStdout } from 'ink'
import React from 'react'
import type { ThemeColors } from '../theme'

export type AgentStatus = 'thinking' | 'executing' | 'idle' | 'waiting' | 'error'

export interface StatusBarState {
  gitBranch?: string
  modelName?: string
  tokensUsed?: number
  tokenLimit?: number
  cost?: number
  agentStatus?: AgentStatus
  backgroundTasks?: number
  contextUsed?: number
  contextLimit?: number
  mode?: string
}

export function formatTokens(n: number | undefined): string {
  const v = n ?? 0
  if (v < 1000) return String(v)
  if (v < 1_000_000) return `${(v / 1000).toFixed(1)}k`
  return `${(v / 1_000_000).toFixed(1)}M`
}

export function formatCost(n: number | undefined): string {
  const v = n ?? 0
  if (v === 0) return '$0.00'
  if (v < 1) return `$${v.toFixed(3)}`
  return `$${v.toFixed(2)}`
}

export function statusColor(theme: ThemeColors, status: AgentStatus | undefined): string {
  switch (status) {
    case 'thinking':
      return theme.info
    case 'executing':
      return theme.warning
    case 'error':
      return theme.error
    case 'waiting':
      return theme.textSecondary
    case 'idle':
    default:
      return theme.textMuted
  }
}

export interface StatusSegment {
  key: string
  label: string
  value: string
  color: string
  required?: boolean
}

export function buildStatusBarSegments(state: StatusBarState, theme: ThemeColors): StatusSegment[] {
  const segs: StatusSegment[] = []

  segs.push({
    key: 'status',
    label: '',
    value: state.agentStatus ?? 'idle',
    color: statusColor(theme, state.agentStatus),
    required: true,
  })

  segs.push({
    key: 'tokens',
    label: 'tok',
    value: state.tokenLimit
      ? `${formatTokens(state.tokensUsed)}/${formatTokens(state.tokenLimit)}`
      : formatTokens(state.tokensUsed),
    color: theme.textPrimary,
    required: true,
  })

  if (state.modelName) {
    segs.push({ key: 'model', label: '', value: state.modelName, color: theme.accent })
  }

  if (state.cost !== undefined) {
    segs.push({ key: 'cost', label: '', value: formatCost(state.cost), color: theme.success })
  }

  if (state.gitBranch) {
    segs.push({ key: 'git', label: '⎇', value: state.gitBranch, color: theme.textSecondary })
  }

  if (state.contextLimit && state.contextUsed !== undefined) {
    const pct = Math.round((state.contextUsed / state.contextLimit) * 100)
    segs.push({
      key: 'ctx',
      label: 'ctx',
      value: `${pct}%`,
      color: pct > 80 ? theme.error : pct > 60 ? theme.warning : theme.textSecondary,
    })
  }

  if (state.backgroundTasks && state.backgroundTasks > 0) {
    segs.push({
      key: 'bg',
      label: 'bg',
      value: String(state.backgroundTasks),
      color: theme.info,
    })
  }

  if (state.mode) {
    segs.push({ key: 'mode', label: '', value: state.mode, color: theme.textMuted })
  }

  return segs
}

function segmentLength(seg: StatusSegment): number {
  const labelPart = seg.label ? seg.label.length + 1 : 0
  return labelPart + seg.value.length + 2
}

export function selectVisibleSegments(segments: StatusSegment[], width: number): StatusSegment[] {
  const required = segments.filter((s) => s.required)
  const optional = segments.filter((s) => !s.required)
  const chosen = [...required]
  let used = chosen.reduce((sum, s) => sum + segmentLength(s), 0)
  if (chosen.length > 1) used += chosen.length - 1

  for (const seg of optional) {
    const len = segmentLength(seg)
    const extra = chosen.length > 0 ? 1 : 0
    if (used + extra + len <= width) {
      chosen.push(seg)
      used += extra + len
    }
  }
  return chosen
}

export interface StatusBarProps {
  themeColors: ThemeColors
  state: StatusBarState
  width?: number
}

export function StatusBar({ themeColors, state, width }: StatusBarProps) {
  const stdout = useStdout()
  const maxWidth = width ?? stdout?.stdout?.columns ?? 80
  const segments = buildStatusBarSegments(state, themeColors)
  const visible = selectVisibleSegments(segments, maxWidth)

  return (
    <Box
      flexDirection="row"
      // @ts-ignore runtime-only prop works in Ink
      borderStyle="single"
      // @ts-ignore runtime-only prop works in Ink
      borderTop
      // @ts-ignore runtime-only prop works in Ink
      borderColor={themeColors.border}
      // @ts-ignore runtime-only prop works in Ink
      paddingX={1}
    >
      {visible.map((seg, i) => (
        <React.Fragment key={seg.key}>
          {i > 0 ? <Text color={themeColors.textMuted}> </Text> : null}
          <Text color={seg.color}>
            {seg.label ? `${seg.label} ` : ''}
            {seg.value}
          </Text>
        </React.Fragment>
      ))}
    </Box>
  )
}

export default StatusBar
