import { describe, expect, it } from 'bun:test'
import type { LoopEvent } from '@forge/core'
import { SSEHub } from '../src/services/sse-hub'
import { SSEBridge } from '../src/sse/bridge'

function makeClient(id: string, sessionIds: string[] = []) {
  const messages: string[] = []
  return {
    id,
    sessionIds: new Set(sessionIds),
    connectedAt: Date.now(),
    controller: {
      enqueue: (m: string) => messages.push(m),
      close: () => {},
    } as unknown as unknown as Parameters<SSEHub['register']>[0]['controller'],
    messages,
  }
}

describe('SSEBridge', () => {
  it('translates text events into text_delta frames', () => {
    const hub = new SSEHub()
    const c = makeClient('c1', ['s1'])
    hub.register(c)
    const bridge = new SSEBridge(hub)

    bridge.emitLoopEvent('s1', { type: 'text', delta: 'hello' } as LoopEvent)

    const msg = c.messages.find((m) => m.includes('event: text_delta'))
    expect(msg).toBeDefined()
    expect(msg!).toInclude('delta')
  })

  it('translates tool-call and tool-result into typed frames', () => {
    const hub = new SSEHub()
    const c = makeClient('c1', ['s1'])
    hub.register(c)
    const bridge = new SSEBridge(hub)

    bridge.emitLoopEvent('s1', {
      type: 'tool-call',
      toolCall: { id: 't1', name: 'read', arguments: {}, callId: 't1' } as any,
    } as LoopEvent)
    bridge.emitLoopEvent('s1', {
      type: 'tool-result',
      toolCallId: 't1',
      toolName: 'read',
      durationMs: 5,
    } as LoopEvent)

    expect(c.messages.some((m) => m.includes('event: tool_call'))).toBe(true)
    expect(c.messages.some((m) => m.includes('event: tool_result'))).toBe(true)
  })

  it('translates finish into agent_done', () => {
    const hub = new SSEHub()
    const c = makeClient('c1', ['s1'])
    hub.register(c)
    const bridge = new SSEBridge(hub)

    bridge.emitLoopEvent('s1', { type: 'finish', reason: 'complete' } as LoopEvent)

    expect(c.messages.some((m) => m.includes('event: agent_done'))).toBe(true)
  })

  it('translates thinking and usage', () => {
    const hub = new SSEHub()
    const c = makeClient('c1', ['s1'])
    hub.register(c)
    const bridge = new SSEBridge(hub)

    bridge.emitLoopEvent('s1', { type: 'thinking', delta: 'hmm' } as LoopEvent)
    bridge.emitLoopEvent('s1', {
      type: 'usage',
      usage: { input: 1, output: 2, total: 3 },
    } as LoopEvent)

    expect(c.messages.some((m) => m.includes('event: thinking_delta'))).toBe(true)
    expect(c.messages.some((m) => m.includes('event: usage'))).toBe(true)
  })

  it('fans out only to clients subscribed to the session', () => {
    const hub = new SSEHub()
    const a = makeClient('a', ['s1'])
    const b = makeClient('b', ['s2'])
    hub.register(a)
    hub.register(b)
    const bridge = new SSEBridge(hub)

    bridge.emitLoopEvent('s1', { type: 'text', delta: 'x' } as LoopEvent)

    expect(a.messages.some((m) => m.includes('event: text_delta'))).toBe(true)
    expect(b.messages.length).toBe(0)
  })

  it('broadcast passthrough works', () => {
    const hub = new SSEHub()
    const c = makeClient('c1', ['s1'])
    hub.register(c)
    const bridge = new SSEBridge(hub)

    bridge.broadcast('ping', { hello: 'world' }, 's1')

    expect(c.messages.some((m) => m.includes('event: ping'))).toBe(true)
  })
})
