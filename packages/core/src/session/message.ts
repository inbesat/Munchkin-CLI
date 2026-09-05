export type MessagePart = TextPart | ToolCallPart | ToolResultPart | ThinkingPart

export interface TextPart {
  type: 'text'
  text: string
}

export interface ToolCallPart {
  type: 'tool_call'
  toolCallId: string
  toolName: string
  args: Record<string, unknown>
}

export interface ToolResultPart {
  type: 'tool_result'
  toolCallId: string
  toolName: string
  result: unknown
  error?: string
}

export interface ThinkingPart {
  type: 'thinking'
  thinking: string
}

export type UserPart = TextPart | ToolResultPart

export interface UserMessage {
  role: 'user'
  parts: UserPart[]
  content: string
}

export interface AssistantMessage {
  role: 'assistant'
  parts: MessagePart[]
  content: string
  toolCalls?: ToolCallPart[]
  thinking?: string
  tokens?: { input: number; output: number }
}

export interface SystemMessage {
  role: 'system'
  content: string
}

export type Message = UserMessage | AssistantMessage | SystemMessage

export type ProviderFormat = 'anthropic' | 'openai' | 'google'

export interface ProviderMessage {
  role: string
  content?: string | Array<{ type: string; [key: string]: unknown }> | null
  parts?: Array<{ type: string; [key: string]: unknown }>
  tool_call_id?: string
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: { name: string; arguments: string }
  }>
}

export function isUserMessage(msg: Message): msg is UserMessage {
  return msg.role === 'user'
}

export function isAssistantMessage(msg: Message): msg is AssistantMessage {
  return msg.role === 'assistant'
}

export function isSystemMessage(msg: Message): msg is SystemMessage {
  return msg.role === 'system'
}
