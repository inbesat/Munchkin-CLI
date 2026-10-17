import { beforeEach, describe, expect, it } from 'bun:test'
import type { SessionEvent } from '../events'
import { Microcompactor, createMicrocompactor, microcompactIfNeeded } from './microcompact'

const createSessionEvents = (messageCount: number, toolResultsPerMessage = 1): SessionEvent[] => {
  const events: SessionEvent[] = [
    {
      id: 'evt-0',
      sessionId: 'session-1',
      timestamp: Date.now(),
      schemaVersion: 1,
      type: 'session.created',
      payload: { title: 'Test Session', model: 'test-model', cwd: '/tmp' },
    },
  ]

  for (let i = 0; i < messageCount; i++) {
    if (i % 2 === 0) {
      events.push({
        id: `evt-${i + 1}`,
        sessionId: 'session-1',
        timestamp: Date.now() + i * 1000,
        schemaVersion: 1,
        type: 'session.message',
        payload: { role: 'user', content: `User message ${i}` },
      })
    } else {
      const toolResults = Array.from({ length: toolResultsPerMessage }, (_, j) => ({
        toolCallId: `call-${i}-${j}`,
        toolName: 'bash',
        result: 'x'.repeat(5000),
        durationMs: 100,
      }))

      events.push({
        id: `evt-${i + 1}`,
        sessionId: 'session-1',
        timestamp: Date.now() + i * 1000,
        schemaVersion: 1,
        type: 'session.message',
        payload: {
          role: 'assistant',
          content: `Assistant message ${i}`,
        },
      })

      for (const result of toolResults) {
        events.push({
          id: `${result.toolCallId}-call`,
          sessionId: 'session-1',
          timestamp: Date.now(),
          schemaVersion: 1,
          type: 'session.tool_call',
          payload: { toolCallId: result.toolCallId, toolName: 'bash', args: {} },
        })
      }
      for (const result of toolResults) {
        events.push({
          id: `${result.toolCallId}-result`,
          sessionId: 'session-1',
          timestamp: Date.now(),
          schemaVersion: 1,
          type: 'session.tool_result',
          payload: result,
        })
      }
    }
  }

  return events
}

