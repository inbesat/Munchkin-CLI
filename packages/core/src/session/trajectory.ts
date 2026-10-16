import type { SessionEvent } from '../events/types'

export type TrajectoryStepKind =
  | 'created'
  | 'user'
  | 'assistant'
  | 'tool_call'
  | 'tool_result'
  | 'error'
  | 'compaction'
  | 'ended'

export interface TrajectoryStep {
  /** 1-based position in the trajectory. */
  index: number
  kind: TrajectoryStepKind
  /** Agent turn: starts at 1, increments on each user message. */
  turn: number
  /** One-line summary. */
  title: string
  /** Full payload (message text, JSON args, result). */
  detail?: string
  /** Short annotation, e.g. duration or severity. */
  meta?: string
}

const TITLE_MAX = 100

function firstLine(content: string): string {
  const line = content.split('\n').find((l) => l.trim().length > 0) ?? '(empty)'
  return line.length > TITLE_MAX ? `${line.slice(0, TITLE_MAX - 1)}…` : line
}

/**
 * Phase 144: turn a session event log into an ordered, turn-numbered list of
 * steps for the trajectory browser - each decision, tool call, and result.
 */
export function buildTrajectory(events: SessionEvent[]): TrajectoryStep[] {
  const steps: TrajectoryStep[] = []
  let turn = 0
  for (const event of events) {
    if (event.type === 'session.message' && event.payload.role === 'user') turn += 1
    steps.push(toStep(event, steps.length + 1, Math.max(turn, 1)))
  }
  return steps
}

function toStep(event: SessionEvent, index: number, turn: number): TrajectoryStep {
  switch (event.type) {
    case 'session.created': {
      const { title, model, cwd } = event.payload
      return {
        index,
        kind: 'created',
        turn,
        title: 'Session created',
        detail: [title, model, cwd]
          .filter((v) => v !== undefined && v !== null && v !== '')
          .join(' · '),
      }
    }
    case 'session.message': {
      const { role, content, tokens } = event.payload
      return {
        index,
        kind: role === 'user' ? 'user' : 'assistant',
        turn,
        title: firstLine(content),
        detail: content,
        ...(tokens !== undefined ? { meta: `${tokens.input} in / ${tokens.output} out` } : {}),
      }
    }
    case 'session.tool_call':
      return {
        index,
        kind: 'tool_call',
        turn,
        title: `Tool call: ${event.payload.toolName}`,
        detail: JSON.stringify(event.payload.args, null, 2) ?? '',
      }
    case 'session.tool_result': {
      const { toolName, result, error, durationMs } = event.payload
      const meta = [
        durationMs !== undefined ? `${durationMs}ms` : undefined,
        error !== undefined ? 'error' : undefined,
      ]
        .filter((v) => v !== undefined)
        .join(' · ')
      return {
        index,
        kind: 'tool_result',
        turn,
        title: `Tool result: ${toolName}`,
        detail: error ?? JSON.stringify(result, null, 2) ?? String(result),
        ...(meta.length > 0 ? { meta } : {}),
      }
    }
    case 'session.error':
      return {
        index,
        kind: 'error',
        turn,
        title: `Error [${event.payload.code}]`,
        detail:
          event.payload.recovery !== undefined && event.payload.recovery !== null
            ? `${event.payload.message}\nRecovery: ${event.payload.recovery}`
            : event.payload.message,
        meta: event.payload.severity,
      }
    case 'session.compaction':
      return {
        index,
        kind: 'compaction',
        turn,
        title: 'Compaction',
        detail: `${event.payload.beforeCount} → ${event.payload.afterCount} messages`,
        meta: `${event.payload.tokensSaved} tokens saved`,
      }
    case 'session.ended':
      return {
        index,
        kind: 'ended',
        turn,
        title: 'Session ended',
        detail: event.payload.reason,
        ...(event.payload.totalCost !== undefined
          ? { meta: `$${event.payload.totalCost.toFixed(4)}` }
          : {}),
      }
  }
}
