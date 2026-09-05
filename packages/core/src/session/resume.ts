import { SessionLog } from '../events'

export interface ConversationMessage {
  role: 'user' | 'assistant'
  content: string
  tokens?: { input: number; output: number }
}

export interface PendingToolCall {
  toolCallId: string
  toolName: string
  args: Record<string, unknown>
  calledAt: number
}

export interface ToolCallRecord {
  toolCallId: string
  toolName: string
  args: Record<string, unknown>
  result?: unknown
  error?: string
  durationMs?: number
  calledAt: number
  completedAt?: number
}

export interface ResumedSession {
  sessionId: string
  model: string
  cwd: string
  title?: string
  messages: ConversationMessage[]
  pendingToolCalls: PendingToolCall[]
  completedToolCalls: ToolCallRecord[]
  errors: Array<{ code: string; message: string; severity: string; timestamp: number }>
  compactions: Array<{ summary: string; tokensSaved: number; timestamp: number }>
  lastEventTimestamp: number
  eventCount: number
  totalTokens: { input: number; output: number }
  ended: boolean
}

export interface ResumeOptions {
  baseDir: string
  sessionId: string
}

export async function resumeSession(options: ResumeOptions): Promise<ResumedSession | null> {
  const log = new SessionLog(options.baseDir, options.sessionId)
  if (!(await log.exists())) return null

  const messages: ConversationMessage[] = []
  const pendingToolCalls: PendingToolCall[] = []
  const completedToolCalls: ToolCallRecord[] = []
  const errors: ResumedSession['errors'] = []
  const compactions: ResumedSession['compactions'] = []

  let model = ''
  let cwd = ''
  let title: string | undefined
  let lastEventTimestamp = 0
  let eventCount = 0
  let totalInput = 0
  let totalOutput = 0
  let ended = false

  const toolCallMap = new Map<string, ToolCallRecord>()

  for await (const event of log.iterate()) {
    eventCount++
    lastEventTimestamp = Math.max(lastEventTimestamp, event.timestamp)

    switch (event.type) {
      case 'session.created':
        model = event.payload.model
        cwd = event.payload.cwd
        title = event.payload.title
        break

      case 'session.message':
        messages.push({
          role: event.payload.role,
          content: event.payload.content,
          tokens: event.payload.tokens,
        })
        if (event.payload.tokens) {
          totalInput += event.payload.tokens.input
          totalOutput += event.payload.tokens.output
        }
        break

      case 'session.tool_call': {
        const record: ToolCallRecord = {
          toolCallId: event.payload.toolCallId,
          toolName: event.payload.toolName,
          args: event.payload.args,
          calledAt: event.timestamp,
        }
        toolCallMap.set(event.payload.toolCallId, record)
        break
      }

      case 'session.tool_result': {
        const existing = toolCallMap.get(event.payload.toolCallId)
        if (existing) {
          existing.result = event.payload.result
          existing.error = event.payload.error
          existing.durationMs = event.payload.durationMs
          existing.completedAt = event.timestamp
        } else {
          const orphanRecord: ToolCallRecord = {
            toolCallId: event.payload.toolCallId,
            toolName: event.payload.toolName,
            args: {},
            result: event.payload.result,
            error: event.payload.error,
            durationMs: event.payload.durationMs,
            calledAt: event.timestamp,
            completedAt: event.timestamp,
          }
          toolCallMap.set(event.payload.toolCallId, orphanRecord)
        }
        break
      }

      case 'session.error':
        errors.push({
          code: event.payload.code,
          message: event.payload.message,
          severity: event.payload.severity,
          timestamp: event.timestamp,
        })
        break

      case 'session.compaction':
        compactions.push({
          summary: event.payload.summary,
          tokensSaved: event.payload.tokensSaved,
          timestamp: event.timestamp,
        })
        break

      case 'session.ended':
        ended = true
        if (event.payload.totalTokens) {
          totalInput = event.payload.totalTokens.input
          totalOutput = event.payload.totalTokens.output
        }
        break
    }
  }

  if (eventCount === 0) return null

  for (const record of toolCallMap.values()) {
    if (record.completedAt) {
      completedToolCalls.push(record)
    } else {
      pendingToolCalls.push({
        toolCallId: record.toolCallId,
        toolName: record.toolName,
        args: record.args,
        calledAt: record.calledAt,
      })
    }
  }

  return {
    sessionId: options.sessionId,
    model,
    cwd,
    title,
    messages,
    pendingToolCalls,
    completedToolCalls,
    errors,
    compactions,
    lastEventTimestamp,
    eventCount,
    totalTokens: { input: totalInput, output: totalOutput },
    ended,
  }
}

export function hasIncompleteToolCalls(session: ResumedSession): boolean {
  return session.pendingToolCalls.length > 0
}

export function getResumePoint(session: ResumedSession): {
  canResume: boolean
  reason: string
} {
  if (session.ended) {
    return { canResume: false, reason: 'Session has already ended' }
  }

  if (session.pendingToolCalls.length > 0) {
    return {
      canResume: true,
      reason: `${session.pendingToolCalls.length} incomplete tool call(s) need resolution`,
    }
  }

  const lastMessage = session.messages[session.messages.length - 1]
  if (lastMessage?.role === 'user') {
    return { canResume: true, reason: 'Last message is from user, assistant response pending' }
  }

  if (lastMessage?.role === 'assistant') {
    return { canResume: true, reason: 'Session interrupted after assistant response' }
  }

  return { canResume: true, reason: 'Session can be resumed' }
}
