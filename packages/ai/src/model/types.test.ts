import { beforeEach, describe, expect, it } from 'bun:test'
import { createModelCatalog } from './catalog'
import type { ModelCatalog, ModelCatalogEntry } from './catalog'
import type {
  FinishReason,
  GenerateOptions,
  GenerateResult,
  Model,
  ModelCapabilities,
  ModelConfig,
  ModelCostConfig,
  ModelMessage,
  StreamChunk,
  TokenUsage,
  ToolCall,
  ToolDefinition,
  ToolResult,
} from './types'

function mockCapabilities(overrides?: Partial<ModelCapabilities>): ModelCapabilities {
  return {
    text: true,
    thinking: false,
    toolCalls: true,
    structuredOutput: false,
    vision: false,
    pdf: false,
    maxTokens: 8192,
    contextWindow: 128000,
    ...overrides,
  }
}

function mockCost(overrides?: Partial<ModelCostConfig>): ModelCostConfig {
  return {
    inputPerToken: 0.000003,
    outputPerToken: 0.000015,
    ...overrides,
  }
}

function mockModelConfig(overrides?: Partial<ModelConfig>): ModelConfig {
  return {
    id: 'test-model',
    provider: 'test-provider',
    name: 'test-model',
    displayName: 'Test Model',
    capabilities: mockCapabilities(),
    cost: mockCost(),
    ...overrides,
  }
}

function mockModel(configOverrides?: Partial<ModelConfig>): Model {
  const config = mockModelConfig(configOverrides)
  return {
    id: config.id,
    provider: config.provider,
    name: config.name,
    config,
    async generate(_options: GenerateOptions): Promise<GenerateResult> {
      return {
        content: 'Hello',
        toolCalls: [],
        usage: { input: 10, output: 5, total: 15 },
        finishReason: 'stop',
        model: config.name,
        provider: config.provider,
      }
    },
    async *stream(_options: GenerateOptions): AsyncIterable<StreamChunk> {
      yield { type: 'text-delta', delta: 'Hello' }
      yield { type: 'finish', reason: 'stop' }
    },
    supportsFeature(feature: keyof ModelCapabilities): boolean {
      return !!config.capabilities[feature]
    },
    getCapabilities(): ModelCapabilities {
      return config.capabilities
    },
  }
}

describe('ModelCapabilities', () => {
  it('has correct default values', () => {
    const caps = mockCapabilities()
    expect(caps.text).toBe(true)
    expect(caps.thinking).toBe(false)
    expect(caps.toolCalls).toBe(true)
    expect(caps.structuredOutput).toBe(false)
    expect(caps.vision).toBe(false)
    expect(caps.pdf).toBe(false)
    expect(caps.maxTokens).toBe(8192)
    expect(caps.contextWindow).toBe(128000)
  })

  it('can override capabilities', () => {
    const caps = mockCapabilities({ thinking: true, vision: true, maxTokens: 32000 })
    expect(caps.thinking).toBe(true)
    expect(caps.vision).toBe(true)
    expect(caps.maxTokens).toBe(32000)
  })
})

describe('ModelConfig', () => {
  it('has required fields', () => {
    const config = mockModelConfig()
    expect(config.id).toBeTruthy()
    expect(config.provider).toBeTruthy()
    expect(config.name).toBeTruthy()
    expect(config.displayName).toBeTruthy()
    expect(config.capabilities).toBeDefined()
    expect(config.cost).toBeDefined()
  })

  it('cost config has token pricing', () => {
    const cost = mockCost()
    expect(cost.inputPerToken).toBeGreaterThan(0)
    expect(cost.outputPerToken).toBeGreaterThan(0)
  })

  it('cost config supports cache pricing', () => {
    const cost = mockCost({ cacheReadPerToken: 0.0000003, cacheWritePerToken: 0.00000375 })
    expect(cost.cacheReadPerToken).toBe(0.0000003)
    expect(cost.cacheWritePerToken).toBe(0.00000375)
  })
})

