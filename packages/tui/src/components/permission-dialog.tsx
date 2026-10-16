import { Box, Text, useInput } from 'ink'
import { useEffect, useState } from 'react'
import type { ThemeColors } from '../theme'

export type PermissionDecision = 'allow' | 'ask' | 'deny'

export interface PermissionRequest {
  id: string
  tool: { name: string; description?: string }
  args: Record<string, unknown>
  category: string
  sessionId: string
  permissionMode: string
  riskLevel?: 'low' | 'medium' | 'high' | 'critical'
  riskReason?: string
  isRetry?: boolean
}

export interface PermissionResponse {
  requestId: string
  decision: PermissionDecision
  remember?: boolean
  customRule?: { target: string; condition?: (args: Record<string, unknown>) => boolean }
  message?: string
}

export type PermissionChoice = 'allow' | 'allow-session' | 'allow-always' | 'deny' | 'deny-always'

function truncate(value: unknown, max = 120): string {
  if (typeof value !== 'string') return JSON.stringify(value)
  return value.length > max ? value.slice(0, max) + '…' : value
}

function argValue(v: unknown): string {
  return truncate(v, 200)
}

export function describeRequest(req: PermissionRequest): string {
  const name = req.tool.name.toLowerCase()
  const a = req.args
  if (name === 'bash' || name === 'shell' || name === 'terminal') {
    return `Run shell command: ${typeof a.command === 'string' ? a.command : '(unknown command)'}`
  }
  if (name === 'read') return `Read file: ${argValue(a.path ?? a.file)}`
  if (name === 'write') return `Write file: ${argValue(a.path ?? a.file)}`
  if (name === 'edit') return `Edit file: ${argValue(a.path ?? a.file)}`
  if (name === 'web_fetch' || name === 'webfetch') return `Fetch URL: ${argValue(a.url)}`
  if (name === 'web_search' || name === 'websearch') return `Web search: ${argValue(a.query)}`
  if (name === 'glob') return `Glob pattern: ${argValue(a.pattern)}`
  if (name === 'grep') {
    return `Grep pattern: ${argValue(a.pattern ?? a.regex)}`
  }
  const entries = Object.entries(a)
    .slice(0, 4)
    .map(([k, v]) => `${k}=${truncate(v, 60)}`)
  return entries.length ? `Arguments: ${entries.join(', ')}` : 'No arguments'
}

export function resolveFromChoice(
  req: PermissionRequest,
  choice: PermissionChoice,
): PermissionResponse {
  const base: PermissionResponse = { requestId: req.id, decision: 'allow' }
  switch (choice) {
    case 'allow':
      return { ...base, decision: 'allow', remember: false }
    case 'allow-session':
      return { ...base, decision: 'allow', remember: true, message: 'allow-for-session' }
    case 'allow-always':
      return {
        ...base,
        decision: 'allow',
        remember: true,
        customRule: { target: req.tool.name },
        message: 'allow-always',
      }
    case 'deny':
      return { ...base, decision: 'deny', remember: false }
    case 'deny-always':
      return {
        ...base,
        decision: 'deny',
        remember: true,
        customRule: { target: req.tool.name },
        message: 'deny-always',
      }
  }
}

export function riskColor(
  theme: ThemeColors,
  level?: 'low' | 'medium' | 'high' | 'critical',
): string {
  switch (level) {
    case 'low':
      return theme.success
    case 'medium':
      return theme.warning
    case 'high':
      return theme.error
    case 'critical':
      return theme.error
    default:
      return theme.textMuted
  }
}

interface DialogKey {
  ctrl: boolean
  return: boolean
  escape: boolean
  upArrow: boolean
  downArrow: boolean
  [key: string]: unknown
}

export interface PermissionDialogProps {
  themeColors: ThemeColors
  request: PermissionRequest | null
  isOpen: boolean
  isActive?: boolean
  onResolve: (response: PermissionResponse) => void
  showRisk?: boolean
  showArgs?: boolean
  allowRemember?: boolean
}

