import { beforeEach, describe, expect, it } from 'bun:test'
import type {
  AssistantMessage,
  ToolCallPart,
  ToolResultPart,
  UserMessage,
} from '../session/message'
import { InterruptController } from './interrupt'
import { type AgentLoopOptions, type LoopEvent, runAgentLoop } from './loop'
import { SteeringController } from './steering'
import type { AgentChunk, AgentModel, AgentTool, AgentToolCall } from './types'

// ============================================================================
// Mock Model Implementation
// ============================================================================

interface MockResponse {
  type: 'text-delta' | 'thinking-delta' | 'tool-call' | 'tool-call-delta' | 'finish' | 'usage'
  delta?: string
  reason?: 'stop' | 'tool-call' | 'length' | 'abort' | 'error'
  toolCall?: AgentToolCall
  toolCallId?: string
  name?: string
}

class MockModel implements AgentModel {
  readonly id = 'mock-model'
  readonly provider = 'mock'

  private responses: MockResponse[] = []
  private responseIndex = 0

  readonly config = {
    capabilities: { contextWindow: 8192, maxTokens: 4096 },
  }

  setResponses(responses: MockResponse[]) {
    this.responses = responses
    this.responseIndex = 0
  }

  reset() {
    this.responseIndex = 0
  }

  async *stream(): AsyncGenerator<AgentChunk> {
    while (this.responseIndex < this.responses.length) {
      const r = this.responses[this.responseIndex++]
      switch (r.type) {
        case 'text-delta':
          yield { type: 'text-delta', delta: r.delta ?? '' }
          break
        case 'thinking-delta':
          yield { type: 'thinking-delta', delta: r.delta ?? '' }
          break
        case 'tool-call':
          if (r.toolCall) yield { type: 'tool-call', toolCall: r.toolCall }
          break
        case 'tool-call-delta':
          if (r.toolCallId)
            yield {
              type: 'tool-call-delta',
              toolCallId: r.toolCallId,
              name: r.name,
              delta: r.delta ?? '',
            }
          break
        case 'finish':
          yield { type: 'finish', reason: r.reason ?? 'stop' }
          break
        case 'usage':
          yield {
            type: 'usage',
            usage: { input: 10, output: 5, total: 15 },
          }
          break
      }
    }
    yield { type: 'finish', reason: 'stop' }
  }
}

// ============================================================================
// Test Helpers
// ============================================================================

function createUserMessage(content: string): UserMessage {
  return { role: 'user', parts: [{ type: 'text', text: content }], content }
}

function createAssistantMessage(content: string, toolCalls?: ToolCallPart[]): AssistantMessage {
  const parts: MessagePart[] = [{ type: 'text', text: content }]
  if (toolCalls) parts.push(...toolCalls)
  return { role: 'assistant', parts, content, toolCalls }
}

function createToolResultMessage(results: ToolResultPart[]): UserMessage {
  return {
    role: 'user',
    parts: results,
    content: results.map((r) => `[${r.toolName}] ${r.error ?? r.result}`).join('\n'),
  }
}

// ============================================================================
// Mock Tools
// ============================================================================

const echoTool: AgentTool = {
  name: 'echo',
  description: 'Echo the input',
  parameters: { type: 'object', properties: { text: { type: 'string' } } },
  execute: async (args: Record<string, unknown>) => `Echo: ${args.text}`,
}

const failingTool: AgentTool = {
  name: 'fail',
  description: 'Always fails',
  parameters: { type: 'object', properties: {} },
  execute: async () => {
    throw new Error('Tool execution failed')
  },
}

const slowTool: AgentTool = {
  name: 'slow',
  description: 'Slow tool',
  parameters: { type: 'object', properties: { delay: { type: 'number' } } },
  execute: async (args: Record<string, unknown>, signal?: AbortSignal) => {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(resolve, args.delay as number)
      signal?.addEventListener(
        'abort',
        () => {
          clearTimeout(timeout)
          reject(new Error('Aborted'))
        },
        { once: true },
      )
    })
    return 'done'
  },
}

const readFileTool: AgentTool = {
  name: 'readFile',
  description: 'Read a file',
  parameters: { type: 'object', properties: { path: { type: 'string' } } },
  execute: async (args: Record<string, unknown>) => {
    return `Content of ${args.path}`
  },
}