describe('Model interface', () => {
  it('mock model satisfies Model interface', () => {
    const model = mockModel()
    expect(model.id).toBeTruthy()
    expect(model.provider).toBeTruthy()
    expect(model.name).toBeTruthy()
    expect(model.config).toBeDefined()
    expect(typeof model.generate).toBe('function')
    expect(typeof model.stream).toBe('function')
    expect(typeof model.supportsFeature).toBe('function')
    expect(typeof model.getCapabilities).toBe('function')
  })

  it('generate returns GenerateResult', async () => {
    const model = mockModel()
    const result = await model.generate({
      messages: [{ role: 'user', content: 'hello' }],
    })
    expect(result.content).toBe('Hello')
    expect(result.toolCalls).toEqual([])
    expect(result.usage.input).toBe(10)
    expect(result.usage.output).toBe(5)
    expect(result.usage.total).toBe(15)
    expect(result.finishReason).toBe('stop')
    expect(result.model).toBe('test-model')
    expect(result.provider).toBe('test-provider')
  })

  it('stream yields StreamChunks', async () => {
    const model = mockModel()
    const chunks: StreamChunk[] = []
    for await (const chunk of model.stream({
      messages: [{ role: 'user', content: 'hello' }],
    })) {
      chunks.push(chunk)
    }
    expect(chunks).toHaveLength(2)
    expect(chunks[0]).toEqual({ type: 'text-delta', delta: 'Hello' })
    expect(chunks[1]).toEqual({ type: 'finish', reason: 'stop' })
  })

  it('supportsFeature returns capability value', () => {
    const model = mockModel()
    expect(model.supportsFeature('text')).toBe(true)
    expect(model.supportsFeature('thinking')).toBe(false)
    expect(model.supportsFeature('toolCalls')).toBe(true)
    expect(model.supportsFeature('vision')).toBe(false)
  })

  it('getCapabilities returns full capabilities', () => {
    const model = mockModel()
    const caps = model.getCapabilities()
    expect(caps.text).toBe(true)
    expect(caps.contextWindow).toBe(128000)
  })

  it('can create model with thinking enabled', async () => {
    const model = mockModel({ capabilities: mockCapabilities({ thinking: true }) })
    const caps = model.getCapabilities()
    expect(caps.thinking).toBe(true)
  })

  it('can create model with vision support', () => {
    const model = mockModel({ capabilities: mockCapabilities({ vision: true }) })
    expect(model.supportsFeature('vision')).toBe(true)
  })
})

describe('StreamChunk types', () => {
  it('text-delta chunk has delta', () => {
    const chunk: StreamChunk = { type: 'text-delta', delta: 'hello' }
    expect(chunk.type).toBe('text-delta')
    expect(chunk.delta).toBe('hello')
  })

  it('thinking-delta chunk has delta', () => {
    const chunk: StreamChunk = { type: 'thinking-delta', delta: 'thinking...' }
    expect(chunk.type).toBe('thinking-delta')
  })

  it('tool-call chunk has toolCall', () => {
    const tc: ToolCall = { id: 'tc-1', name: 'bash', args: { command: 'ls' } }
    const chunk: StreamChunk = { type: 'tool-call', toolCall: tc }
    expect(chunk.type).toBe('tool-call')
    expect(chunk.toolCall.id).toBe('tc-1')
  })

  it('usage chunk has usage', () => {
    const usage: TokenUsage = { input: 10, output: 5, total: 15 }
    const chunk: StreamChunk = { type: 'usage', usage }
    expect(chunk.type).toBe('usage')
    expect(chunk.usage.total).toBe(15)
  })

  it('finish chunk has reason', () => {
    const chunk: StreamChunk = { type: 'finish', reason: 'stop' }
    expect(chunk.type).toBe('finish')
    expect(chunk.reason).toBe('stop')
  })
})

