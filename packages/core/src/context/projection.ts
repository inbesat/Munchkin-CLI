import type { Message } from '../session/message'

/** Move a suffix boundary back until every retained result has its original call. */
export function recentContextBoundary(messages: readonly Message[], keepRecent: number): number {
  let boundary = Math.max(0, messages.length - keepRecent)
  const calls = new Map<string, number>()
  const results = new Set<string>()
  for (const [index, message] of messages.entries()) {
    if (message.role === 'system') continue
    for (const part of message.parts) {
      if (part.type === 'tool_call') calls.set(part.toolCallId, index)
      if (part.type === 'tool_result') results.add(part.toolCallId)
    }
  }
  // Pending calls must remain available when a resumed tool returns later.
  for (const [id, index] of calls) {
    if (!results.has(id)) boundary = Math.min(boundary, index)
  }
  for (let index = messages.length - 1; index >= boundary; index--) {
    const message = messages[index]
    if (message.role === 'system') continue
    for (const part of message.parts) {
      if (part.type === 'tool_result') {
        boundary = Math.min(boundary, calls.get(part.toolCallId) ?? index)
      }
    }
  }
  return boundary
}

export function summaryMessage(summary: string): Message {
  const content = `[Summary: ${summary}]`
  return { role: 'user', content, parts: [{ type: 'text', text: content }] }
}
