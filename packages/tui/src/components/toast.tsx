import { Box, Text } from 'ink'
import { useEffect, useRef } from 'react'
import type { ThemeColors } from '../theme'

export type ToastKind = 'success' | 'error' | 'info' | 'warning'

export interface Toast {
  id: string
  kind: ToastKind
  message: string
  duration?: number
}

export function toastColor(theme: ThemeColors, kind: ToastKind): string {
  switch (kind) {
    case 'success':
      return theme.success
    case 'error':
      return theme.error
    case 'warning':
      return theme.warning
    case 'info':
    default:
      return theme.info
  }
}

export function toastLabel(kind: ToastKind): string {
  switch (kind) {
    case 'success':
      return '✓'
    case 'error':
      return '✗'
    case 'warning':
      return '!'
    case 'info':
    default:
      return 'i'
  }
}

export interface ToastProps {
  themeColors: ThemeColors
  toast: Toast
}

export function Toast({ themeColors, toast }: ToastProps) {
  const color = toastColor(themeColors, toast.kind)
  return (
    <Box
      flexDirection="row"
      // @ts-ignore runtime-only prop works in Ink
      borderStyle="round"
      // @ts-ignore runtime-only prop works in Ink
      borderColor={color}
      // @ts-ignore runtime-only prop works in Ink
      paddingX={1}
    >
      <Text color={color} bold>
        {` ${toastLabel(toast.kind)} `}
      </Text>
      <Text color={themeColors.textPrimary}>{toast.message}</Text>
    </Box>
  )
}

export interface ToastContainerProps {
  themeColors: ThemeColors
  toasts: Toast[]
  onDismiss: (id: string) => void
  autoDismissMs?: number
  maxVisible?: number
}

export function ToastContainer({
  themeColors,
  toasts,
  onDismiss,
  autoDismissMs = 4000,
  maxVisible = 4,
}: ToastContainerProps) {
  const scheduled = useRef<Set<string>>(new Set())
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  useEffect(() => {
    const pending = toasts.filter((t) => !scheduled.current.has(t.id))
    for (const t of pending) {
      scheduled.current.add(t.id)
      const delay = t.duration ?? autoDismissMs
      const handle = setTimeout(() => {
        onDismiss(t.id)
        scheduled.current.delete(t.id)
        timers.current.delete(t.id)
      }, delay)
      timers.current.set(t.id, handle)
    }
    return () => {
      for (const handle of timers.current.values()) clearTimeout(handle)
      timers.current.clear()
    }
  }, [toasts, autoDismissMs, onDismiss])

  const visible = toasts.slice(-maxVisible)
  return (
    <Box flexDirection="column" alignItems="flex-end">
      {visible.map((t) => (
        <Toast key={t.id} themeColors={themeColors} toast={t} />
      ))}
    </Box>
  )
}

export default ToastContainer