describe('Microcompactor', () => {
  let microcompactor: Microcompactor

  beforeEach(() => {
    microcompactor = createMicrocompactor({
      maxToolResultsToKeep: 5,
      summarizeToolResults: true,
    })
  })

  it('creates microcompactor with default options', () => {
    const mc = createMicrocompactor()
    expect(mc).toBeInstanceOf(Microcompactor)
    expect(mc.getOptions().maxToolResultsToKeep).toBe(10)
    expect(mc.getOptions().summarizeToolResults).toBe(true)
  })

  it('creates microcompactor with custom options', () => {
    const mc = createMicrocompactor({
      maxToolResultsToKeep: 3,
      summarizeToolResults: false,
      summaryPrefix: '[SUMMARY]',
    })
    expect(mc.getOptions().maxToolResultsToKeep).toBe(3)
    expect(mc.getOptions().summarizeToolResults).toBe(false)
    expect(mc.getOptions().summaryPrefix).toBe('[SUMMARY]')
  })

  it('returns false for shouldMicrocompact when few tool results', () => {
    const events = createSessionEvents(4, 1)
    const shouldCompact = microcompactor.shouldMicrocompact(events)
    expect(shouldCompact).toBe(false)
  })

  it('returns true for shouldMicrocompact when many tool results', () => {
    const events = createSessionEvents(20, 1)
    const shouldCompact = microcompactor.shouldMicrocompact(events)
    expect(shouldCompact).toBe(true)
  })

  it('microcompacts successfully when needed', async () => {
    const events = createSessionEvents(20, 1)
    const result = await microcompactor.microcompact(events)

    expect(result.success).toBe(true)
    expect(result.messagesRemoved).toBeGreaterThan(0)
    expect(result.tokensSaved).toBeGreaterThan(0)
    expect(result.message).toContain('Microcompact complete')
  })

  it('returns not needed when below threshold', async () => {
    const events = createSessionEvents(4, 1)
    const result = await microcompactor.microcompact(events)

    expect(result.success).toBe(false)
    expect(result.messagesRemoved).toBe(0)
    expect(result.tokensSaved).toBe(0)
  })

  it('handles disable summarize option', async () => {
    const mc = createMicrocompactor({
      maxToolResultsToKeep: 5,
      summarizeToolResults: false,
    })

    const events = createSessionEvents(20, 1)
    const result = await mc.microcompact(events)

    expect(result.success).toBe(true)
    expect(result.messagesRemoved).toBeGreaterThan(0)
  })

  it('handles custom summary prefix', async () => {
    const mc = createMicrocompactor({
      maxToolResultsToKeep: 5,
      summarizeToolResults: true,
      summaryPrefix: '[CUSTOM]',
    })

    const events = createSessionEvents(20, 1)
    const result = await mc.microcompact(events)

    expect(result.success).toBe(true)
  })

  it('updates options dynamically', () => {
    expect(microcompactor.getOptions().maxToolResultsToKeep).toBe(5)
    microcompactor.updateOptions({ maxToolResultsToKeep: 15 })
    expect(microcompactor.getOptions().maxToolResultsToKeep).toBe(15)
  })

  it('handles multiple tool results per message', async () => {
    const events = createSessionEvents(20, 3)
    const result = await microcompactor.microcompact(events)

    expect(result.success).toBe(true)
    expect(result.messagesRemoved).toBeGreaterThan(0)
  })

  it('handles large tool results', async () => {
    const events: SessionEvent[] = [
      {
        id: 'evt-0',
        sessionId: 'session-1',
        timestamp: Date.now(),
        schemaVersion: 1,
        type: 'session.created',
        payload: { title: 'Test Session', model: 'test-model', cwd: '/tmp' },
      },
    ]

    for (let i = 0; i < 20; i++) {
      events.push({
        id: `evt-${i + 1}`,
        sessionId: 'session-1',
        timestamp: Date.now() + i * 1000,
        schemaVersion: 1,
        type: 'session.message',
        payload: { role: 'user', content: `User ${i}` },
      })

      events.push({
        id: `evt-${i + 1}-result`,
        sessionId: 'session-1',
        timestamp: Date.now() + i * 1000 + 1,
        schemaVersion: 1,
        type: 'session.tool_result',
        payload: {
          toolCallId: `call-${i}`,
          toolName: 'bash',
          result: 'x'.repeat(50000),
          durationMs: 100,
        },
      })
    }

    const result = await microcompactor.microcompact(events)
    expect(result.success).toBe(true)
    expect(result.tokensSaved).toBeGreaterThan(10000)
  })

  it('handles empty tool results', async () => {
    const events: SessionEvent[] = [
      {
        id: 'evt-0',
        sessionId: 'session-1',
        timestamp: Date.now(),
        schemaVersion: 1,
        type: 'session.created',
        payload: { title: 'Test Session', model: 'test-model', cwd: '/tmp' },
      },
      {
        id: 'evt-1',
        sessionId: 'session-1',
        timestamp: Date.now() + 1000,
        schemaVersion: 1,
        type: 'session.message',
        payload: { role: 'user', content: 'Hello' },
      },
      {
        id: 'evt-2',
        sessionId: 'session-1',
        timestamp: Date.now() + 2000,
        schemaVersion: 1,
        type: 'session.tool_result',
        payload: {
          toolCallId: 'call-1',
          toolName: 'bash',
          result: '',
          durationMs: 100,
        },
      },
    ]

    const mc = createMicrocompactor({ maxToolResultsToKeep: 0 })
    const result = await mc.microcompact(events)
    expect(result.success).toBe(false)
    expect(result.tokensSaved).toBe(0)
    expect(result.messagesRemoved).toBe(0)
  })
})

describe('microcompactIfNeeded', () => {
  it('returns null when microcompact not needed', async () => {
    const mc = createMicrocompactor({ maxToolResultsToKeep: 5 })
    const events = createSessionEvents(4, 1)

    const result = await microcompactIfNeeded(mc, events)
    expect(result).toBeNull()
  })

  it('returns result when microcompact needed', async () => {
    const mc = createMicrocompactor({ maxToolResultsToKeep: 5 })
    const events = createSessionEvents(20, 1)

    const result = await microcompactIfNeeded(mc, events)
    expect(result).not.toBeNull()
    expect(result?.success).toBe(true)
  })
})