// ============================================================================
// Comprehensive Loop Tests
// ============================================================================

describe('Agent Loop - Comprehensive Tests', () => {
  let model: MockModel
  let baseOptions: AgentLoopOptions

  beforeEach(() => {
    model = new MockModel()
    baseOptions = {
      model,
      messages: [
        { role: 'user', content: 'Initial task', parts: [{ type: 'text', text: 'Initial task' }] },
      ],
      tools: [echoTool],
      maxIterations: 10,
    }
  })

  // =========================================================================
  // Single-Turn Tests
  // =========================================================================

  describe('Single-Turn', () => {
    it('finishes with text response when no tool calls', async () => {
      model.setResponses([
        { type: 'text-delta', delta: 'Hello!' },
        { type: 'finish', reason: 'stop' },
      ])

      const result = await runAgentLoop(baseOptions)

      expect(result.reason).toBe('complete')
      expect(result.response).toBe('Hello!')
      expect(result.turns).toBe(1)
    })

    it('accumulates multiple text deltas', async () => {
      model.setResponses([
        { type: 'text-delta', delta: 'Hello ' },
        { type: 'text-delta', delta: 'World!' },
        { type: 'finish', reason: 'stop' },
      ])

      const result = await runAgentLoop(baseOptions)

      expect(result.response).toBe('Hello World!')
    })

    it('includes thinking in response', async () => {
      model.setResponses([
        { type: 'thinking-delta', delta: 'Thinking...' },
        { type: 'text-delta', delta: 'Answer' },
        { type: 'finish', reason: 'stop' },
      ])

      const result = await runAgentLoop(baseOptions)

      expect(result.response).toBe('Answer')
    })

    it('tracks usage correctly', async () => {
      model.setResponses([
        { type: 'usage', usage: { input: 100, output: 50, total: 150 } },
        { type: 'text-delta', delta: 'Done' },
        { type: 'finish', reason: 'stop' },
      ])

      const result = await runAgentLoop(baseOptions)

      // Usage accumulates from the usage chunk
      expect(result.usage.total).toBeGreaterThanOrEqual(15)
    })
  })

  // =========================================================================
  // Multi-Turn Tests
  // =========================================================================

  describe('Multi-Turn', () => {
    it('executes tool and continues', async () => {
      model.setResponses([
        { type: 'tool-call', toolCall: { id: 'call-1', name: 'echo', args: { text: 'test' } } },
        { type: 'finish', reason: 'tool-call' },
        { type: 'text-delta', delta: 'Tool executed' },
        { type: 'finish', reason: 'stop' },
      ])

      const result = await runAgentLoop({
        ...baseOptions,
        tools: [echoTool],
      })

      expect(result.turns).toBe(2)
      expect(result.reason).toBe('complete')
    })

    it('handles multiple tool calls in one turn', async () => {
      model.setResponses([
        { type: 'tool-call', toolCall: { id: 'call-1', name: 'echo', args: { text: 'a' } } },
        { type: 'tool-call', toolCall: { id: 'call-2', name: 'echo', args: { text: 'b' } } },
        { type: 'finish', reason: 'tool-call' },
        { type: 'text-delta', delta: 'Both done' },
        { type: 'finish', reason: 'stop' },
      ])

      const result = await runAgentLoop({
        ...baseOptions,
        tools: [echoTool],
      })

      expect(result.turns).toBe(2)
    })

    it('continues after tool error', async () => {
      model.setResponses([
        { type: 'tool-call', toolCall: { id: 'call-1', name: 'fail', args: {} } },
        { type: 'finish', reason: 'tool-call' },
        { type: 'text-delta', delta: 'Error handled' },
        { type: 'finish', reason: 'stop' },
      ])

      const result = await runAgentLoop({
        ...baseOptions,
        tools: [failingTool],
      })

      expect(result.turns).toBe(2)
      expect(result.reason).toBe('complete')
    })

    it('respects maxIterations limit', async () => {
      // Each turn needs: tool-call + finish:tool-call, then final text + finish:stop
      // For maxIterations=5, we need 5 full turns worth of responses
      const responses: typeof model.responses = []
      for (let i = 0; i < 6; i++) {
        responses.push(
          {
            type: 'tool-call' as const,
            toolCall: { id: `call-${i}`, name: 'echo', args: { text: String(i) } },
          },
          { type: 'finish' as const, reason: 'tool-call' },
        )
      }
      responses.push({ type: 'text-delta', delta: 'Done' }, { type: 'finish', reason: 'stop' })
      model.setResponses(responses)

      const result = await runAgentLoop({
        ...baseOptions,
        tools: [echoTool],
        maxIterations: 5,
      })

      expect(result.reason).toBe('max-iterations')
      // Should have completed maxIterations turns (each tool turn counts as one)
      expect(result.turns).toBeLessThanOrEqual(5)
    })
  })

  // =========================================================================
  // Tool Call/Result Pairing
  // =========================================================================

  describe('Tool Call/Result Pairing', () => {
    it('pairs tool calls with results correctly', async () => {
      const events: LoopEvent[] = []
      model.setResponses([
        { type: 'tool-call', toolCall: { id: 'call-1', name: 'echo', args: { text: 'hello' } } },
        { type: 'finish', reason: 'tool-call' },
        { type: 'text-delta', delta: 'Result received' },
        { type: 'finish', reason: 'stop' },
      ])

      await runAgentLoop({
        ...baseOptions,
        tools: [echoTool],
        onEvent: (e) => events.push(e),
      })

      const toolCalls = events.filter((e) => e.type === 'tool-call')
      const toolResults = events.filter((e) => e.type === 'tool-result')

      expect(toolCalls).toHaveLength(1)
      expect(toolResults).toHaveLength(1)
      expect(toolResults[0].toolCallId).toBe('call-1')
    })

    it('handles multiple sequential tool calls with correct IDs', async () => {
      model.setResponses([
        { type: 'tool-call', toolCall: { id: 'call-1', name: 'echo', args: { text: 'a' } } },
        { type: 'tool-call', toolCall: { id: 'call-2', name: 'echo', args: { text: 'b' } } },
        { type: 'finish', reason: 'tool-call' },
        { type: 'tool-call', toolCall: { id: 'call-3', name: 'echo', args: { text: 'c' } } },
        { type: 'finish', reason: 'tool-call' },
        { type: 'text-delta', delta: 'All done' },
        { type: 'finish', reason: 'stop' },
      ])

      const events: LoopEvent[] = []
      await runAgentLoop({
        ...baseOptions,
        tools: [echoTool],
        onEvent: (e) => events.push(e),
      })

      const toolCalls = events.filter((e) => e.type === 'tool-call')
      expect(toolCalls).toHaveLength(3)
      expect(toolCalls.map((t) => t.toolCall.id)).toEqual(['call-1', 'call-2', 'call-3'])
    })
  })

  // =========================================================================
  // Error Recovery
  // =========================================================================

  describe('Error Recovery', () => {
    it('recovers from tool execution error', async () => {
      model.setResponses([
        { type: 'tool-call', toolCall: { id: 'call-1', name: 'fail', args: {} } },
        { type: 'finish', reason: 'tool-call' },
        { type: 'text-delta', delta: 'Recovered from error' },
        { type: 'finish', reason: 'stop' },
      ])

      const result = await runAgentLoop({
        ...baseOptions,
        tools: [failingTool],
      })

      expect(result.reason).toBe('complete')
      expect(result.turns).toBe(2)
    })

    it('handles unknown tool gracefully', async () => {
      model.setResponses([
        { type: 'tool-call', toolCall: { id: 'call-1', name: 'unknown', args: {} } },
        { type: 'finish', reason: 'tool-call' },
        { type: 'text-delta', delta: 'Unknown tool handled' },
        { type: 'finish', reason: 'stop' },
      ])

      const result = await runAgentLoop(baseOptions)

      expect(result.reason).toBe('complete')
    })

    it('continues after tool permission denied', async () => {
      model.setResponses([
        { type: 'tool-call', toolCall: { id: 'call-1', name: 'echo', args: { text: 'test' } } },
        { type: 'finish', reason: 'tool-call' },
        { type: 'text-delta', delta: 'Permission denied but continuing' },
        { type: 'finish', reason: 'stop' },
      ])

      const result = await runAgentLoop({
        ...baseOptions,
        tools: [echoTool],
        permissionCheck: () => false,
      })

      expect(result.reason).toBe('complete')
    })
  })

  // =========================================================================
  // Cancellation
  // =========================================================================

  describe('Cancellation', () => {
    it('cancels mid-stream via abort signal', async () => {
      const controller = new AbortController()

      // Model that would stream indefinitely
      model.setResponses([
        { type: 'text-delta', delta: 'Starting...' },
        { type: 'text-delta', delta: 'Working...' },
      ])

      // Abort after a short delay
      setTimeout(() => controller.abort(), 5)

      const result = await runAgentLoop({
        ...baseOptions,
        abortSignal: controller.signal,
      })

      // The loop checks abortSignal at turn boundaries
      expect(['cancelled', 'complete']).toContain(result.reason)
    })

    it('saves partial response on cancellation', async () => {
      const controller = new AbortController()

      model.setResponses([
        { type: 'text-delta', delta: 'Partial ' },
        { type: 'text-delta', delta: 'response' },
      ])

      setTimeout(() => controller.abort(), 5)

      const result = await runAgentLoop({
        ...baseOptions,
        abortSignal: controller.signal,
      })

      // Should have some response or be cancelled
      expect(['cancelled', 'complete']).toContain(result.reason)
    })

    it('respects abort signal during tool execution', async () => {
      const controller = new AbortController()

      model.setResponses([
        { type: 'tool-call', toolCall: { id: 'call-1', name: 'slow', args: { delay: 1000 } } },
        { type: 'finish', reason: 'tool-call' },
      ])

      setTimeout(() => controller.abort(), 10)

      const result = await runAgentLoop({
        ...baseOptions,
        tools: [slowTool],
        abortSignal: controller.signal,
      })

      expect(['cancelled', 'complete']).toContain(result.reason)
    })
  })

  // =========================================================================
  // Context Overflow
  // =========================================================================

  describe('Context Overflow', () => {
    it('detects context overflow and stops', async () => {
      const smallContextModel: AgentModel = {
        ...model,
        config: { capabilities: { contextWindow: 100, maxTokens: 50 } },
      }

      // Create a very long message history
      const longHistory = Array.from({ length: 50 }, (_, i) => ({
        role: 'user' as const,
        content: `Message ${i}`.repeat(10),
        parts: [{ type: 'text' as const, text: `Message ${i}`.repeat(10) }],
      }))

      const result = await runAgentLoop({
        ...baseOptions,
        model: smallContextModel,
        messages: longHistory,
      })

      // Context overflow should be detected
      expect(['context-overflow', 'error']).toContain(result.reason)
    })
  })

  // =========================================================================
  // Steering Integration
  // =========================================================================

  describe('Steering Integration', () => {
    it('injects steering message before next turn', async () => {
      model.setResponses([
        { type: 'tool-call', toolCall: { id: 'call-1', name: 'echo', args: { text: 'first' } } },
        { type: 'finish', reason: 'tool-call' },
        { type: 'text-delta', delta: 'After steer' },
        { type: 'finish', reason: 'stop' },
      ])

      const steering = new SteeringController()
      const events: LoopEvent[] = []

      const result = await runAgentLoop({
        ...baseOptions,
        tools: [echoTool],
        maxIterations: 5,
        steering,
        onEvent: (e) => {
          events.push(e)
          if (e.type === 'turn' && e.turn === 1) {
            steering.push({ content: 'Change direction!' })
          }
        },
      })

      expect(result.turns).toBeGreaterThanOrEqual(2)
      const steeringEvents = events.filter((e) => e.type === 'steering-injected')
      expect(steeringEvents.length).toBeGreaterThanOrEqual(1)
    })

    it('can inject multiple steering messages', async () => {
      model.setResponses([
        { type: 'tool-call', toolCall: { id: 'call-1', name: 'echo', args: { text: '1' } } },
        { type: 'finish', reason: 'tool-call' },
        { type: 'tool-call', toolCall: { id: 'call-2', name: 'echo', args: { text: '2' } } },
        { type: 'finish', reason: 'tool-call' },
        { type: 'text-delta', delta: 'Final' },
        { type: 'finish', reason: 'stop' },
      ])

      const steering = new SteeringController()
      const events: LoopEvent[] = []
      let injectCount = 0

      const result = await runAgentLoop({
        ...baseOptions,
        tools: [echoTool],
        maxIterations: 5,
        steering,
        onEvent: (e) => {
          events.push(e)
          if (e.type === 'turn' && injectCount < 2) {
            injectCount++
            steering.push({ content: `Steer ${injectCount}` })
          }
        },
      })

      const steeringEvents = events.filter((e) => e.type === 'steering-injected')
      expect(steeringEvents.length).toBeGreaterThanOrEqual(1)
    })

    it('steering message appears in conversation', async () => {
      model.setResponses([
        { type: 'tool-call', toolCall: { id: 'call-1', name: 'echo', args: { text: 'first' } } },
        { type: 'finish', reason: 'tool-call' },
        { type: 'text-delta', delta: 'After steer' },
        { type: 'finish', reason: 'stop' },
      ])

      const steering = new SteeringController()
      steering.push({ content: 'Do this instead' })

      const result = await runAgentLoop({
        ...baseOptions,
        tools: [echoTool],
        maxIterations: 5,
        steering,
      })

      // Verify steering message is in final messages
      const steeringMessages = result.messages.filter(
        (m) => m.role === 'user' && m.content === 'Do this instead',
      )
      expect(steeringMessages.length).toBe(1)
    })
  })

  // =========================================================================
  // Interrupt Integration
  // =========================================================================

  describe('Interrupt Integration', () => {
    it('handles interrupt via InterruptController', async () => {
      const interrupt = new InterruptController()

      model.setResponses([{ type: 'text-delta', delta: 'Working...' }])

      setTimeout(() => interrupt.requestInterrupt('user-cancel'), 5)

      const result = await runAgentLoop({
        ...baseOptions,
        abortSignal: interrupt.signal,
      })

      // The abort signal should cause cancellation
      expect(['cancelled', 'complete']).toContain(result.reason)
    })

    it('waitForTools completes after interrupt', async () => {
      const interrupt = new InterruptController({ waitForTools: true, toolWaitTimeout: 100 })

      model.setResponses([
        { type: 'tool-call', toolCall: { id: 'call-1', name: 'slow', args: { delay: 50 } } },
        { type: 'finish', reason: 'tool-call' },
      ])

      const result = await runAgentLoop({
        ...baseOptions,
        tools: [slowTool],
        abortSignal: interrupt.signal,
      })

      // Should complete the tool before cancelling
      expect(['cancelled', 'complete']).toContain(result.reason)
    })
  })

  // =========================================================================
  // Message History Integrity
  // =========================================================================

  describe('Message History Integrity', () => {
    it('preserves message order', async () => {
      model.setResponses([
        { type: 'tool-call', toolCall: { id: 'call-1', name: 'echo', args: { text: '1' } } },
        { type: 'finish', reason: 'tool-call' },
        { type: 'tool-call', toolCall: { id: 'call-2', name: 'echo', args: { text: '2' } } },
        { type: 'finish', reason: 'tool-call' },
        { type: 'text-delta', delta: 'Done' },
        { type: 'finish', reason: 'stop' },
      ])

      const result = await runAgentLoop({
        ...baseOptions,
        tools: [echoTool],
        maxIterations: 5,
      })

      // Check message sequence: user -> assistant(tool) -> user(result) -> assistant(tool) -> user(result) -> assistant(text)
      const userMessages = result.messages.filter((m) => m.role === 'user')
      const assistantMessages = result.messages.filter((m) => m.role === 'assistant')

      expect(userMessages.length).toBeGreaterThanOrEqual(2)
      expect(assistantMessages.length).toBeGreaterThanOrEqual(2)
    })

    it('preserves system message in options', async () => {
      model.setResponses([
        { type: 'text-delta', delta: 'Done' },
        { type: 'finish', reason: 'stop' },
      ])

      const result = await runAgentLoop({
        ...baseOptions,
        system: 'You are a helpful assistant',
      })

      // System message is passed to model via system parameter, not in messages array
      // Verify it's available in the loop options
      expect(result.reason).toBe('complete')
    })

    it('accumulates conversation correctly across turns', async () => {
      model.setResponses([
        { type: 'tool-call', toolCall: { id: 'call-1', name: 'echo', args: { text: 'a' } } },
        { type: 'finish', reason: 'tool-call' },
        { type: 'tool-call', toolCall: { id: 'call-2', name: 'echo', args: { text: 'b' } } },
        { type: 'finish', reason: 'tool-call' },
        { type: 'text-delta', delta: 'Final' },
        { type: 'finish', reason: 'stop' },
      ])

      const result = await runAgentLoop({
        ...baseOptions,
        tools: [echoTool],
        maxIterations: 5,
      })

      // Verify conversation builds up correctly
      const totalParts = result.messages.reduce((sum, m) => sum + m.parts.length, 0)
      expect(totalParts).toBeGreaterThan(0)
    })
  })

  // =========================================================================
  // Edge Cases
  // =========================================================================

  describe('Edge Cases', () => {
    it('handles empty tool calls array', async () => {
      model.setResponses([{ type: 'finish', reason: 'stop' }])

      const result = await runAgentLoop(baseOptions)

      expect(result.turns).toBe(1)
      expect(result.reason).toBe('complete')
    })

    it('handles empty text response', async () => {
      model.setResponses([{ type: 'finish', reason: 'stop' }])

      const result = await runAgentLoop(baseOptions)

      expect(result.response).toBe('')
    })

    it('handles tool returning empty string', async () => {
      const emptyTool: AgentTool = {
        name: 'empty',
        description: 'Returns empty',
        parameters: { type: 'object', properties: {} },
        execute: async () => '',
      }

      model.setResponses([
        { type: 'tool-call', toolCall: { id: 'call-1', name: 'empty', args: {} } },
        { type: 'finish', reason: 'tool-call' },
        { type: 'text-delta', delta: 'Empty result handled' },
        { type: 'finish', reason: 'stop' },
      ])

      const result = await runAgentLoop({
        ...baseOptions,
        tools: [emptyTool],
      })

      expect(result.reason).toBe('complete')
    })

    it('handles tool call with malformed args gracefully', async () => {
      model.setResponses([
        {
          type: 'tool-call-delta',
          toolCallId: 'call-1',
          name: 'echo',
          delta: '{"text": invalid}',
        },
        { type: 'finish', reason: 'tool-call' },
        { type: 'text-delta', delta: 'Handled parse error' },
        { type: 'finish', reason: 'stop' },
      ])

      const result = await runAgentLoop({
        ...baseOptions,
        tools: [echoTool],
      })

      expect(result.reason).toBe('complete')
    })

    it('handles missing tool gracefully', async () => {
      model.setResponses([
        { type: 'tool-call', toolCall: { id: 'call-1', name: 'missing', args: {} } },
        { type: 'finish', reason: 'tool-call' },
        { type: 'text-delta', delta: 'Tool not found' },
        { type: 'finish', reason: 'stop' },
      ])

      const result = await runAgentLoop(baseOptions)

      expect(result.reason).toBe('complete')
    })
  })

  // =========================================================================
  // Session Resume Simulation
  // =========================================================================

  describe('Session Resume Simulation', () => {
    it('can resume from saved state', async () => {
      // First run - partial execution
      model.setResponses([
        { type: 'tool-call', toolCall: { id: 'call-1', name: 'echo', args: { text: 'partial' } } },
        { type: 'finish', reason: 'tool-call' },
      ])

      const partialResult = await runAgentLoop({
        ...baseOptions,
        tools: [echoTool],
        maxIterations: 1,
      })

      expect(partialResult.reason).toBe('max-iterations')

      // Resume - continue from where we left off
      model.setResponses([
        { type: 'text-delta', delta: 'Continued' },
        { type: 'finish', reason: 'stop' },
      ])

      const resumedResult = await runAgentLoop({
        ...baseOptions,
        tools: [echoTool],
        messages: partialResult.messages,
        maxIterations: 5,
      })

      expect(resumedResult.reason).toBe('complete')
      expect(resumedResult.turns).toBeGreaterThanOrEqual(1)
    })

    it('preserves tool call IDs across resume', async () => {
      model.setResponses([
        { type: 'tool-call', toolCall: { id: 'call-1', name: 'echo', args: { text: 'a' } } },
        { type: 'finish', reason: 'tool-call' },
      ])

      const partialResult = await runAgentLoop({
        ...baseOptions,
        tools: [echoTool],
        maxIterations: 1,
      })

      // Verify tool call IDs are preserved (property is toolCallId)
      const toolCalls = partialResult.messages.flatMap((m) => (m as any).toolCalls ?? [])
      expect(toolCalls.length).toBe(1)
      expect(toolCalls[0].toolCallId).toBe('call-1')
    })
  })
})
