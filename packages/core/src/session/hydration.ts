import type { SessionEvent } from '../events'
import type {
  AssistantMessage,
  Message,
  MessagePart,
  ProviderFormat,
  ProviderMessage,
  ToolCallPart,
  ToolResultPart,
  UserMessage,
} from './message'

export interface HydrationOptions {
  format: ProviderFormat
  includeSystem?: boolean
  systemPrompt?: string
}

export function hydrateMessages(
  events: SessionEvent[],
  options: HydrationOptions,
): ProviderMessage[] {
  const messages = assembleMessages(events)
  const providerMessages = messages.map((msg) => toProviderFormat(msg, options.format))

  if (options.includeSystem && options.systemPrompt) {
    providerMessages.unshift({ role: 'system', content: options.systemPrompt })
  }

  return providerMessages
}

export function assembleMessages(events: SessionEvent[]): Message[] {
  const messages: Message[] = []
  const pendingToolCalls = new Map<string, ToolCallPart>()

  let currentUserContent: string[] = []
  let currentAssistantContent: string[] = []
  let currentToolCalls: ToolCallPart[] = []
  let currentThinking: string | undefined

  const flushUser = () => {
    if (currentUserContent.length > 0) {
      const content = currentUserContent.join('\n')
      messages.push({
        role: 'user',
        parts: [{ type: 'text', text: content }],
        content,
      })
      currentUserContent = []
    }
  }

  const flushAssistant = () => {
    if (currentAssistantContent.length > 0 || currentToolCalls.length > 0 || currentThinking) {
      const content = currentAssistantContent.join('\n')
      const parts: MessagePart[] = []

      if (currentThinking) {
        parts.push({ type: 'thinking', thinking: currentThinking })
      }

      if (content) {
        parts.push({ type: 'text', text: content })
      }

      for (const tc of currentToolCalls) {
        parts.push(tc)
      }

      messages.push({
        role: 'assistant',
        parts,
        content,
        toolCalls: currentToolCalls.length > 0 ? currentToolCalls : undefined,
        thinking: currentThinking,
      })

      currentAssistantContent = []
      currentToolCalls = []
      currentThinking = undefined
    }
  }

  for (const event of events) {
    switch (event.type) {
      case 'session.created':
        break

      case 'session.message': {
        if (event.payload.role === 'user') {
          flushAssistant()
          currentUserContent.push(event.payload.content)
        } else {
          flushUser()
          currentAssistantContent.push(event.payload.content)
        }
        break
      }

      case 'session.tool_call': {
        const tc: ToolCallPart = {
          type: 'tool_call',
          toolCallId: event.payload.toolCallId,
          toolName: event.payload.toolName,
          args: event.payload.args,
        }
        currentToolCalls.push(tc)
        pendingToolCalls.set(event.payload.toolCallId, tc)
        break
      }

      case 'session.tool_result': {
        flushAssistant()
        const toolResult: ToolResultPart = {
          type: 'tool_result',
          toolCallId: event.payload.toolCallId,
          toolName: event.payload.toolName,
          result: event.payload.result,
          error: event.payload.error,
        }

        messages.push({
          role: 'user',
          parts: [toolResult],
          content: JSON.stringify(event.payload.result),
        })
        break
      }

      case 'session.error': {
        currentUserContent.push(`[Error: ${event.payload.code}] ${event.payload.message}`)
        break
      }

      case 'session.compaction': {
        currentUserContent.push(
          `[System: Conversation compacted from ${event.payload.beforeCount} to ${event.payload.afterCount} messages]`,
        )
        break
      }
    }
  }

  flushAssistant()
  flushUser()

  return messages
}

function toProviderFormat(msg: Message, format: ProviderFormat): ProviderMessage {
  switch (format) {
    case 'anthropic':
      return toAnthropic(msg)
    case 'openai':
      return toOpenAI(msg)
    case 'google':
      return toGoogle(msg)
  }
}

