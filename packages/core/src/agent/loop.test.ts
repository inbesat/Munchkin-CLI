import { describe, expect, it } from 'bun:test'
import type { Message } from '../session/message'
import { type AgentModel, type AgentTool, type LoopEvent, runAgentLoop } from './loop'
import type { AgentChunk } from './types'

function userMsg(content: string): Message {
  return { role: 'user', parts: [{ type: 'text', text: content }], content }
}
function systemMsg(content: string): Message {
  return { role: 'system', parts: [{ type: 'text', text: content }], content }
}

/**
 * Creates a mock model that yields different chunk sequences per turn.
 * `chunksPerTurn` is an array where each element is the chunks for that turn (0-indexed).
 */
function createMockModel(
  chunksPerTurn: AgentChunk[][],
  opts?: { contextWindow?: number; maxTokens?: number },
): AgentModel {
  const id = opts?.id ?? 'test-model'
  const provider = opts?.provider ?? 'test'
  const contextWindow = opts?.contextWindow ?? 8192
  const maxTokens = opts?.maxTokens ?? 4096
  let turnIndex = 0
  return {
    id,
    provider,
    config: { capabilities: { contextWindow, maxTokens } },
    async *stream({ abortSignal }: { abortSignal?: AbortSignal }) {
      const currentTurn = turnIndex++
      const chunks = chunksPerTurn[currentTurn] ?? []
      for (const chunk of chunks) {
        if (abortSignal?.aborted) return
        yield chunk
      }
    },
  }
}

function tool(
  name: string,
  impl: (args: Record<string, unknown>) => Promise<string> = async () => 'ok',
): AgentTool {
  return { name, description: '', execute: impl }
}

const turn1TextOnly: AgentChunk[] = [
  { type: 'text-delta', delta: 'Hello' },
  { type: 'text-delta', delta: ' world' },
  { type: 'usage', usage: { input: 10, output: 5, total: 15 } },
  { type: 'finish', reason: 'stop' },
]

const turn1ToolCall: AgentChunk[] = [
  { type: 'tool-call', toolCall: { id: 'tc-1', name: 'bash', args: { cmd: 'ls' } } },
  { type: 'usage', usage: { input: 10, output: 5, total: 15 } },
  { type: 'finish', reason: 'tool-call' },
]

const turn2TextDone: AgentChunk[] = [
  { type: 'text-delta', delta: 'Done' },
  { type: 'usage', usage: { input: 8, output: 2, total: 10 } },
  { type: 'finish', reason: 'stop' },
]

