export const SCHEMA_VERSION = 1

export type EventType =
  | 'session.created'
  | 'session.message'
  | 'session.tool_call'
  | 'session.tool_result'
  | 'session.error'
  | 'session.compaction'
  | 'session.ended'

export interface EventBase {
  id: string
  sessionId: string
  timestamp: number
  schemaVersion: number
}

export interface SessionCreatedEvent extends EventBase {
  type: 'session.created'
  payload: {
    title?: string
    model: string
    cwd: string
  }
}

export interface SessionMessageEvent extends EventBase {
  type: 'session.message'
  payload: {
    role: 'user' | 'assistant'
    content: string
    tokens?: { input: number; output: number }
  }
}

export interface SessionToolCallEvent extends EventBase {
  type: 'session.tool_call'
  payload: {
    toolCallId: string
    toolName: string
    args: Record<string, unknown>
  }
}

export interface SessionToolResultEvent extends EventBase {
  type: 'session.tool_result'
  payload: {
    toolCallId: string
    toolName: string
    result: unknown
    error?: string
    durationMs?: number
  }
}

export interface SessionErrorEvent extends EventBase {
  type: 'session.error'
  payload: {
    code: string
    message: string
    severity: 'info' | 'warn' | 'error' | 'fatal'
    recovery?: string | null
  }
}

export interface SessionCompactionEvent extends EventBase {
  type: 'session.compaction'
  payload: {
    beforeCount: number
    afterCount: number
    summary: string
    tokensSaved: number
  }
}

export interface SessionEndedEvent extends EventBase {
  type: 'session.ended'
  payload: {
    reason: 'user' | 'error' | 'max_iterations' | 'compaction'
    totalTokens?: { input: number; output: number }
    totalCost?: number
  }
}

export type SessionEvent =
  | SessionCreatedEvent
  | SessionMessageEvent
  | SessionToolCallEvent
  | SessionToolResultEvent
  | SessionErrorEvent
  | SessionCompactionEvent
  | SessionEndedEvent
