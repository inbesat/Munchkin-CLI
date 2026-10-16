import { Box, Text } from 'ink'
import { useEffect, useState } from 'react'
import type { ThemeColors } from '../theme'

const DEFAULT_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

export function spinnerFrame(tick: number, frames: string[] = DEFAULT_FRAMES): string {
  if (frames.length === 0) return ''
  const idx = ((tick % frames.length) + frames.length) % frames.length
  return frames[idx]
}

export function clampRatio(ratio: number): number {
  if (Number.isNaN(ratio)) return 0
  if (ratio < 0) return 0
  if (ratio > 1) return 1
  return ratio
}

export function renderProgressBar(ratio: number, width = 20, fill = '█', empty = '░'): string {
  const r = clampRatio(ratio)
  const filled = Math.round(r * width)
  return fill.repeat(filled) + empty.repeat(Math.max(0, width - filled))
}

export function renderIndeterminate(tick: number, width = 20, block = 4): string {
  const pos = ((tick % (width + block)) + (width + block)) % (width + block)
  const chars = Array.from({ length: width }, () => '░')
  for (let i = 0; i < block; i++) {
    const idx = pos - i
    if (idx >= 0 && idx < width) chars[idx] = '█'
  }
  return chars.join('')
}

export interface SpinnerProps {
  themeColors: ThemeColors
  label?: string
  frames?: string[]
  color?: string
  active?: boolean
}

export function Spinner({
  themeColors,
  label,
  frames = DEFAULT_FRAMES,
  color,
  active = true,
}: SpinnerProps) {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!active) return
    const handle = setInterval(() => setTick((t) => t + 1), 100)
    return () => clearInterval(handle)
  }, [active])

  const frame = spinnerFrame(tick, frames)
  const frameColor = color ?? themeColors.info
  return (
    <Box flexDirection="row">
      <Text color={frameColor}>{frame} </Text>
      {label ? <Text color={themeColors.textSecondary}>{label}</Text> : null}
    </Box>
  )
}

export interface ProgressBarProps {
  themeColors: ThemeColors
  ratio: number
  width?: number
  label?: string
  color?: string
}

export function ProgressBar({ themeColors, ratio, width = 20, label, color }: ProgressBarProps) {
  const r = clampRatio(ratio)
  const bar = renderProgressBar(r, width)
  const barColor = color ?? (r >= 1 ? themeColors.success : themeColors.primary)
  return (
    <Box flexDirection="column">
      {label ? <Text color={themeColors.textSecondary}>{label}</Text> : null}
      <Box flexDirection="row">
        <Text color={barColor}>{bar}</Text>
        <Text color={themeColors.textMuted}> {Math.round(r * 100)}%</Text>
      </Box>
    </Box>
  )
}

export interface LoadingDotsProps {
  themeColors: ThemeColors
  label?: string
  active?: boolean
}

export function LoadingDots({ themeColors, label, active = true }: LoadingDotsProps) {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!active) return
    const handle = setInterval(() => setTick((t) => t + 1), 400)
    return () => clearInterval(handle)
  }, [active])
  const dots = '.'.repeat((tick % 3) + 1)
  return (
    <Box flexDirection="row">
      {label ? <Text color={themeColors.textSecondary}>{label}</Text> : null}
      <Text color={themeColors.textMuted}>{dots.padEnd(3, ' ')}</Text>
    </Box>
  )
}

export default Spinner
