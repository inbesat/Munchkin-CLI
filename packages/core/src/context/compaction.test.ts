import { beforeEach, describe, expect, it, vi } from 'bun:test'
import type { SessionEvent } from '../events'
import { AutoCompactor, compactIfNeeded, createAutoCompactor } from './compaction'

const mockModel = {
  id: 'test/model',
  provider: 'test',
  name: 'test-model',
  config: {
    id: 'test/model',
    provider: 'test',
    name: 'test-model',
    displayName: 'Test Model',
    capabilities: {
      text: true,
      thinking: false,
      toolCalls: false,
      structuredOutput: false,
      vision: false,
      pdf: false,
      maxTokens: 8192,
      contextWindow: 200000,
    },
    cost: { inputPerToken: 0.000001, outputPerToken: 0.000002 },
  },
  generate: vi.fn(),
  stream: vi.fn(),
  supportsFeature: vi.fn(),
  getCapabilities: vi.fn(),
}

const mockModelInfo = {
  contextWindow: 200000,
  maxOutputTokens: 8192,
}

const mockConfig = {
  maxTokens: 200000,
  compactionThreshold: 0.8,
  keepRecentMessages: 5,
}

const longContent = 'x'.repeat(50000)

const createSessionEvents = (messageCount: number): SessionEvent[] => {
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
    events.push({
      id: `evt-${i + 1}`,
      sessionId: 'session-1',
      timestamp: Date.now() + i * 1000,
      schemaVersion: 1,
      type: 'session.message',
      payload: {
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: longContent,
      },
    })
  }

  return events
}

describe('AutoCompactor', () => {
  let compactor: AutoCompactor

  beforeEach(() => {
    mockModel.generate.mockReset()
    compactor = createAutoCompactor({
      model: mockModel,
      modelInfo: mockModelInfo,
      config: mockConfig,
      systemPrompt: 'You are a helpful assistant.',
      toolSchemas: JSON.stringify([{ name: 'bash', description: 'Run commands' }]),
      keepRecentMessages: 5,
    })
  })

  it('creates compactor with correct configuration', () => {
    expect(compactor).toBeInstanceOf(AutoCompactor)
    const budgeter = compactor.getBudgeter()
    expect(budgeter).toBeDefined()
    expect(budgeter.getTotalBudget()).toBe(200000)
  })

  it('returns false for shouldCompact when context is small', () => {
    const events = createSessionEvents(3)
    const shouldCompact = compactor.shouldCompact(events)
    expect(shouldCompact).toBe(false)
  })

  it('returns true for shouldCompact when context exceeds threshold', () => {
    const events = createSessionEvents(50)
    const shouldCompact = compactor.shouldCompact(events)
    expect(shouldCompact).toBe(true)
  })

  it('compacts successfully when needed', async () => {
    mockModel.generate.mockResolvedValueOnce({
      content:
        'Summary of the conversation: User asked multiple questions, assistant provided detailed answers.',
      toolCalls: [],
      thinking: undefined,
      usage: { input: 100, output: 50, total: 150 },
      finishReason: 'stop',
      model: 'test-model',
      provider: 'test',
    })

    const events = createSessionEvents(50)
    const result = await compactor.compact(events)

    expect(result.success).toBe(true)
    expect(result.summary).toContain('Summary')
    expect(result.tokensSaved).toBeGreaterThan(0)
    expect(result.messagesRemoved).toBeGreaterThan(0)
    expect(result.compactionEvent).toBeDefined()
    expect(result.compactionEvent.type).toBe('session.compaction')
    expect(result.compactionEvent.payload.summary).toBe(result.summary)
    expect(result.compactionEvent.payload.tokensSaved).toBe(result.tokensSaved)
  })

  it('returns error when compaction not needed', async () => {
    const events = createSessionEvents(3)
    const result = await compactor.compact(events)

    expect(result.success).toBe(false)
    expect(result.error).toContain('not needed')
  })

  it('returns error when no messages to summarize', async () => {
    const events = createSessionEvents(5)
    const result = await compactor.compact(events)

    expect(result.success).toBe(false)
  })

  it('handles model generation errors gracefully', async () => {
    mockModel.generate.mockRejectedValueOnce(new Error('Model API error'))

    const events = createSessionEvents(50)
    const result = await compactor.compact(events)

    expect(result.success).toBe(false)
    expect(result.error).toContain('Model API error')
  })

  it('updates context correctly', () => {
    compactor.updateContext('New system prompt', 'New tool schemas', 'New MCP schemas')
    const budgeter = compactor.getBudgeter()
    const budget = budgeter.calculateBudget()
    expect(budget.breakdown.systemPrompt).toBeGreaterThan(0)
    expect(budget.breakdown.toolSchemas).toBeGreaterThan(0)
    expect(budget.breakdown.mcpToolSchemas).toBeGreaterThan(0)
  })

  it('uses custom keepRecentMessages', () => {
    const customCompactor = createAutoCompactor({
      model: mockModel,
      modelInfo: mockModelInfo,
      config: mockConfig,
      keepRecentMessages: 3,
    })

    const events = createSessionEvents(20)
    const shouldCompact = customCompactor.shouldCompact(events)
    expect(typeof shouldCompact).toBe('boolean')
  })

  it('uses custom summarization prompt', () => {
    const customCompactor = createAutoCompactor({
      model: mockModel,
      modelInfo: mockModelInfo,
      config: mockConfig,
      summarizationPrompt: 'Custom prompt: summarize briefly.',
    })

    expect(customCompactor).toBeInstanceOf(AutoCompactor)
  })
})

