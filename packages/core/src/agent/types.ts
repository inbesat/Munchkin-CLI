/**
 * Structural types for the agent loop.
 *
 * These deliberately mirror the shapes used by `@forge/ai`'s Model interface
 * (message/usage/stream-chunk field-for-field) so an ai Model can be passed
 * to the loop without any adapter and without `@forge/core` depending on
 * `@forge/ai`. Core stays provider-agnostic; wiring happens by construction.
 */

export type AgentRole = 'user' | 'assistant' | 'system'

export interface AgentToolCall {
  readonly id: string
  readonly name: string
  readonly args: Record<string, unknown>
}

export interface AgentToolResult {
  readonly toolCallId: string
  readonly toolName: string
  readonly result: string
  readonly error?: string
  readonly durationMs: number
}

/** One message in a model request. Structurally matches ai's `ModelMessage`. */
export interface AgentRequestMessage {
  readonly role: AgentRole
  readonly content: string
  readonly toolCalls?: readonly AgentToolCall[]
  readonly toolResults?: readonly AgentToolResult[]
}

/** Sends tool schemas to the model. Structurally matches ai's `ToolDefinition`. */
export interface AgentToolDefinition {
  readonly name: string
  readonly description: string
  readonly parameters: Record<string, unknown>
}

export interface AgentUsage {
  readonly input: number
  readonly output: number
  readonly cacheRead?: number
  readonly cacheWrite?: number
  readonly total: number
}

/** Token usage reported mid-stream. Structurally matches ai's `StreamChunk['usage']`. */
export interface AgentUsageChunk {
  readonly input: number
  readonly output: number
  readonly cacheRead?: number
  readonly cacheWrite?: number
  readonly total: number
}

/** Streaming chunks from the model. Structurally matches ai's `StreamChunk`. */
export type AgentChunk =
  | { readonly type: 'text-delta'; readonly delta: string }
  | { readonly type: 'thinking-delta'; readonly delta: string }
  | { readonly type: 'tool-call'; readonly toolCall: AgentToolCall }
  | { readonly type: 'tool-call-delta'; readonly toolCallId: string; readonly name?: string; readonly delta: string }
  | { readonly type: 'usage'; readonly usage: AgentUsageChunk }
  | { readonly type: 'finish'; readonly reason: 'stop' | 'tool-call' | 'length' | 'abort' | 'error' }

export type AgentFinishReason = 'stop' | 'tool-call' | 'length' | 'abort' | 'error'

export interface AgentGenerateOptions {
  readonly messages: readonly AgentRequestMessage[]
  readonly tools?: readonly AgentToolDefinition[]
  readonly system?: string
  readonly maxTokens?: number
  readonly temperature?: number
  readonly thinking?: boolean | { budgetTokens?: number }
  readonly abortSignal?: AbortSignal
}

/**
 * What the loop needs from a model. ai's Model satisfies this type
 * structurally (`config.capabilities.contextWindow` and `stream`).
 */
export interface AgentModel {
  readonly id: string
  readonly provider: string
  readonly config: {
    readonly capabilities: { readonly contextWindow: number; readonly maxTokens: number }
  }
  stream(options: AgentGenerateOptions): AsyncIterable<AgentChunk>
}

/** A tool the agent can execute. Phase 34 formalizes registration/scope. */
export interface AgentTool {
  readonly name: string
  readonly description: string
  readonly parameters?: Record<string, unknown>
  execute(args: Record<string, unknown>, signal?: AbortSignal): Promise<string>
}