describe('GenerateOptions', () => {
  it('requires messages', () => {
    const opts: GenerateOptions = {
      messages: [{ role: 'user', content: 'hello' }],
    }
    expect(opts.messages).toHaveLength(1)
  })

  it('supports system prompt', () => {
    const opts: GenerateOptions = {
      messages: [{ role: 'user', content: 'hello' }],
      system: 'You are a helpful assistant.',
    }
    expect(opts.system).toBeTruthy()
  })

  it('supports tools', () => {
    const tools: ToolDefinition[] = [{ name: 'bash', description: 'Run a command', parameters: {} }]
    const opts: GenerateOptions = {
      messages: [{ role: 'user', content: 'hello' }],
      tools,
    }
    expect(opts.tools).toHaveLength(1)
  })

  it('supports thinking option', () => {
    const opts: GenerateOptions = {
      messages: [{ role: 'user', content: 'hello' }],
      thinking: { budgetTokens: 10000 },
    }
    expect(opts.thinking).toEqual({ budgetTokens: 10000 })
  })

  it('supports abort signal', () => {
    const controller = new AbortController()
    const opts: GenerateOptions = {
      messages: [{ role: 'user', content: 'hello' }],
      abortSignal: controller.signal,
    }
    expect(opts.abortSignal).toBe(controller.signal)
  })
})

describe('TokenUsage', () => {
  it('tracks input and output tokens', () => {
    const usage: TokenUsage = { input: 100, output: 50, total: 150 }
    expect(usage.input + usage.output).toBe(usage.total)
  })

  it('supports cache tokens', () => {
    const usage: TokenUsage = { input: 100, output: 50, cacheRead: 30, cacheWrite: 20, total: 150 }
    expect(usage.cacheRead).toBe(30)
    expect(usage.cacheWrite).toBe(20)
  })
})

describe('ToolCall', () => {
  it('has id, name, and args', () => {
    const tc: ToolCall = { id: 'tc-1', name: 'bash', args: { command: 'ls' } }
    expect(tc.id).toBe('tc-1')
    expect(tc.name).toBe('bash')
    expect(tc.args.command).toBe('ls')
  })
})

describe('ToolResult', () => {
  it('has toolCallId, toolName, result, and durationMs', () => {
    const tr: ToolResult = {
      toolCallId: 'tc-1',
      toolName: 'bash',
      result: 'file1.txt',
      durationMs: 50,
    }
    expect(tr.toolCallId).toBe('tc-1')
    expect(tr.toolName).toBe('bash')
    expect(tr.result).toBe('file1.txt')
    expect(tr.durationMs).toBe(50)
  })

  it('supports optional error', () => {
    const tr: ToolResult = {
      toolCallId: 'tc-1',
      toolName: 'bash',
      result: '',
      error: 'command failed',
      durationMs: 10,
    }
    expect(tr.error).toBe('command failed')
  })
})

describe('FinishReason', () => {
  it('accepts all valid reasons', () => {
    const reasons: FinishReason[] = ['stop', 'tool-call', 'length', 'abort', 'error']
    expect(reasons).toHaveLength(5)
  })
})

describe('ModelMessage', () => {
  it('user message', () => {
    const msg: ModelMessage = { role: 'user', content: 'hello' }
    expect(msg.role).toBe('user')
  })

  it('assistant message with tool calls', () => {
    const msg: ModelMessage = {
      role: 'assistant',
      content: 'let me run that',
      toolCalls: [{ id: 'tc-1', name: 'bash', args: { command: 'ls' } }],
    }
    expect(msg.toolCalls).toHaveLength(1)
  })

  it('user message with tool results', () => {
    const msg: ModelMessage = {
      role: 'user',
      content: '',
      toolResults: [{ toolCallId: 'tc-1', toolName: 'bash', result: 'ok', durationMs: 10 }],
    }
    expect(msg.toolResults).toHaveLength(1)
  })

  it('system message', () => {
    const msg: ModelMessage = { role: 'system', content: 'You are helpful.' }
    expect(msg.role).toBe('system')
  })
})

