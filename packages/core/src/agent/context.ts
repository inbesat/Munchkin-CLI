import type { Message, AssistantMessage, UserMessage } from '../session/message'
import type {
  AgentRequestMessage,
  AgentTool,
  AgentToolCall,
  AgentToolDefinition,
} from './types'

/**
 * Context assembly for each agent turn: turns core `Message`s (Phase 14) into
 * the model request shape, attaches the system prompt + tool schemas, and
 * keeps the input inside the model's context budget by trimming history
 * (oldest non-system messages first, never the final message).
 */

export interface AssembleOptions {
  messages: readonly Message[]
  system?: string
  tools?: readonly AgentTool[]
  /** Available input budget in tokens (contextWindow minus output reserve). */
  inputBudget: number
}

export interface AssembledContext {
  messages: readonly Message[]
  requestMessages: readonly AgentRequestMessage[]
  toolDefinitions: readonly AgentToolDefinition[]
  estimatedTokens: number
  /** True when history had to be trimmed to fit. */
  wasTrimmed: boolean
  /** True when even the trimmed input exceeds the budget. */
  overflow: boolean
}

/** Rough token estimate: ~4 chars/token, wrapping JSON args at legal tokens. */
export function estimateTokens(value: string | readonly AgentRequestMessage[]): number {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  return Math.ceil(text.length / 4)
}

function toolCallToDefinition(tool: AgentTool): AgentToolDefinition {
  return {
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters ?? { type: 'object', properties: {} },
  }
}

export function toRequestMessages(messages: readonly Message[]): AgentRequestMessage[] {
  const out: AgentRequestMessage[] = []
  for (const msg of messages) {
    if (msg.role === 'system') {
      out.push({ role: 'system', content: msg.content })
      continue
    }
    if (msg.role === 'user') {
      const user = msg as UserMessage
      const toolResults = user.parts
        .filter((part) => part.type === 'tool_result')
        .map((part) => ({
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          result: typeof part.result === 'string' ? part.result : JSON.stringify(part.result),
          error: part.error,
          durationMs: 0,
        }))
      out.push({
        role: 'user',
        content: user.content,
        toolResults: toolResults.length > 0 ? toolResults : undefined,
      })
      continue
    }
    const assistant = msg as AssistantMessage
    const toolCalls: AgentToolCall[] | undefined = assistant.toolCalls?.map((tc) => ({
      id: tc.toolCallId,
      name: tc.toolName,
      args: tc.args,
    }))
    out.push({
      role: 'assistant',
      content: assistant.content,
      toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
    })
  }
  return out
}

/**
 * Trim history to fit `budget`: drop oldest non-system messages from the
 * MIDDLE of the conversation, keeping system messages and the final message.
 */
export function trimMessages(
  messages: readonly Message[],
  budget: number,
): { messages: Message[]; trimmed: boolean } {
  let out = [...messages]
  let trimmed = false
  while (out.length > 1 && estimateTokens(toRequestMessages(out)) > budget) {
    // Find first non-system that is NOT the last message
    const lastIdx = out.length - 1
    const idx = out.findIndex((m, i) => m.role !== 'system' && i !== lastIdx)
    if (idx < 0) break
    out.splice(idx, 1)
    trimmed = true
  }
  return { messages: out, trimmed }
}

export function assembleContext(options: AssembleOptions): AssembledContext {
  const budget = Math.max(0, Math.floor(options.inputBudget))
  const { messages, trimmed } = trimMessages(options.messages, budget)
  const requestMessages = toRequestMessages(messages)
  const estimatedTokens = estimateTokens(requestMessages)
  const toolDefinitions = (options.tools ?? []).map(toolCallToDefinition)

  return {
    messages,
    requestMessages,
    toolDefinitions,
    estimatedTokens,
    wasTrimmed: trimmed,
    overflow: estimatedTokens > budget,
  }
}