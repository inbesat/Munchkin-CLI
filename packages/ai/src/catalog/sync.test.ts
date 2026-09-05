import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import type { ModelConfig } from '../model/types'
import {
  createCatalogManager,
  filterModels,
  getModelStats,
  mergeWithLocal,
  syncCatalog,
  syncCatalogToMap,
} from './index'

const mockProviderResponse = {
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic',
    env: ['ANTHROPIC_API_KEY'],
    npm: '@ai-sdk/anthropic',
    doc: 'https://docs.anthropic.com',
    models: {
      'claude-3-5-sonnet-20241022': {
        id: 'claude-3-5-sonnet-20241022',
        name: 'Claude 3.5 Sonnet',
        cost: { input: 3, output: 15 },
        limit: { context: 200000, output: 8192 },
        reasoning: false,
        tool_call: true,
        structured_output: true,
        modalities: { input: ['text', 'image'], output: ['text'] },
        status: 'stable',
      },
      'claude-3-5-haiku-20241022': {
        id: 'claude-3-5-haiku-20241022',
        name: 'Claude 3.5 Haiku',
        cost: { input: 1, output: 5 },
        limit: { context: 200000, output: 8192 },
        reasoning: false,
        tool_call: true,
        structured_output: true,
        modalities: { input: ['text', 'image'], output: ['text'] },
        status: 'stable',
      },
    },
  },
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    env: ['DEEPSEEK_API_KEY'],
    npm: '@ai-sdk/openai-compatible',
    api: 'https://api.deepseek.com/v1',
    doc: 'https://platform.deepseek.com',
    models: {
      'deepseek-chat': {
        id: 'deepseek-chat',
        name: 'DeepSeek Chat',
        cost: { input: 0.14, output: 0.28 },
        limit: { context: 65536, output: 4096 },
        reasoning: false,
        tool_call: true,
        structured_output: false,
        modalities: { input: ['text'], output: ['text'] },
        status: 'stable',
      },
    },
  },
  google: {
    id: 'google',
    name: 'Google',
    env: ['GOOGLE_GENERATIVE_AI_API_KEY'],
    npm: '@ai-sdk/google',
    doc: 'https://ai.google.dev',
    models: {
      'gemini-2.5-pro': {
        id: 'gemini-2.5-pro',
        name: 'Gemini 2.5 Pro',
        cost: { input: 1.25, output: 10 },
        limit: { context: 1000000, output: 65536 },
        reasoning: true,
        tool_call: true,
        structured_output: true,
        modalities: { input: ['text', 'image', 'video', 'pdf'], output: ['text'] },
        status: 'stable',
      },
    },
  },
  deprecatedprovider: {
    id: 'deprecatedprovider',
    name: 'Deprecated',
    env: ['DEPRECATED_KEY'],
    npm: '@ai-sdk/openai-compatible',
    doc: 'https://example.com',
    models: {
      'old-model': {
        id: 'old-model',
        name: 'Old Model',
        cost: { input: 1, output: 1 },
        limit: { context: 4096, output: 1024 },
        reasoning: false,
        tool_call: false,
        structured_output: false,
        modalities: { input: ['text'], output: ['text'] },
        status: 'deprecated',
      },
    },
  },
}

const localTestModels: readonly ModelConfig[] = [
  {
    id: 'local/test-model',
    provider: 'local',
    name: 'test-model',
    displayName: 'Test Model',
    capabilities: {
      text: true,
      thinking: false,
      toolCalls: true,
      structuredOutput: false,
      vision: false,
      pdf: false,
      maxTokens: 2048,
      contextWindow: 8192,
    },
    cost: { inputPerToken: 0.000001, outputPerToken: 0.000002 },
    defaultMaxTokens: 2048,
  },
]

