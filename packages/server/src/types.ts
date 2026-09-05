export interface SessionCreateRequest {
  cwd: string
  model?: string
  title?: string
  parentSessionId?: string
}

export interface SessionResponse {
  id: string
  title?: string
  model: string
  cwd: string
  createdAt: number
  updatedAt: number
  endedAt?: number
  eventCount: number
  inputTokens: number
  outputTokens: number
  totalCost: number
  status: 'active' | 'completed' | 'errored'
}

export interface PromptRequest {
  prompt: string
  model?: string
  systemPrompt?: string
  tools?: string[]
  maxIterations?: number
}

export interface PromptResponse {
  sessionId: string
  response: string
  usage: {
    input: number
    output: number
    total: number
    cacheRead?: number
    cacheWrite?: number
  }
  turns: number
  reason: 'complete' | 'max-iterations' | 'cancelled' | 'context-overflow' | 'error'
  error?: string
}

export interface ToolExecuteRequest {
  name: string
  args: Record<string, unknown>
}

export interface ToolExecuteResponse {
  result: string
  error?: string
  durationMs: number
}

export interface ConfigRequest {
  key: string
  value: unknown
}

export interface ConfigResponse {
  key: string
  value: unknown
}

export interface ErrorResponse {
  error: {
    code: string
    message: string
    details?: unknown
  }
}

export interface SSEEvent {
  event: string
  data: string
  id?: string
  retry?: number
}

export type LoopEventType =
  | 'turn'
  | 'text'
  | 'thinking'
  | 'tool-call-delta'
  | 'tool-call'
  | 'tool-result'
  | 'usage'
  | 'finish'
  | 'error'
  | 'steering-injected'

declare module 'hono' {
  interface ContextVariableMap {
    validatedData: unknown
    requestId: string
  }
}