describe('runAgentLoop', () => {
  it('text-only turn: one turn, complete', async () => {
    const model = createMockModel([turn1TextOnly])
    const events: LoopEvent[] = []
    const res = await runAgentLoop({
      model,
      messages: [userMsg('hi')],
      onEvent: (e) => events.push(e),
    })
    expect(res.reason).toBe('complete')
    expect(res.turns).toBe(1)
    expect(res.response).toBe('Hello world')
    expect(res.usage.total).toBe(15)
    expect(events.some((e) => e.type === 'finish' && e.reason === 'complete')).toBe(true)
  })

  it('tool call turn then completion: two turns', async () => {
    const model = createMockModel([turn1ToolCall, turn2TextDone])
    const events: LoopEvent[] = []
    const res = await runAgentLoop({
      model,
      messages: [userMsg('run ls')],
      tools: [tool('bash', async () => 'file1\nfile2')],
      onEvent: (e) => events.push(e),
    })
    expect(res.reason).toBe('complete')
    expect(res.turns).toBe(2)
    expect(res.response).toBe('Done')
    expect(events.some((e) => e.type === 'tool-result' && e.toolName === 'bash')).toBe(true)
    expect(res.usage.total).toBe(25)
  })

  it('streaming tool-call-delta accumulated then parsed', async () => {
    const turn1Deltas: AgentChunk[] = [
      { type: 'tool-call-delta', toolCallId: 'tc-1', name: 'bash', delta: '{"cmd":' },
      { type: 'tool-call-delta', toolCallId: 'tc-1', delta: '"ls"}' },
      { type: 'usage', usage: { input: 10, output: 8, total: 18 } },
      { type: 'finish', reason: 'tool-call' },
    ]
    const turn2Text: AgentChunk[] = [
      { type: 'text-delta', delta: 'Done' },
      { type: 'usage', usage: { input: 5, output: 2, total: 7 } },
      { type: 'finish', reason: 'stop' },
    ]
    const model = createMockModel([turn1Deltas, turn2Text])
    const events: LoopEvent[] = []
    const res = await runAgentLoop({
      model,
      messages: [userMsg('run')],
      tools: [tool('bash', async () => 'ok')],
      onEvent: (e) => events.push(e),
    })
    expect(res.reason).toBe('complete')
    expect(res.turns).toBe(2)
    const toolCalls = events.filter((e) => e.type === 'tool-call')
    expect(toolCalls.some((e) => e.toolCall.name === 'bash' && e.toolCall.args.cmd === 'ls')).toBe(
      true,
    )
  })

  it('cancellation with pre-aborted signal', async () => {
    const controller = new AbortController()
    controller.abort() // already aborted
    const model = createMockModel([turn1TextOnly])
    const events: LoopEvent[] = []
    const res = await runAgentLoop({
      model,
      messages: [userMsg('hi')],
      abortSignal: controller.signal,
      onEvent: (e) => events.push(e),
    })
    expect(res.reason).toBe('cancelled')
    expect(res.turns).toBe(0)
    expect(events.some((e) => e.type === 'finish' && e.reason === 'cancelled')).toBe(true)
  })

  it('permission denied -> tool error result', async () => {
    const model = createMockModel([turn1ToolCall, turn2TextDone])
    const events: LoopEvent[] = []
    const res = await runAgentLoop({
      model,
      messages: [userMsg('delete')],
      tools: [tool('bash', async () => 'ok')],
      permissionCheck: () => false,
      onEvent: (e) => events.push(e),
    })
    expect(res.reason).toBe('complete')
    expect(res.turns).toBe(2)
    const toolResult = events.find((e) => e.type === 'tool-result')
    expect(toolResult).toBeDefined()
    expect(toolResult?.error).toContain('permission denied')
  })

  it('tool throws -> error result captured', async () => {
    const model = createMockModel([turn1ToolCall, turn2TextDone])
    const events: LoopEvent[] = []
    const res = await runAgentLoop({
      model,
      messages: [userMsg('crash')],
      tools: [
        tool('bash', async () => {
          throw new Error('kaboom')
        }),
      ],
      onEvent: (e) => events.push(e),
    })
    expect(res.reason).toBe('complete')
    const toolResult = events.find((e) => e.type === 'tool-result')
    expect(toolResult?.error).toBe('kaboom')
  })

  it('maxIterations stops the loop', async () => {
    // First two turns both have tool calls, third would be turn 3 but maxIterations=2
    const turn1Tool: AgentChunk[] = [
      { type: 'tool-call', toolCall: { id: 'tc-1', name: 'bash', args: {} } },
      { type: 'usage', usage: { input: 10, output: 5, total: 15 } },
      { type: 'finish', reason: 'tool-call' },
    ]
    const turn2Tool: AgentChunk[] = [
      { type: 'tool-call', toolCall: { id: 'tc-2', name: 'bash', args: {} } },
      { type: 'usage', usage: { input: 8, output: 3, total: 11 } },
      { type: 'finish', reason: 'tool-call' },
    ]
    const model = createMockModel([turn1Tool, turn2Tool])
    const events: LoopEvent[] = []
    const res = await runAgentLoop({
      model,
      messages: [userMsg('loop')],
      tools: [tool('bash', async () => 'ok')],
      maxIterations: 2,
      onEvent: (e) => events.push(e),
    })
    expect(res.reason).toBe('max-iterations')
    expect(res.turns).toBe(2)
    expect(events.some((e) => e.type === 'finish' && e.reason === 'max-iterations')).toBe(true)
  })

  it('context overflow detected before first turn', async () => {
    const model = createMockModel([], { contextWindow: 100, maxTokens: 80 })
    const res = await runAgentLoop({
      model,
      messages: [systemMsg('x'.repeat(1000))],
      tools: [],
    })
    expect(res.reason).toBe('context-overflow')
    expect(res.turns).toBe(0)
  })
})