function toAnthropic(msg: Message): ProviderMessage {
  if (msg.role === 'system') {
    return { role: 'system', content: msg.content }
  }

  if (msg.role === 'user') {
    return { role: 'user', content: msg.content }
  }

  const assistantMsg = msg as AssistantMessage
  const content: Array<{ type: string; [key: string]: unknown }> = []

  if (assistantMsg.thinking) {
    content.push({ type: 'thinking', thinking: assistantMsg.thinking })
  }

  if (assistantMsg.content) {
    content.push({ type: 'text', text: assistantMsg.content })
  }

  if (assistantMsg.toolCalls) {
    for (const tc of assistantMsg.toolCalls) {
      content.push({
        type: 'tool_use',
        id: tc.toolCallId,
        name: tc.toolName,
        input: tc.args,
      })
    }
  }

  const toolResultParts = assistantMsg.parts.filter((p) => p.type === 'tool_result')
  for (const tr of toolResultParts) {
    const toolResult = tr as ToolResultPart
    content.push({
      type: 'tool_result',
      tool_use_id: toolResult.toolCallId,
      content: toolResult.error ?? JSON.stringify(toolResult.result),
    })
  }

  return {
    role: 'assistant',
    content:
      content.length === 1 && content[0].type === 'text' ? (content[0].text as string) : content,
  }
}

function toOpenAI(msg: Message): ProviderMessage {
  if (msg.role === 'system') {
    return { role: 'system', content: msg.content }
  }

  if (msg.role === 'user') {
    const userMsg = msg as UserMessage
    const toolResultParts = userMsg.parts.filter((p) => p.type === 'tool_result')
    if (toolResultParts.length > 0) {
      return {
        role: 'tool',
        tool_call_id: (toolResultParts[0] as ToolResultPart).toolCallId,
        content:
          (toolResultParts[0] as ToolResultPart).error ??
          JSON.stringify((toolResultParts[0] as ToolResultPart).result),
      }
    }
    return { role: 'user', content: userMsg.content }
  }

  const assistantMsg = msg as AssistantMessage
  const result: ProviderMessage = {
    role: 'assistant',
    content: assistantMsg.content || undefined,
  }

  if (assistantMsg.toolCalls && assistantMsg.toolCalls.length > 0) {
    result.tool_calls = assistantMsg.toolCalls.map((tc) => ({
      id: tc.toolCallId,
      type: 'function' as const,
      function: {
        name: tc.toolName,
        arguments: JSON.stringify(tc.args),
      },
    }))
  }

  return result
}

function toGoogle(msg: Message): ProviderMessage {
  if (msg.role === 'system') {
    return { role: 'system', content: msg.content }
  }

  if (msg.role === 'user') {
    const userMsg = msg as UserMessage
    const parts: Array<{ type: string; [key: string]: unknown }> = []

    for (const part of userMsg.parts) {
      if (part.type === 'text') {
        parts.push({ type: 'text', text: part.text })
      } else if (part.type === 'tool_result') {
        const tr = part as ToolResultPart
        parts.push({
          type: 'functionResponse',
          functionResponse: {
            name: tr.toolName,
            response: { result: tr.result, error: tr.error },
          },
        })
      }
    }

    return {
      role: 'user',
      content: parts.length === 1 && parts[0].type === 'text' ? (parts[0].text as string) : parts,
    }
  }

  const assistantMsg = msg as AssistantMessage
  const parts: Array<{ type: string; [key: string]: unknown }> = []

  if (assistantMsg.thinking) {
    parts.push({ type: 'thought', thought: assistantMsg.thinking })
  }

  if (assistantMsg.content) {
    parts.push({ type: 'text', text: assistantMsg.content })
  }

  if (assistantMsg.toolCalls) {
    for (const tc of assistantMsg.toolCalls) {
      parts.push({
        type: 'functionCall',
        functionCall: {
          name: tc.toolName,
          args: tc.args,
        },
      })
    }
  }

  return { role: 'model', content: parts }
}
