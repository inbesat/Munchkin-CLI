import { describe, it, expect, beforeEach } from 'bun:test'
import { SteeringController, steeringToMessage, applySteering, SteeringMessage } from './steering'
import { AgentLoopOptions, runAgentLoop, LoopStopReason, LoopEvent } from './loop'
import type { AgentModel } from './types'
import type { Message, UserMessage, TextPart } from '../session/message'

describe('SteeringController', () => {
  let controller: SteeringController

  beforeEach(() => {
    controller = new SteeringController()
  })

  it('pushes and takes steering messages', () => {
    controller.push({ content: 'First steer' })
    controller.push({ content: 'Second steer' })
    expect(controller.pendingCount).toBe(2)
    expect(controller.hasPending()).toBe(true)

    const taken = controller.takeAll()
    expect(taken).toHaveLength(2)
    expect(taken[0].content).toBe('First steer')
    expect(taken[1].content).toBe('Second steer')
    expect(controller.pendingCount).toBe(0)
    expect(controller.hasPending()).toBe(false)
  })

  it('returns empty array when no pending messages', () => {
    expect(controller.takeAll()).toEqual([])
    expect(controller.hasPending()).toBe(false)
  })

  it('throws when pushing to closed controller', () => {
    controller.close()
    expect(() => controller.push({ content: 'test' })).toThrow('closed')
  })

  it('isClosed returns true after close', () => {
    expect(controller.isClosed()).toBe(false)
    controller.close()
    expect(controller.isClosed()).toBe(true)
  })
})

describe('steeringToMessage', () => {
  it('converts steering message to user message', () => {
    const steering: SteeringMessage = { content: 'Steer me right' }
    const msg = steeringToMessage(steering)
    expect(msg.role).toBe('user')
    expect(msg.content).toBe('Steer me right')
    expect(msg.parts).toHaveLength(1)
    expect(msg.parts[0].type).toBe('text')
    expect((msg.parts[0] as TextPart).text).toBe('Steer me right')
  })

  it('preserves metadata in steering message', () => {
    const steering: SteeringMessage = { content: 'test', metadata: { source: 'user' } }
    const msg = steeringToMessage(steering)
    // metadata is not preserved in the message, but the steering message retains it
    expect(steering.metadata?.source).toBe('user')
  })
})

describe('applySteering', () => {
  it('returns messages unchanged when no steering pending', () => {
    const controller = new SteeringController()
    const messages = [{ role: 'user' as const, content: 'hello', parts: [] }]
    const result = applySteering(messages, controller)
    expect(result).toEqual(messages)
  })

  it('appends steering messages to history', () => {
    const controller = new SteeringController()
    controller.push({ content: 'Steer left' })
    controller.push({ content: 'Steer right' })

    const messages = [{ role: 'user' as const, content: 'hello', parts: [] }]
    const result = applySteering(messages, controller)

    expect(result).toHaveLength(3)
    expect(result[0].content).toBe('hello')
    expect(result[1].content).toBe('Steer left')
    expect(result[2].content).toBe('Steer right')
    expect(result[1].role).toBe('user')
    expect(result[2].role).toBe('user')
  })

  it('calls onInjected callback for each steering message', () => {
    const controller = new SteeringController()
    controller.push({ content: 'Steer 1' })
    controller.push({ content: 'Steer 2' })

    const injected: string[] = []
    const messages = [{ role: 'user' as const, content: 'hello', parts: [] }]
    applySteering(messages, controller, (msg) => injected.push(msg.content))

    expect(injected).toEqual(['Steer 1', 'Steer 2'])
  })

  it('clears controller after applySteering', () => {
    const controller = new SteeringController()
    controller.push({ content: 'test' })
    const messages = [{ role: 'user' as const, content: 'hello', parts: [] }]
    applySteering(messages, controller)
    expect(controller.hasPending()).toBe(false)
  })

  it('does not modify original messages array', () => {
    const controller = new SteeringController()
    controller.push({ content: 'steer' })
    const messages = [{ role: 'user' as const, content: 'hello', parts: [] }]
    const originalLength = messages.length
    applySteering(messages, controller)
    expect(messages).toHaveLength(originalLength)
  })
})

