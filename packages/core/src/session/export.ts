import { SessionLog } from '../events'
import type { SessionEvent } from '../events'

export type ExportFormat = 'markdown' | 'json' | 'text'

export interface ExportOptions {
  baseDir: string
  sessionId: string
  format: ExportFormat
  includeMetadata?: boolean
  includeToolCalls?: boolean
  includeErrors?: boolean
}

export interface ExportResult {
  content: string
  format: ExportFormat
  sessionId: string
  eventCount: number
  messageCount: number
}

export async function exportSession(options: ExportOptions): Promise<ExportResult> {
  const log = new SessionLog(options.baseDir, options.sessionId)
  const events: SessionEvent[] = []

  for await (const event of log.iterate()) {
    events.push(event)
  }

  if (events.length === 0) {
    throw new Error(`Session '${options.sessionId}' not found or empty`)
  }

  const messages = events.filter((e) => e.type === 'session.message')
  const includeToolCalls = options.includeToolCalls ?? true
  const includeErrors = options.includeErrors ?? true
  const includeMetadata = options.includeMetadata ?? true

  let content: string

  switch (options.format) {
    case 'markdown':
      content = toMarkdown(events, { includeMetadata, includeToolCalls, includeErrors })
      break
    case 'json':
      content = toJSON(events)
      break
    case 'text':
      content = toText(events, { includeMetadata, includeToolCalls, includeErrors })
      break
  }

  return {
    content,
    format: options.format,
    sessionId: options.sessionId,
    eventCount: events.length,
    messageCount: messages.length,
  }
}

function toMarkdown(
  events: SessionEvent[],
  opts: { includeMetadata: boolean; includeToolCalls: boolean; includeErrors: boolean },
): string {
  const lines: string[] = []
  const created = events.find((e) => e.type === 'session.created') as
    | { payload: { title?: string; model: string } }
    | undefined

  if (opts.includeMetadata && created) {
    lines.push(`# ${created.payload.title ?? 'Untitled Session'}`)
    lines.push('')
    lines.push(`**Model:** ${created.payload.model}`)
    lines.push(`**Events:** ${events.length}`)
    lines.push('')
    lines.push('---')
    lines.push('')
  }

  for (const event of events) {
    switch (event.type) {
      case 'session.message': {
        const role = event.payload.role === 'user' ? '**User**' : '**Assistant**'
        lines.push(`### ${role}`)
        lines.push('')
        lines.push(event.payload.content)
        lines.push('')
        if (event.payload.tokens) {
          lines.push(
            `_Tokens: ${event.payload.tokens.input} in / ${event.payload.tokens.output} out_`,
          )
          lines.push('')
        }
        break
      }

      case 'session.tool_call': {
        if (opts.includeToolCalls) {
          lines.push(`> **Tool Call:** \`${event.payload.toolName}\``)
          lines.push('> ```json')
          lines.push(`> ${JSON.stringify(event.payload.args, null, 2)}`)
          lines.push('> ```')
          lines.push('')
        }
        break
      }

      case 'session.tool_result': {
        if (opts.includeToolCalls) {
          const status = event.payload.error ? `❌ ${event.payload.error}` : '✅'
          lines.push(`> **Tool Result:** ${status}`)
          if (event.payload.durationMs) {
            lines.push(`> _Duration: ${event.payload.durationMs}ms_`)
          }
          lines.push('')
        }
        break
      }

      case 'session.error': {
        if (opts.includeErrors) {
          lines.push(`> ⚠️ **Error [${event.payload.code}]:** ${event.payload.message}`)
          if (event.payload.recovery) {
            lines.push(`> _Recovery: ${event.payload.recovery}_`)
          }
          lines.push('')
        }
        break
      }

      case 'session.compaction': {
        lines.push(
          `> 📦 **Compaction:** ${event.payload.beforeCount} → ${event.payload.afterCount} messages (${event.payload.tokensSaved} tokens saved)`,
        )
        lines.push('')
        break
      }
    }
  }

  const ended = events.find((e) => e.type === 'session.ended') as
    | { payload: { reason: string; totalCost?: number } }
    | undefined

  if (ended) {
    lines.push('---')
    lines.push('')
    lines.push(`**Session ended:** ${ended.payload.reason}`)
    if (ended.payload.totalCost !== undefined) {
      lines.push(`**Total cost:** $${ended.payload.totalCost.toFixed(4)}`)
    }
  }

  return lines.join('\n')
}

function toJSON(events: SessionEvent[]): string {
  return JSON.stringify(
    {
      schemaVersion: events[0]?.schemaVersion ?? 1,
      events,
    },
    null,
    2,
  )
}

function toText(
  events: SessionEvent[],
  opts: { includeMetadata: boolean; includeToolCalls: boolean; includeErrors: boolean },
): string {
  const lines: string[] = []
  const created = events.find((e) => e.type === 'session.created') as
    | { payload: { title?: string; model: string } }
    | undefined

  if (opts.includeMetadata && created) {
    lines.push(`Session: ${created.payload.title ?? 'Untitled'}`)
    lines.push(`Model: ${created.payload.model}`)
    lines.push(`Events: ${events.length}`)
    lines.push('='.repeat(40))
    lines.push('')
  }

  for (const event of events) {
    switch (event.type) {
      case 'session.message': {
        const role = event.payload.role.toUpperCase()
        lines.push(`[${role}]`)
        lines.push(event.payload.content)
        lines.push('')
        break
      }

      case 'session.tool_call': {
        if (opts.includeToolCalls) {
          lines.push(`  >> Tool: ${event.payload.toolName}`)
          lines.push(`  >> Args: ${JSON.stringify(event.payload.args)}`)
          lines.push('')
        }
        break
      }

      case 'session.tool_result': {
        if (opts.includeToolCalls) {
          const status = event.payload.error ? `ERR: ${event.payload.error}` : 'OK'
          lines.push(`  << Result: ${status}`)
          if (event.payload.durationMs) {
            lines.push(`  << Duration: ${event.payload.durationMs}ms`)
          }
          lines.push('')
        }
        break
      }

      case 'session.error': {
        if (opts.includeErrors) {
          lines.push(`  !! Error [${event.payload.code}]: ${event.payload.message}`)
          lines.push('')
        }
        break
      }

      case 'session.compaction': {
        lines.push(
          `  -- Compaction: ${event.payload.beforeCount} -> ${event.payload.afterCount} messages`,
        )
        lines.push('')
        break
      }
    }
  }

  const ended = events.find((e) => e.type === 'session.ended') as
    | { payload: { reason: string; totalCost?: number } }
    | undefined

  if (ended) {
    lines.push('='.repeat(40))
    lines.push(`Ended: ${ended.payload.reason}`)
    if (ended.payload.totalCost !== undefined) {
      lines.push(`Cost: $${ended.payload.totalCost.toFixed(4)}`)
    }
  }

  return lines.join('\n')
}