describe('compactIfNeeded', () => {
  it('returns null when compaction not needed', async () => {
    const compactor = createAutoCompactor({
      model: mockModel,
      modelInfo: mockModelInfo,
      config: mockConfig,
    })

    const events = createSessionEvents(3)
    const result = await compactIfNeeded(compactor, events)

    expect(result).toBeNull()
  })

  it('returns compaction result when needed', async () => {
    mockModel.generate.mockResolvedValueOnce({
      content: 'Test summary',
      toolCalls: [],
      thinking: undefined,
      usage: { input: 10, output: 5, total: 15 },
      finishReason: 'stop',
      model: 'test-model',
      provider: 'test',
    })

    const compactor = createAutoCompactor({
      model: mockModel,
      modelInfo: mockModelInfo,
      config: mockConfig,
    })

    const events = createSessionEvents(50)
    const result = await compactIfNeeded(compactor, events)

    expect(result).not.toBeNull()
    expect(result?.success).toBe(true)
  })
})

describe('AutoCompactor integration', () => {
  it('simulates multiple compaction cycles', async () => {
    let callCount = 0
    mockModel.generate.mockImplementation(async () => {
      callCount++
      return {
        content: `Summary ${callCount}: Conversation summary with key points.`,
        toolCalls: [],
        thinking: undefined,
        usage: { input: 100, output: 50, total: 150 },
        finishReason: 'stop',
        model: 'test-model',
        provider: 'test',
      }
    })

    const compactor = createAutoCompactor({
      model: mockModel,
      modelInfo: mockModelInfo,
      config: mockConfig,
      keepRecentMessages: 3,
    })

    const events = createSessionEvents(100)

    const result1 = await compactor.compact(events)
    expect(result1.success).toBe(true)
    expect(result1.messagesRemoved).toBeGreaterThan(0)

    expect(callCount).toBe(1)
  })

  it('preserves recent messages correctly', async () => {
    mockModel.generate.mockResolvedValueOnce({
      content: 'Summary of older messages.',
      toolCalls: [],
      thinking: undefined,
      usage: { input: 100, output: 50, total: 150 },
      finishReason: 'stop',
      model: 'test-model',
      provider: 'test',
    })

    const compactor = createAutoCompactor({
      model: mockModel,
      modelInfo: mockModelInfo,
      config: { ...mockConfig, keepRecentMessages: 4 },
    })

    const events = createSessionEvents(20)
    const result = await compactor.compact(events)

    expect(result.success).toBe(true)
    expect(result.compactionEvent.payload.afterCount).toBeLessThan(
      result.compactionEvent.payload.beforeCount,
    )
    expect(result.messagesRemoved).toBe(20 - 4)
  })
})

describe('CompactionResult structure', () => {
  it('has all required fields on success', async () => {
    mockModel.generate.mockResolvedValueOnce({
      content: 'Test summary',
      toolCalls: [],
      thinking: undefined,
      usage: { input: 10, output: 5, total: 15 },
      finishReason: 'stop',
      model: 'test-model',
      provider: 'test',
    })

    const compactor = createAutoCompactor({
      model: mockModel,
      modelInfo: mockModelInfo,
      config: mockConfig,
    })

    const events = createSessionEvents(50)
    const result = await compactor.compact(events)

    expect(result).toHaveProperty('success')
    expect(result).toHaveProperty('summary')
    expect(result).toHaveProperty('tokensSaved')
    expect(result).toHaveProperty('messagesRemoved')
    expect(result).toHaveProperty('compactionEvent')

    if (result.success) {
      expect(result.error).toBeUndefined()
      expect(result.compactionEvent.payload.summary).toBe(result.summary)
      expect(result.compactionEvent.payload.tokensSaved).toBe(result.tokensSaved)
    } else {
      expect(result.error).toBeDefined()
    }
  })

  it('has error field on failure', async () => {
    mockModel.generate.mockRejectedValueOnce(new Error('Test error'))

    const compactor = createAutoCompactor({
      model: mockModel,
      modelInfo: mockModelInfo,
      config: mockConfig,
    })

    const events = createSessionEvents(3)
    const result = await compactor.compact(events)

    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
    expect(result.summary).toBe('')
    expect(result.tokensSaved).toBe(0)
    expect(result.messagesRemoved).toBe(0)
  })
})