describe('syncCatalog', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockProviderResponse),
      }),
    ) as unknown as typeof fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test('fetches and converts models from API', async () => {
    const models = await syncCatalog()

    expect(models.length).toBeGreaterThan(0)

    const claudeModel = models.find((m) => m.modelId === 'claude-3-5-sonnet-20241022')
    expect(claudeModel).toBeDefined()
    expect(claudeModel?.provider).toBe('anthropic')
    expect(claudeModel?.config.id).toBe('anthropic/claude-3-5-sonnet-20241022')
    expect(claudeModel?.config.capabilities.thinking).toBe(false)
    expect(claudeModel?.config.capabilities.toolCalls).toBe(true)
    expect(claudeModel?.config.capabilities.vision).toBe(true)
    expect(claudeModel?.config.cost.inputPerToken).toBe(3 / 1_000_000)
    expect(claudeModel?.config.cost.outputPerToken).toBe(15 / 1_000_000)
    expect(claudeModel?.config.capabilities.contextWindow).toBe(200000)
    expect(claudeModel?.config.defaultMaxTokens).toBe(8192)
  })

  test('skips deprecated models', async () => {
    const models = await syncCatalog()

    const deprecatedModel = models.find((m) => m.modelId === 'old-model')
    expect(deprecatedModel).toBeUndefined()
  })

  test('maps provider names correctly', async () => {
    const models = await syncCatalog()

    const deepseekModel = models.find((m) => m.modelId === 'deepseek-chat')
    expect(deepseekModel).toBeDefined()
    expect(deepseekModel?.provider).toBe('deepseek')
  })

  test('resolves reasoning capability from API', async () => {
    const models = await syncCatalog()

    const geminiModel = models.find((m) => m.modelId === 'gemini-2.5-pro')
    expect(geminiModel).toBeDefined()
    expect(geminiModel?.config.capabilities.thinking).toBe(true)
    expect(geminiModel?.config.capabilities.contextWindow).toBe(1000000)
  })

  test('handles missing cost with zeros', async () => {
    const response = {
      testprovider: {
        id: 'testprovider',
        name: 'Test',
        env: ['TEST_KEY'],
        npm: '@ai-sdk/openai-compatible',
        doc: 'https://test.com',
        models: {
          'free-model': {
            id: 'free-model',
            name: 'Free Model',
            limit: { context: 4096, output: 1024 },
            reasoning: false,
            tool_call: false,
            structured_output: false,
            modalities: { input: ['text'], output: ['text'] },
            status: 'stable',
          },
        },
      },
    }

    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(response),
      }),
    ) as unknown as typeof fetch

    const models = await syncCatalog()

    expect(models.length).toBe(1)
    expect(models[0].config.cost.inputPerToken).toBe(0)
    expect(models[0].config.cost.outputPerToken).toBe(0)
  })

  test('filters by includeProviders', async () => {
    const models = await syncCatalog({ includeProviders: ['anthropic'] })

    expect(models.every((m) => m.provider === 'anthropic')).toBe(true)
  })

  test('filters by excludeProviders', async () => {
    const models = await syncCatalog({ excludeProviders: ['anthropic'] })

    expect(models.every((m) => m.provider !== 'anthropic')).toBe(true)
  })

  test('throws on network error', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      }),
    ) as unknown as typeof fetch

    await expect(syncCatalog()).rejects.toThrow(
      'Failed to fetch catalog: 500 Internal Server Error',
    )
  })
})

describe('syncCatalogToMap', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockProviderResponse),
      }),
    ) as unknown as typeof fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test('returns a Map keyed by config id', async () => {
    const map = await syncCatalogToMap()

    expect(map).toBeInstanceOf(Map)
    expect(map.has('anthropic/claude-3-5-sonnet-20241022')).toBe(true)
    expect(map.has('deepseek/deepseek-chat')).toBe(true)

    const claudeModel = map.get('anthropic/claude-3-5-sonnet-20241022')
    expect(claudeModel).toBeDefined()
    expect(claudeModel?.provider).toBe('anthropic')
  })
})

describe('mergeWithLocal', () => {
  test('local models override synced models', () => {
    const synced = [
      {
        config: {
          id: 'test/model',
          provider: 'test',
          name: 'model',
          displayName: 'Synced Model',
          capabilities: {
            text: true,
            thinking: false,
            toolCalls: false,
            structuredOutput: false,
            vision: false,
            pdf: false,
            maxTokens: 4096,
            contextWindow: 128000,
          },
          cost: { inputPerToken: 0.000001, outputPerToken: 0.000002 },
          defaultMaxTokens: 4096,
        },
        provider: 'test',
        modelId: 'model',
      },
    ]

    const local = [
      {
        id: 'test/model',
        provider: 'test',
        name: 'model',
        displayName: 'Local Model',
        capabilities: {
          text: true,
          thinking: false,
          toolCalls: true,
          structuredOutput: false,
          vision: false,
          pdf: false,
          maxTokens: 8192,
          contextWindow: 256000,
        },
        cost: { inputPerToken: 0.000003, outputPerToken: 0.000004 },
        defaultMaxTokens: 8192,
      },
    ]

    const merged = mergeWithLocal(synced, local)

    expect(merged.length).toBe(1)
    expect(merged[0].displayName).toBe('Local Model')
    expect(merged[0].capabilities.toolCalls).toBe(true)
  })

  test('preserves unique synced models', () => {
    const synced = [
      {
        config: {
          id: 'test/synced',
          provider: 'test',
          name: 'synced',
          displayName: 'Synced',
          capabilities: {
            text: true,
            thinking: false,
            toolCalls: false,
            structuredOutput: false,
            vision: false,
            pdf: false,
            maxTokens: 4096,
            contextWindow: 128000,
          },
          cost: { inputPerToken: 0, outputPerToken: 0 },
          defaultMaxTokens: 4096,
        },
        provider: 'test',
        modelId: 'synced',
      },
    ]

    const merged = mergeWithLocal(synced, [])

    expect(merged.length).toBe(1)
    expect(merged[0].id).toBe('test/synced')
  })
})