describe('summarizeToolResult behavior', () => {
  it('preserves short string results instead of growing context', async () => {
    const mc = createMicrocompactor({ maxToolResultsToKeep: 0, summarizeToolResults: true })
    const events: SessionEvent[] = [
      {
        id: 'evt-0',
        sessionId: 'session-1',
        timestamp: Date.now(),
        schemaVersion: 1,
        type: 'session.created',
        payload: { title: 'Test Session', model: 'test-model', cwd: '/tmp' },
      },
      {
        id: 'evt-1',
        sessionId: 'session-1',
        timestamp: Date.now() + 1000,
        schemaVersion: 1,
        type: 'session.message',
        payload: { role: 'user', content: 'Hello' },
      },
      {
        id: 'evt-2',
        sessionId: 'session-1',
        timestamp: Date.now() + 2000,
        schemaVersion: 1,
        type: 'session.tool_result',
        payload: {
          toolCallId: 'call-1',
          toolName: 'bash',
          result: 'Short output',
          durationMs: 100,
        },
      },
    ]

    const result = await mc.microcompact(events)
    expect(result.success).toBe(false)
    expect(result.tokensSaved).toBe(0)
    // Hydration defers user-text flushes, so the tool result is not last; find it.
    const toolResultMessage = result.messages.find((m) =>
      m.parts.some((p) => p.type === 'tool_result'),
    )
    expect(toolResultMessage?.content).toBe(JSON.stringify('Short output'))
  })

  it('truncates long string results', async () => {
    const mc = createMicrocompactor({ maxToolResultsToKeep: 0, summarizeToolResults: true })
    const longResult = 'x'.repeat(1000)
    const events: SessionEvent[] = [
      {
        id: 'evt-0',
        sessionId: 'session-1',
        timestamp: Date.now(),
        schemaVersion: 1,
        type: 'session.created',
        payload: { title: 'Test Session', model: 'test-model', cwd: '/tmp' },
      },
      {
        id: 'evt-1',
        sessionId: 'session-1',
        timestamp: Date.now() + 1000,
        schemaVersion: 1,
        type: 'session.message',
        payload: { role: 'user', content: 'Hello' },
      },
      {
        id: 'evt-2',
        sessionId: 'session-1',
        timestamp: Date.now() + 2000,
        schemaVersion: 1,
        type: 'session.tool_result',
        payload: {
          toolCallId: 'call-1',
          toolName: 'bash',
          result: longResult,
          durationMs: 100,
        },
      },
    ]

    const result = await mc.microcompact(events)
    expect(result.success).toBe(true)
    expect(result.tokensSaved).toBeGreaterThan(0)
  })

  it('handles array results', async () => {
    const mc = createMicrocompactor({ maxToolResultsToKeep: 0, summarizeToolResults: true })
    const events: SessionEvent[] = [
      {
        id: 'evt-0',
        sessionId: 'session-1',
        timestamp: Date.now(),
        schemaVersion: 1,
        type: 'session.created',
        payload: { title: 'Test Session', model: 'test-model', cwd: '/tmp' },
      },
      {
        id: 'evt-1',
        sessionId: 'session-1',
        timestamp: Date.now() + 1000,
        schemaVersion: 1,
        type: 'session.message',
        payload: { role: 'user', content: 'Hello' },
      },
      {
        id: 'evt-2',
        sessionId: 'session-1',
        timestamp: Date.now() + 2000,
        schemaVersion: 1,
        type: 'session.tool_result',
        payload: {
          toolCallId: 'call-1',
          toolName: 'glob',
          result: ['file1.ts', 'file2.ts', 'file3.ts'],
          durationMs: 100,
        },
      },
    ]

    const result = await mc.microcompact(events)
    expect(result.success).toBe(false)
    expect(result.tokensSaved).toBe(0)
  })

  it('handles object results', async () => {
    const mc = createMicrocompactor({ maxToolResultsToKeep: 0, summarizeToolResults: true })
    const events: SessionEvent[] = [
      {
        id: 'evt-0',
        sessionId: 'session-1',
        timestamp: Date.now(),
        schemaVersion: 1,
        type: 'session.created',
        payload: { title: 'Test Session', model: 'test-model', cwd: '/tmp' },
      },
      {
        id: 'evt-1',
        sessionId: 'session-1',
        timestamp: Date.now() + 1000,
        schemaVersion: 1,
        type: 'session.message',
        payload: { role: 'user', content: 'Hello' },
      },
      {
        id: 'evt-2',
        sessionId: 'session-1',
        timestamp: Date.now() + 2000,
        schemaVersion: 1,
        type: 'session.tool_result',
        payload: {
          toolCallId: 'call-1',
          toolName: 'read',
          result: { content: 'file content', lines: 100 },
          durationMs: 100,
        },
      },
    ]

    const result = await mc.microcompact(events)
    expect(result.success).toBe(false)
    expect(result.tokensSaved).toBe(0)
  })
})
