export interface ModelCapabilities {
  readonly text: boolean
  readonly thinking: boolean
  readonly toolCalls: boolean
  readonly structuredOutput: boolean
  readonly vision: boolean
  readonly pdf: boolean
  readonly maxTokens: number
  readonly contextWindow: number
}

export interface ModelCostConfig {
  readonly inputPerToken: number
  readonly outputPerToken: number
  readonly cacheReadPerToken?: number
  readonly cacheWritePerToken?: number
}

export interface ModelConfig {
  readonly id: string
  readonly provider: string
  readonly name: string
  readonly displayName: string
  readonly capabilities: ModelCapabilities
  readonly cost: ModelCostConfig
  readonly defaultMaxTokens?: number
  readonly supportsCacheControl?: boolean
}

export interface TokenUsage {
  readonly input: number
  readonly output: number
  readonly cacheRead?: number
  readonly cacheWrite?: number
  readonly total: number
}

export interface ToolCall {
  readonly id: string
  readonly name: string
  readonly args: Record<string, unknown>
}

export interface ToolResult {
  readonly toolCallId: string
  readonly toolName: string
  readonly result: string
  readonly error?: string
  readonly durationMs: number
}

export interface ToolDefinition {
  readonly name: string
  readonly description: string
  readonly parameters: Record<string, unknown>
}

export type FinishReason = 'stop' | 'tool-call' | 'length' | 'abort' | 'error'

export interface ModelMessage {
  readonly role: 'user' | 'assistant' | 'system'
  readonly content: string
  readonly toolCalls?: readonly ToolCall[]
  readonly toolResults?: readonly ToolResult[]
}

export interface GenerateOptions {
  readonly messages: readonly ModelMessage[]
  readonly tools?: readonly ToolDefinition[]
  readonly system?: string
  readonly maxTokens?: number
  readonly temperature?: number
  readonly thinking?: boolean | { budgetTokens?: number }
  readonly abortSignal?: AbortSignal
}

export interface GenerateResult {
  readonly content: string
  readonly toolCalls: readonly ToolCall[]
  readonly thinking?: string
  readonly usage: TokenUsage
  readonly finishReason: FinishReason
  readonly model: string
  readonly provider: string
}

export type StreamChunk =
  | { readonly type: 'text-delta'; readonly delta: string }
  | { readonly type: 'thinking-delta'; readonly delta: string }
  | { readonly type: 'tool-call'; readonly toolCall: ToolCall }
  | { readonly type: 'tool-call-delta'; readonly toolCallId: string; readonly delta: string }
  | { readonly type: 'usage'; readonly usage: TokenUsage }
  | { readonly type: 'finish'; readonly reason: FinishReason }

export interface Model {
  readonly id: string
  readonly provider: string
  readonly name: string
  readonly config: ModelConfig

  generate(options: GenerateOptions): Promise<GenerateResult>
  stream(options: GenerateOptions): AsyncIterable<StreamChunk>
  supportsFeature(feature: keyof ModelCapabilities): boolean
  getCapabilities(): ModelCapabilities
}