export function PermissionDialog({
  themeColors,
  request,
  isOpen,
  isActive = true,
  onResolve,
  showRisk = true,
  showArgs = true,
  allowRemember = true,
}: PermissionDialogProps) {
  const buildOptions = (): Array<{
    key: string
    choice: PermissionChoice
    label: string
    danger: boolean
  }> => {
    const opts: Array<{ key: string; choice: PermissionChoice; label: string; danger: boolean }> =
      []
    opts.push({ key: 'a', choice: 'allow', label: 'Allow (once)', danger: false })
    if (allowRemember)
      opts.push({
        key: 's',
        choice: 'allow-session',
        label: 'Allow for this session',
        danger: false,
      })
    if (allowRemember)
      opts.push({
        key: 'A',
        choice: 'allow-always',
        label: `Allow always (${request?.tool.name ?? 'this tool'})`,
        danger: false,
      })
    opts.push({ key: 'd', choice: 'deny', label: 'Deny', danger: true })
    if (allowRemember)
      opts.push({
        key: 'D',
        choice: 'deny-always',
        label: `Deny always (${request?.tool.name ?? 'this tool'})`,
        danger: true,
      })
    return opts
  }

  const options = isOpen && request ? buildOptions() : []
  const [selected, setSelected] = useState(0)

  useEffect(() => {
    setSelected(0)
  }, [request?.id, isOpen])

  useInput(
    (input, rawKey) => {
      if (!request) return
      const key = rawKey as unknown as DialogKey
      if (key.escape) {
        onResolve(resolveFromChoice(request, 'deny'))
        return
      }
      if (key.upArrow) {
        setSelected((i) => (options.length === 0 ? 0 : (i - 1 + options.length) % options.length))
        return
      }
      if (key.downArrow) {
        setSelected((i) => (options.length === 0 ? 0 : (i + 1) % options.length))
        return
      }
      if (key.return) {
        const opt = options[selected]
        if (opt) onResolve(resolveFromChoice(request, opt.choice))
        return
      }
      const direct = options.find((o) => o.key === input)
      if (direct) {
        onResolve(resolveFromChoice(request, direct.choice))
      }
    },
    { isActive: isActive && isOpen },
  )

  if (!isOpen || !request) return null

  const risk = request.riskLevel
  const argEntries = Object.entries(request.args).slice(0, 6)

  return (
    <Box
      flexDirection="column"
      // @ts-ignore runtime-only prop works in Ink
      borderStyle="round"
      // @ts-ignore runtime-only prop works in Ink
      borderColor={risk === 'high' || risk === 'critical' ? themeColors.error : themeColors.warning}
      paddingX={1}
      marginBottom={1}
    >
      <Box marginBottom={1}>
        <Text color={themeColors.warning} bold>
          {' ⚠ Permission required '}
        </Text>
        {request.isRetry ? <Text color={themeColors.error}> (retry after denial)</Text> : null}
      </Box>

      <Box marginBottom={1} flexDirection="column">
        <Box>
          <Text color={themeColors.textMuted}>Tool: </Text>
          <Text color={themeColors.textPrimary} bold>
            {request.tool.name}
          </Text>
          {request.tool.description ? (
            <Text color={themeColors.textSecondary}> — {request.tool.description}</Text>
          ) : null}
        </Box>
        <Box>
          <Text color={themeColors.textMuted}>Wants to: </Text>
          <Text color={themeColors.textPrimary}>{describeRequest(request)}</Text>
        </Box>
        {showRisk && risk ? (
          <Box>
            <Text color={themeColors.textMuted}>Risk: </Text>
            <Text color={riskColor(themeColors, risk)} bold>
              {risk.toUpperCase()}
            </Text>
            {request.riskReason ? (
              <Text color={themeColors.textSecondary}> — {request.riskReason}</Text>
            ) : null}
          </Box>
        ) : null}
      </Box>

      {showArgs && argEntries.length > 0 ? (
        <Box flexDirection="column" marginBottom={1}>
          <Text color={themeColors.textMuted}>Arguments:</Text>
          {argEntries.map(([k, v]) => (
            <Text key={k} color={themeColors.textSecondary}>
              {'  '}
              {k}: {truncate(v, 100)}
            </Text>
          ))}
        </Box>
      ) : null}

      <Box flexDirection="column" marginBottom={1}>
        {options.map((o, i) => {
          const isSel = i === selected
          return (
            <Box key={o.key} flexDirection="row">
              <Text color={isSel ? themeColors.background : themeColors.textMuted}>
                {isSel ? '▶' : ' '}
              </Text>
              <Box
                // @ts-ignore runtime-only prop works in Ink
                backgroundColor={
                  isSel ? (o.danger ? themeColors.error : themeColors.primary) : undefined
                }
                flexGrow={1}
              >
                <Text
                  color={
                    isSel
                      ? themeColors.background
                      : o.danger
                        ? themeColors.error
                        : themeColors.textPrimary
                  }
                >
                  {' '}
                  [{o.key}] {o.label}
                </Text>
              </Box>
            </Box>
          )
        })}
      </Box>

      <Box>
        <Text color={themeColors.textMuted}>↑/↓ select · Enter confirm · Esc deny</Text>
      </Box>
    </Box>
  )
}

export default PermissionDialog
