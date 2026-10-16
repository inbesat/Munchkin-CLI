import { describe, expect, it } from 'bun:test'
import type { Message } from '../session/message'
import { assembleContext, estimateTokens, toRequestMessages, trimMessages } from './context'
import type { AgentTool } from './types'

function userMsg(content: string): Message {
  return {
    role: 'user',
    parts: [{ type: 'text', text: content }],
    content,
  }
}
function assistantMsg(
  content: string,
  toolCalls?: { name: string; args: Record<string, unknown> }[],
): Message {
  const parts: Message['parts'] = []
  const toolCallParts: {
    type: 'tool_call'
    toolCallId: string
    toolName: string
    args: Record<string, unknown>
  }[] = []
  if (content) parts.push({ type: 'text', text: content })
  if (toolCalls) {
    for (const tc of toolCalls) {
      const id = `tc-${tc.name}`
      parts.push({ type: 'tool_call', toolCallId: id, toolName: tc.name, args: tc.args })
      toolCallParts.push({ type: 'tool_call', toolCallId: id, toolName: tc.name, args: tc.args })
    }
  }
  return { role: 'assistant', parts, content, toolCalls: toolCallParts }
}
function systemMsg(content: string): Message {
  return { role: 'system', parts: [{ type: 'text', text: content }], content }
}
function mockTool(name: string): AgentTool {
  return { name, description: '', execute: async () => 'ok' }
}

describe('estimateTokens', () => {
  it('counts chars/4 ceiling', () => {
    expect(estimateTokens('')).toBe(0)
    expect(estimateTokens('a')).toBe(1)
    expect(estimateTokens('abcd')).toBe(1)
    expect(estimateTokens('abcde')).toBe(2)
  })
  it('works on message arrays', () => {
    const msgs = toRequestMessages([userMsg('hello')])
    expect(estimateTokens(msgs)).toBeGreaterThan(0)
  })
})

describe('toRequestMessages', () => {
  it('maps system/user/assistant with toolCalls', () => {
    const msgs: Message[] = [
      systemMsg('sys'),
      userMsg('hi'),
      assistantMsg('hello', [{ name: 'bash', args: { cmd: 'ls' } }]),
    ]
    const req = toRequestMessages(msgs)
    expect(req).toHaveLength(3)
    expect(req[0]).toEqual({ role: 'system', content: 'sys' })
    expect(req[1]).toEqual({ role: 'user', content: 'hi', toolResults: undefined })
    expect(req[2].role).toBe('assistant')
    expect(req[2].toolCalls).toHaveLength(1)
    expect(req[2].toolCalls?.[0].name).toBe('bash')
    expect(req[2].toolCalls?.[0].args).toEqual({ cmd: 'ls' })
  })
  it('maps user tool_results', () => {
    const msg: Message = {
      role: 'user',
      parts: [
        { type: 'text', text: '' },
        {
          type: 'tool_result',
          toolCallId: 'tc-1',
          toolName: 'bash',
          result: 'ok',
          error: undefined,
        },
      ],
      content: '{"result":"ok"}',
    }
    const req = toRequestMessages([msg])
    expect(req[0].role).toBe('user')
    expect(req[0].toolResults).toHaveLength(1)
    expect(req[0].toolResults?.[0].result).toBe('ok')
  })
})

describe('trimMessages', () => {
  it('drops oldest non-system messages to fit budget', () => {
    const msgs: Message[] = [
      systemMsg('sys'),
      userMsg('u1'),
      userMsg('u2'),
      assistantMsg('a1'),
      userMsg('u3'),
    ]
    const { messages, trimmed } = trimMessages(msgs, 10)
    expect(trimmed).toBe(true)
    expect(messages[0].role).toBe('system')
    // last message kept
    expect(messages[messages.length - 1].content).toBe('u3')
  })
  it('never drops the final message', () => {
    const msgs: Message[] = [systemMsg('sys'), userMsg('u1')]
    const { messages, trimmed } = trimMessages(msgs, 0) // budget 0 -> can't trim last msg
    expect(trimmed).toBe(false) // nothing removable (only non-system IS the last)
    expect(messages.length).toBe(2) // both kept
    expect(messages[messages.length - 1].content).toBe('u1')
  })
  it('returns as-is when already fits', () => {
    const msgs: Message[] = [systemMsg('sys'), userMsg('hi')]
    const { messages, trimmed } = trimMessages(msgs, 1000)
    expect(trimmed).toBe(false)
    expect(messages).toEqual(msgs)
  })
})

describe('assembleContext', () => {
  it('assembles requestMessages, toolDefinitions, estimates tokens', () => {
    const msgs: Message[] = [systemMsg('sys'), userMsg('hello')]
    const ctx = assembleContext({ messages: msgs, tools: [mockTool('bash')], inputBudget: 1000 })
    expect(ctx.overflow).toBe(false)
    expect(ctx.wasTrimmed).toBe(false)
    expect(ctx.requestMessages).toHaveLength(2)
    expect(ctx.toolDefinitions).toHaveLength(1)
    expect(ctx.toolDefinitions[0].name).toBe('bash')
  })
  it('detects overflow when even trimmed exceeds budget', () => {
    const msgs: Message[] = [systemMsg('sys'), userMsg('x'.repeat(10000))]
    const ctx = assembleContext({ messages: msgs, inputBudget: 10 })
    expect(ctx.overflow).toBe(true)
  })
})