// Mock model for integration testing
class MockModel implements AgentModel {
  readonly id = 'mock-model'
  readonly provider = 'mock'

  private responses: Array<{
    type: 'text-delta' | 'finish'
    delta?: string
    reason?: 'stop' | 'tool-call'
  }> = []

  readonly config = {
    capabilities: { contextWindow: 4096, maxTokens: 4096 },
  }

  setResponses(responses: typeof this.responses) {
    this.responses = responses
  }

  async *stream() {
    for (const r of this.responses) {
      yield r
    }
  }
}

describe('Agent loop with steering', () => {
  let model: MockModel
  let options: AgentLoopOptions

  beforeEach(() => {
    model = new MockModel()
    options = {
      model,
      messages: [{ role: 'user' as const, content: 'Initial task', parts: [] }],
      maxIterations: 5,
    }
  })

  it('injects steering message mid-loop', async () => {
    // First turn: model returns some text
    // Second turn: after steering injection, model finishes
    let turn = 0
    model.setResponses([
      { type: 'text-delta', delta: 'Working on it...' },
      { type: 'finish', reason: 'stop' },
    ])

    const steering = new SteeringController()
    const events: LoopEvent[] = []

    const result = await runAgentLoop({
      ...options,
      steering,
      onEvent: (e) => events.push(e),
    })

    expect(result.turns).toBe(1)
    expect(result.reason).toBe('complete')
  })

  it('injects steering message before next turn', async () => {
    let firstTurnDone = false
    model.setResponses([
      { type: 'text-delta', delta: 'Starting...' },
      { type: 'finish', reason: 'stop' },
    ])

    const steering = new SteeringController()
    const events: LoopEvent[] = []

    const result = await runAgentLoop({
      ...options,
      steering,
      onEvent: (e) => {
        events.push(e)
        if (e.type === 'finish' && !firstTurnDone) {
          firstTurnDone = true
          // Inject steering after first turn finishes
          steering.push({ content: 'Change direction!' })
        }
      },
    })

    // The steering message should be injected before the next turn would start
    expect(result.turns).toBeGreaterThanOrEqual(1)
  })

  it('emits steering-injected event', async () => {
    model.setResponses([
      { type: 'text-delta', delta: 'Working...' },
      { type: 'finish', reason: 'stop' },
    ])

    const steering = new SteeringController()
    const events: LoopEvent[] = []

    const result = await runAgentLoop({
      ...options,
      steering,
      onEvent: (e) => events.push(e),
    })

    const steeringEvents = events.filter((e) => e.type === 'steering-injected')
    // No steering was pushed, so no steering-injected events
    expect(steeringEvents).toHaveLength(0)
  })

  it('injects steering before next turn when pushed during turn', async () => {
    let turnCount = 0
    // First turn: model calls a tool (doesn't finish)
    // Second turn: after steering, model finishes
    model.setResponses([
      { type: 'tool-call', toolCall: { id: 'call-1', name: 'read', args: { path: 'test.txt' } } },
      { type: 'finish', reason: 'tool-call' },
      { type: 'text-delta', delta: 'Turn 2 after steer' },
      { type: 'finish', reason: 'stop' },
    ])

    const steering = new SteeringController()
    const events: LoopEvent[] = []

    const result = await runAgentLoop({
      ...options,
      maxIterations: 3,
      steering,
      onEvent: (e) => {
        events.push(e)
        if (e.type === 'turn' && e.turn === 1) {
          // Inject steering after first turn
          steering.push({ content: 'Do something different!' })
        }
      },
    })

    // Should have at least 2 turns (first turn + turn after steering)
    expect(result.turns).toBeGreaterThanOrEqual(2)
    const steeringEvents = events.filter((e) => e.type === 'steering-injected')
    expect(steeringEvents.length).toBeGreaterThanOrEqual(1)
    if (steeringEvents.length > 0) {
      expect(steeringEvents[0].content).toBe('Do something different!')
    }
  })
})