describe('filterModels', () => {
  const testModels: readonly ModelConfig[] = [
    {
      id: 'a/model',
      provider: 'a',
      name: 'model',
      displayName: 'Model A',
      capabilities: {
        text: true,
        thinking: false,
        toolCalls: true,
        structuredOutput: false,
        vision: false,
        pdf: false,
        maxTokens: 4096,
        contextWindow: 128000,
      },
      cost: { inputPerToken: 0.000003, outputPerToken: 0.000015 },
      defaultMaxTokens: 4096,
    },
    {
      id: 'b/model',
      provider: 'b',
      name: 'model',
      displayName: 'Model B',
      capabilities: {
        text: true,
        thinking: true,
        toolCalls: true,
        structuredOutput: true,
        vision: true,
        pdf: false,
        maxTokens: 8192,
        contextWindow: 1000000,
      },
      cost: { inputPerToken: 0, outputPerToken: 0 },
      defaultMaxTokens: 8192,
    },
    {
      id: 'c/model',
      provider: 'c',
      name: 'model',
      displayName: 'Model C',
      capabilities: {
        text: true,
        thinking: false,
        toolCalls: false,
        structuredOutput: false,
        vision: true,
        pdf: false,
        maxTokens: 4096,
        contextWindow: 32000,
      },
      cost: { inputPerToken: 0.00001, outputPerToken: 0.00003 },
      defaultMaxTokens: 4096,
    },
  ]

  test('filters by provider', () => {
    const result = filterModels(testModels, { provider: 'a' })
    expect(result.length).toBe(1)
    expect(result[0].provider).toBe('a')
  })

  test('filters by minContextWindow', () => {
    const result = filterModels(testModels, { minContextWindow: 500000 })
    expect(result.length).toBe(1)
    expect(result[0].id).toBe('b/model')
  })

  test('filters by requiresToolCalls', () => {
    const result = filterModels(testModels, { requiresToolCalls: true })
    expect(result.length).toBe(2)
  })

  test('filters by requiresVision', () => {
    const result = filterModels(testModels, { requiresVision: true })
    expect(result.length).toBe(2)
  })

  test('filters by maxCostInput (free models)', () => {
    const result = filterModels(testModels, { maxCostInput: 0.000005 })
    expect(result.length).toBe(2)
  })
})

describe('getModelStats', () => {
  test('returns correct stats', () => {
    const stats = getModelStats([
      {
        id: 'a/model',
        provider: 'a',
        name: 'model',
        displayName: 'Model A',
        capabilities: {
          text: true,
          thinking: true,
          toolCalls: true,
          structuredOutput: false,
          vision: true,
          pdf: false,
          maxTokens: 4096,
          contextWindow: 128000,
        },
        cost: { inputPerToken: 0, outputPerToken: 0 },
        defaultMaxTokens: 4096,
      },
      {
        id: 'b/model',
        provider: 'b',
        name: 'model',
        displayName: 'Model B',
        capabilities: {
          text: true,
          thinking: false,
          toolCalls: false,
          structuredOutput: false,
          vision: false,
          pdf: false,
          maxTokens: 4096,
          contextWindow: 128000,
        },
        cost: { inputPerToken: 0.000003, outputPerToken: 0.000015 },
        defaultMaxTokens: 4096,
      },
    ])

    expect(stats.totalModels).toBe(2)
    expect(stats.providers).toEqual(['a', 'b'])
    expect(stats.freeModels).toBe(1)
    expect(stats.reasoningModels).toBe(1)
    expect(stats.visionModels).toBe(1)
    expect(stats.toolCallModels).toBe(1)
  })

  test('handles empty array', () => {
    const stats = getModelStats([])

    expect(stats.totalModels).toBe(0)
    expect(stats.providers).toEqual([])
    expect(stats.freeModels).toBe(0)
    expect(stats.reasoningModels).toBe(0)
    expect(stats.visionModels).toBe(0)
    expect(stats.toolCallModels).toBe(0)
  })
})

describe('createCatalogManager', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockProviderResponse),
      }),
    ) as unknown as typeof fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test('creates manager with local models', () => {
    const manager = createCatalogManager(localTestModels)

    expect(manager).toBeDefined()
    expect(manager.getSyncedModels()).toEqual([])
  })

  test('syncAndLoad returns populated catalog', async () => {
    const manager = createCatalogManager(localTestModels)
    const catalog = await manager.syncAndLoad()

    expect(catalog).toBeDefined()
    expect(manager.getSyncedModels().length).toBeGreaterThan(0)
  })

  test('searchModels finds by provider', async () => {
    const manager = createCatalogManager(localTestModels)
    await manager.syncAndLoad()

    const results = manager.searchModels('anthropic')
    expect(results.length).toBeGreaterThan(0)
    expect(results.every((m) => m.provider === 'anthropic')).toBe(true)
  })

  test('searchModels finds by name', async () => {
    const manager = createCatalogManager(localTestModels)
    await manager.syncAndLoad()

    const results = manager.searchModels('claude')
    expect(results.length).toBeGreaterThan(0)
  })

  test('searchModels includes local models', async () => {
    const manager = createCatalogManager(localTestModels)
    await manager.syncAndLoad()

    const results = manager.searchModels('test')
    expect(results.some((m) => m.provider === 'local')).toBe(true)
  })
})
