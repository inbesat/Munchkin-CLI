import { beforeEach, describe, expect, it, vi } from 'bun:test'
import type { SessionEvent } from '../events'
import { CompactCommand, runCompactCommand } from './compact-command'

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
  id: 'test/model',
  contextWindow: 200000,
  maxOutputTokens: 8192,
}

const mockConfig = {
  maxTokens: 200000,
  compactionThreshold: 0.8,
  keepRecentMessages: 5,
}

const longContent = 'x'.repeat(20000)

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

describe('CompactCommand', () => {
  let command: CompactCommand

  beforeEach(() => {
    mockModel.generate.mockReset()
    command = new CompactCommand({
      model: mockModel,
      modelInfo: mockModelInfo,
      config: mockConfig,
      systemPrompt: 'You are a helpful assistant.',
      toolSchemas: JSON.stringify([{ name: 'bash', description: 'Run commands' }]),
      events: createSessionEvents(3),
    })
  })

  it('creates command with correct configuration', () => {
    expect(command).toBeInstanceOf(CompactCommand)
  })

  it('returns not needed when context is small', async () => {
    const result = await command.execute()

    expect(result.success).toBe(false)
    expect(result.message).toContain('not needed')
    expect(result.budgetSummary).toBeDefined()
  })

  it('compacts successfully when context is large', async () => {
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

    const largeCommand = new CompactCommand({
      model: mockModel,
      modelInfo: mockModelInfo,
      config: mockConfig,
      systemPrompt: 'You are a helpful assistant.',
      toolSchemas: JSON.stringify([{ name: 'bash', description: 'Run commands' }]),
      events: createSessionEvents(50),
    })

    const result = await largeCommand.execute()

    expect(result.success).toBe(true)
    expect(result.message).toContain('Compaction complete')
    expect(result.message).toContain('messages summarized')
    expect(result.message).toContain('Tokens saved')
    expect(result.compactionResult).toBeDefined()
    expect(result.compactionResult?.success).toBe(true)
    expect(result.compactionResult?.tokensSaved).toBeGreaterThan(0)
    expect(result.compactionResult?.messagesRemoved).toBeGreaterThan(0)
    expect(result.budgetSummary).toBeDefined()
  })

  it('uses focus instruction in summarization prompt', async () => {
    mockModel.generate.mockResolvedValueOnce({
      content: 'Summary focused on auth module.',
      toolCalls: [],
      thinking: undefined,
      usage: { input: 100, output: 50, total: 150 },
      finishReason: 'stop',
      model: 'test-model',
      provider: 'test',
    })

    const largeCommand = new CompactCommand({
      model: mockModel,
      modelInfo: mockModelInfo,
      config: mockConfig,
      systemPrompt: 'You are a helpful assistant.',
      toolSchemas: JSON.stringify([{ name: 'bash', description: 'Run commands' }]),
      events: createSessionEvents(50),
    })

    const result = await largeCommand.execute('focus on auth module')

    expect(result.success).toBe(true)
    expect(result.compactionResult).toBeDefined()
    expect(mockModel.generate).toHaveBeenCalled()
  })

  it('returns budget summary', () => {
    const summary = command.getBudgetSummary()
    expect(summary).toContain('Context Budget:')
    expect(summary).toContain('Breakdown:')
  })

  it('detects when compaction should trigger', () => {
    const smallCommand = new CompactCommand({
      model: mockModel,
      modelInfo: mockModelInfo,
      config: mockConfig,
      events: createSessionEvents(3),
    })
    expect(smallCommand.shouldCompact()).toBe(false)

    const largeCommand = new CompactCommand({
      model: mockModel,
      modelInfo: mockModelInfo,
      config: mockConfig,
      events: createSessionEvents(50),
    })
    expect(largeCommand.shouldCompact()).toBe(true)
  })
})

describe('runCompactCommand', () => {
  it('executes compact command and returns result', async () => {
    mockModel.generate.mockResolvedValueOnce({
      content: 'Test summary',
      toolCalls: [],
      thinking: undefined,
      usage: { input: 10, output: 5, total: 15 },
      finishReason: 'stop',
      model: 'test-model',
      provider: 'test',
    })

    const result = await runCompactCommand({
      model: mockModel,
      modelInfo: mockModelInfo,
      config: mockConfig,
      systemPrompt: 'You are a helpful assistant.',
      toolSchemas: JSON.stringify([{ name: 'bash', description: 'Run commands' }]),
      events: createSessionEvents(50),
      focusInstruction: 'focus on authentication',
    })

    expect(result.success).toBe(true)
    expect(result.message).toContain('Compaction complete')
    expect(result.compactionResult).toBeDefined()
    expect(mockModel.generate).toHaveBeenCalled()
  })

  it('returns not needed when context is small', async () => {
    const result = await runCompactCommand({
      model: mockModel,
      modelInfo: mockModelInfo,
      config: mockConfig,
      events: createSessionEvents(3),
    })

    expect(result.success).toBe(false)
    expect(result.message).toContain('not needed')
  })
})