describe('ModelCatalog', () => {
  let catalog: ModelCatalog

  const entry1: ModelCatalogEntry = {
    config: mockModelConfig({
      id: 'claude-sonnet',
      provider: 'anthropic',
      name: 'claude-sonnet-4-20250514',
      displayName: 'Claude Sonnet',
    }),
    factory: () => mockModel({ provider: 'anthropic', name: 'claude-sonnet-4-20250514' }),
  }

  const entry2: ModelCatalogEntry = {
    config: mockModelConfig({
      id: 'claude-opus',
      provider: 'anthropic',
      name: 'claude-opus-4-20250514',
      displayName: 'Claude Opus',
      capabilities: mockCapabilities({ thinking: true, maxTokens: 32000 }),
    }),
    factory: () =>
      mockModel({
        provider: 'anthropic',
        name: 'claude-opus-4-20250514',
        capabilities: mockCapabilities({ thinking: true, maxTokens: 32000 }),
      }),
  }

  const entry3: ModelCatalogEntry = {
    config: mockModelConfig({
      id: 'gpt-4o',
      provider: 'openai',
      name: 'gpt-4o',
      displayName: 'GPT-4o',
      capabilities: mockCapabilities({ structuredOutput: true, vision: true }),
    }),
    factory: () =>
      mockModel({
        provider: 'openai',
        name: 'gpt-4o',
        capabilities: mockCapabilities({ structuredOutput: true, vision: true }),
      }),
  }

  beforeEach(() => {
    catalog = createModelCatalog()
    catalog.register(entry1)
    catalog.register(entry2)
    catalog.register(entry3)
  })

  it('registers and retrieves models', () => {
    const model = catalog.getModel('anthropic', 'claude-sonnet-4-20250514')
    expect(model).toBeDefined()
    expect(model?.provider).toBe('anthropic')
    expect(model?.name).toBe('claude-sonnet-4-20250514')
  })

  it('returns undefined for unknown model', () => {
    expect(catalog.getModel('anthropic', 'unknown')).toBeUndefined()
    expect(catalog.getModel('unknown', 'claude-sonnet-4-20250514')).toBeUndefined()
  })

  it('gets config without creating model', () => {
    const config = catalog.getConfig('anthropic', 'claude-sonnet-4-20250514')
    expect(config).toBeDefined()
    expect(config?.displayName).toBe('Claude Sonnet')
  })

  it('lists all models', () => {
    const models = catalog.listModels()
    expect(models).toHaveLength(3)
  })

  it('lists models by provider', () => {
    const anthropic = catalog.listModels('anthropic')
    expect(anthropic).toHaveLength(2)
    const openai = catalog.listModels('openai')
    expect(openai).toHaveLength(1)
  })

  it('returns empty for unknown provider', () => {
    expect(catalog.listModels('google')).toHaveLength(0)
  })

  it('gets distinct providers', () => {
    const providers = catalog.getProviders()
    expect(providers).toHaveLength(2)
    expect(providers).toContain('anthropic')
    expect(providers).toContain('openai')
  })

  it('hasModel returns correct results', () => {
    expect(catalog.hasModel('anthropic', 'claude-sonnet-4-20250514')).toBe(true)
    expect(catalog.hasModel('anthropic', 'unknown')).toBe(false)
  })

  it('searchModels by capability', () => {
    const thinking = catalog.searchModels({ thinking: true })
    expect(thinking).toHaveLength(1)
    expect(thinking[0].name).toBe('claude-opus-4-20250514')
  })

  it('searchModels by vision', () => {
    const vision = catalog.searchModels({ vision: true })
    expect(vision).toHaveLength(1)
    expect(vision[0].name).toBe('gpt-4o')
  })

  it('searchModels by multiple capabilities', () => {
    const results = catalog.searchModels({ text: true, toolCalls: true })
    expect(results).toHaveLength(3)
  })

  it('searchModels returns empty for no match', () => {
    const results = catalog.searchModels({ pdf: true })
    expect(results).toHaveLength(0)
  })

  it('searchModels ignores undefined values', () => {
    const results = catalog.searchModels({ text: undefined })
    expect(results).toHaveLength(3)
  })

  it('creates new model instance each call', () => {
    const m1 = catalog.getModel('anthropic', 'claude-sonnet-4-20250514')
    const m2 = catalog.getModel('anthropic', 'claude-sonnet-4-20250514')
    expect(m1).not.toBe(m2)
  })

  it('factory creates correct model type', () => {
    const model = catalog.getModel('anthropic', 'claude-opus-4-20250514')
    expect(model).toBeDefined()
    expect(model?.getCapabilities().thinking).toBe(true)
  })
})
