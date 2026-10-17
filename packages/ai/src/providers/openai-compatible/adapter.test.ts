import { afterEach, describe, expect, it } from 'bun:test'
import type { ModelConfig, ToolDefinition } from '../../model/types'
import {
  type OpenAICompatibleConfig,
  convertMessages,
  convertTools,
  createOpenAICompatibleModel,
  parseSSELine,
} from './adapter'
import { discoverModels } from './discovery'
import {
  DEFAULT_CAPABILITIES,
  PROVIDER_PRESETS,
  createPresetModel,
  forgeFreeBaseUrl,
  listPresetModels,
} from './models'

function makeConfig(overrides: Partial<ModelConfig> = {}): ModelConfig {
  return {
    id: 'test/test-model',
    provider: 'test',
    name: 'test-model',
    displayName: 'Test Model',
    capabilities: { ...DEFAULT_CAPABILITIES },
    cost: { inputPerToken: 0, outputPerToken: 0 },
    ...overrides,
  }
}

function makeOpenAIConfig(overrides: Partial<OpenAICompatibleConfig> = {}): OpenAICompatibleConfig {
  return {
    provider: 'test',
    name: 'test-model',
    baseUrl: 'https://api.test.com/v1',
    apiKey: 'test-key',
    config: makeConfig(),
    ...overrides,
  }
}

function mockFetch(response: unknown, status = 200) {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (() =>
    Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(response),
      text: () => Promise.resolve(JSON.stringify(response)),
      body: undefined,
    })) as typeof fetch
  return () => {
    globalThis.fetch = originalFetch
  }
}

function mockFetchStream(chunks: string[]) {
  const originalFetch = globalThis.fetch
  const encoder = new TextEncoder()
  const streamChunks = chunks.map((c) => encoder.encode(c))
  let idx = 0

  globalThis.fetch = (() =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
      text: () => Promise.resolve(''),
      body: {
        getReader: () => ({
          read: async () => {
            if (idx >= streamChunks.length) return { done: true, value: undefined }
            return { done: false, value: streamChunks[idx++] }
          },
          releaseLock: () => {},
        }),
      },
    })) as typeof fetch
  return () => {
    globalThis.fetch = originalFetch
  }
}

// ─── adapter.ts ────────────────────────────────────────────────

describe('createOpenAICompatibleModel', () => {
  it('creates a valid model with correct properties', () => {
    const model = createOpenAICompatibleModel(makeOpenAIConfig())
    expect(model.id).toBe('test/test-model')
    expect(model.provider).toBe('test')
    expect(model.name).toBe('test-model')
    expect(model.config).toBeDefined()
  })

  it('has correct config values', () => {
    const config = makeConfig({
      displayName: 'My Model',
      cost: { inputPerToken: 0.001, outputPerToken: 0.002 },
    })
    const model = createOpenAICompatibleModel(makeOpenAIConfig({ config }))
    expect(model.config.displayName).toBe('My Model')
    expect(model.config.cost.inputPerToken).toBe(0.001)
    expect(model.config.cost.outputPerToken).toBe(0.002)
  })

  it('supportsFeature returns true for enabled features', () => {
    const config = makeConfig({
      capabilities: {
        ...DEFAULT_CAPABILITIES,
        text: true,
        toolCalls: true,
        vision: false,
      },
    })
    const model = createOpenAICompatibleModel(makeOpenAIConfig({ config }))
    expect(model.supportsFeature('text')).toBe(true)
    expect(model.supportsFeature('toolCalls')).toBe(true)
    expect(model.supportsFeature('vision')).toBe(false)
  })

  it('supportsFeature returns true for numeric capabilities > 0', () => {
    const config = makeConfig({
      capabilities: {
        ...DEFAULT_CAPABILITIES,
        contextWindow: 128000,
        maxTokens: 32768,
      },
    })
    const model = createOpenAICompatibleModel(makeOpenAIConfig({ config }))
    expect(model.supportsFeature('contextWindow')).toBe(true)
    expect(model.supportsFeature('maxTokens')).toBe(true)
  })

  it('getCapabilities returns full capabilities', () => {
    const model = createOpenAICompatibleModel(makeOpenAIConfig())
    const caps = model.getCapabilities()
    expect(caps.text).toBe(true)
    expect(typeof caps.contextWindow).toBe('number')
    expect(typeof caps.maxTokens).toBe('number')
  })
})

describe('generate', () => {
  it('sends correct request and parses response', async () => {
    const restore = mockFetch({
      id: 'resp-1',
      choices: [
        {
          message: { role: 'assistant', content: 'Hello world' },
          finish_reason: 'stop',
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      model: 'test-model',
    })

    const model = createOpenAICompatibleModel(makeOpenAIConfig())
    const result = await model.generate({
      messages: [{ role: 'user', content: 'Hi' }],
    })

    expect(result.content).toBe('Hello world')
    expect(result.finishReason).toBe('stop')
    expect(result.usage.input).toBe(10)
    expect(result.usage.output).toBe(5)
    expect(result.usage.total).toBe(15)
    expect(result.model).toBe('test-model')
    expect(result.provider).toBe('test')
    expect(result.toolCalls).toEqual([])
    restore()
  })

  it('parses tool calls from response', async () => {
    const restore = mockFetch({
      id: 'resp-2',
      choices: [
        {
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                id: 'call-1',
                type: 'function',
                function: { name: 'get_weather', arguments: '{"city":"NYC"}' },
              },
            ],
          },
          finish_reason: 'tool_calls',
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      model: 'test-model',
    })

    const model = createOpenAICompatibleModel(makeOpenAIConfig())
    const result = await model.generate({
      messages: [{ role: 'user', content: 'Weather?' }],
    })

    expect(result.toolCalls).toHaveLength(1)
    expect(result.toolCalls[0].id).toBe('call-1')
    expect(result.toolCalls[0].name).toBe('get_weather')
    expect(result.toolCalls[0].args).toEqual({ city: 'NYC' })
    expect(result.finishReason).toBe('tool-call')
    restore()
  })

  it('handles tool results in messages', async () => {
    let capturedBody: unknown = null
    const originalFetch = globalThis.fetch
    globalThis.fetch = ((_url: string, opts: RequestInit) => {
      capturedBody = JSON.parse(opts.body as string)
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            id: 'r',
            choices: [{ message: { role: 'assistant', content: 'Done' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
            model: 'm',
          }),
        text: () => Promise.resolve(''),
      })
    }) as typeof fetch

    const model = createOpenAICompatibleModel(makeOpenAIConfig())
    await model.generate({
      messages: [
        { role: 'user', content: 'Hi' },
        {
          role: 'assistant',
          content: '',
          toolCalls: [{ id: 'call-1', name: 'get_weather', args: { city: 'NYC' } }],
        },
        {
          role: 'assistant',
          content: '',
          toolResults: [
            {
              toolCallId: 'call-1',
              toolName: 'get_weather',
              result: '{"temp":72}',
              durationMs: 100,
            },
          ],
        },
      ],
    })

    const body = capturedBody as { messages: Array<{ role: string; tool_call_id?: string }> }
    const toolMsg = body.messages.find((m) => m.role === 'tool')
    expect(toolMsg).toBeDefined()
    expect(toolMsg?.tool_call_id).toBe('call-1')
    globalThis.fetch = originalFetch
  })

  it('throws on non-200 response', async () => {
    const restore = mockFetch({ error: 'rate limited' }, 429)
    const model = createOpenAICompatibleModel(makeOpenAIConfig())

    await expect(model.generate({ messages: [{ role: 'user', content: 'Hi' }] })).rejects.toThrow(
      '429',
    )
    restore()
  })

  it('includes system message when provided', async () => {
    let capturedBody: unknown = null
    const originalFetch = globalThis.fetch
    globalThis.fetch = ((_url: string, opts: RequestInit) => {
      capturedBody = JSON.parse(opts.body as string)
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            id: 'r',
            choices: [{ message: { role: 'assistant', content: '' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
            model: 'm',
          }),
        text: () => Promise.resolve(''),
      })
    }) as typeof fetch

    const model = createOpenAICompatibleModel(makeOpenAIConfig())
    await model.generate({
      messages: [{ role: 'user', content: 'Hi' }],
      system: 'You are a helpful assistant.',
    })

    const body = capturedBody as { messages: Array<{ role: string; content: string }> }
    expect(body.messages[0].role).toBe('system')
    expect(body.messages[0].content).toBe('You are a helpful assistant.')
    globalThis.fetch = originalFetch
  })

  it('passes maxTokens and temperature', async () => {
    let capturedBody: unknown = null
    const originalFetch = globalThis.fetch
    globalThis.fetch = ((_url: string, opts: RequestInit) => {
      capturedBody = JSON.parse(opts.body as string)
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            id: 'r',
            choices: [{ message: { role: 'assistant', content: '' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
            model: 'm',
          }),
        text: () => Promise.resolve(''),
      })
    }) as typeof fetch

    const model = createOpenAICompatibleModel(makeOpenAIConfig())
    await model.generate({
      messages: [{ role: 'user', content: 'Hi' }],
      maxTokens: 512,
      temperature: 0.7,
    })

    const body = capturedBody as { max_tokens: number; temperature: number }
    expect(body.max_tokens).toBe(512)
    expect(body.temperature).toBe(0.7)
    globalThis.fetch = originalFetch
  })
})

describe('stream', () => {
  it('yields text deltas from SSE', async () => {
    const sseData = [
      'data: {"id":"s1","choices":[{"delta":{"role":"assistant","content":"Hello"},"finish_reason":null}],"model":"m"}',
      'data: {"id":"s1","choices":[{"delta":{"content":" world"},"finish_reason":null}],"model":"m"}',
      'data: {"id":"s1","choices":[{"delta":{},"finish_reason":"stop"}],"model":"m"}',
      'data: [DONE]',
    ]
    const restore = mockFetchStream(sseData.map((l) => `${l}\n`))

    const model = createOpenAICompatibleModel(makeOpenAIConfig())
    const chunks: string[] = []
    for await (const chunk of model.stream({
      messages: [{ role: 'user', content: 'Hi' }],
    })) {
      if (chunk.type === 'text-delta') chunks.push(chunk.delta)
    }

    expect(chunks).toEqual(['Hello', ' world'])
    restore()
  })

  it('accumulates tool call deltas', async () => {
    const sseData = [
      'data: {"id":"s2","choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-1","type":"function","function":{"name":"get_weather","arguments":""}}]},"finish_reason":null}],"model":"m"}',
      'data: {"id":"s2","choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"ci"}}]},"finish_reason":null}],"model":"m"}',
      'data: {"id":"s2","choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"ty\\":\\"NYC\\"}"}}]},"finish_reason":null}],"model":"m"}',
      'data: {"id":"s2","choices":[{"delta":{},"finish_reason":"tool_calls"}],"model":"m"}',
      'data: [DONE]',
    ]
    const restore = mockFetchStream(sseData.map((l) => `${l}\n`))

    const model = createOpenAICompatibleModel(makeOpenAIConfig())
    const toolCalls: Array<{ id: string; name: string; args: unknown }> = []
    const toolDeltas: string[] = []

    for await (const chunk of model.stream({
      messages: [{ role: 'user', content: 'Weather?' }],
    })) {
      if (chunk.type === 'tool-call-delta') toolDeltas.push(chunk.delta)
      if (chunk.type === 'tool-call') {
        toolCalls.push({
          id: chunk.toolCall.id,
          name: chunk.toolCall.name,
          args: chunk.toolCall.args,
        })
      }
    }

    expect(toolDeltas.length).toBeGreaterThan(0)
    expect(toolCalls).toHaveLength(1)
    expect(toolCalls[0].id).toBe('call-1')
    expect(toolCalls[0].name).toBe('get_weather')
    expect(toolCalls[0].args).toEqual({ city: 'NYC' })
    restore()
  })

  it('emits finish chunk with correct reason', async () => {
    const sseData = [
      'data: {"id":"s3","choices":[{"delta":{"content":"ok"},"finish_reason":"stop"}],"model":"m"}',
      'data: [DONE]',
    ]
    const restore = mockFetchStream(sseData.map((l) => `${l}\n`))

    const model = createOpenAICompatibleModel(makeOpenAIConfig())
    const reasons: string[] = []

    for await (const chunk of model.stream({
      messages: [{ role: 'user', content: 'Hi' }],
    })) {
      if (chunk.type === 'finish') reasons.push(chunk.reason)
    }

    expect(reasons).toEqual(['stop'])
    restore()
  })

  it('throws on non-200 response', async () => {
    const restore = mockFetch({ error: 'forbidden' }, 403)
    const model = createOpenAICompatibleModel(makeOpenAIConfig())

    const gen = model.stream({ messages: [{ role: 'user', content: 'Hi' }] })
    await expect(gen[Symbol.asyncIterator]().next()).rejects.toThrow('403')
    restore()
  })
})

// ─── SSE parser ────────────────────────────────────────────────

describe('parseSSELine', () => {
  it('parses valid SSE data line', () => {
    const line =
      'data: {"id":"1","choices":[{"delta":{"content":"hi"},"finish_reason":null}],"model":"m"}'
    const result = parseSSELine(line)
    expect(result).not.toBeNull()
    expect(result?.choices[0].delta.content).toBe('hi')
  })

  it('returns null for [DONE]', () => {
    expect(parseSSELine('data: [DONE]')).toBeNull()
  })

  it('returns null for non-data lines', () => {
    expect(parseSSELine('event: message')).toBeNull()
    expect(parseSSELine('')).toBeNull()
    expect(parseSSELine('random text')).toBeNull()
  })

  it('returns null for malformed JSON', () => {
    expect(parseSSELine('data: {broken json')).toBeNull()
  })

  it('handles data line with just "data: " prefix', () => {
    expect(parseSSELine('data: ')).toBeNull()
  })
})

// ─── message conversion ───────────────────────────────────────

describe('convertMessages', () => {
  it('converts basic user message', () => {
    const msgs = convertMessages({
      messages: [{ role: 'user', content: 'Hello' }],
    })
    expect(msgs).toEqual([{ role: 'user', content: 'Hello' }])
  })

  it('includes system message from options', () => {
    const msgs = convertMessages({
      messages: [{ role: 'user', content: 'Hi' }],
      system: 'Be helpful',
    })
    expect(msgs[0]).toEqual({ role: 'system', content: 'Be helpful' })
    expect(msgs[1]).toEqual({ role: 'user', content: 'Hi' })
  })

  it('converts assistant message with tool calls', () => {
    const msgs = convertMessages({
      messages: [
        {
          role: 'assistant',
          content: '',
          toolCalls: [{ id: 'c1', name: 'search', args: { q: 'test' } }],
        },
      ],
    })
    expect(msgs[0].role).toBe('assistant')
    expect(msgs[0].tool_calls).toHaveLength(1)
    expect(msgs[0].tool_calls?.[0].function.arguments).toBe('{"q":"test"}')
  })

  it('converts tool results', () => {
    const msgs = convertMessages({
      messages: [
        {
          role: 'assistant',
          content: '',
          toolResults: [
            {
              toolCallId: 'c1',
              toolName: 'search',
              result: 'found it',
              durationMs: 50,
            },
          ],
        },
      ],
    })
    expect(msgs).toHaveLength(1)
    expect(msgs[0].role).toBe('tool')
    expect(msgs[0].content).toBe('found it')
    expect(msgs[0].tool_call_id).toBe('c1')
  })

  it('includes error prefix in tool result when error is set', () => {
    const msgs = convertMessages({
      messages: [
        {
          role: 'assistant',
          content: '',
          toolResults: [
            {
              toolCallId: 'c1',
              toolName: 'search',
              result: 'partial',
              error: 'timeout',
              durationMs: 5000,
            },
          ],
        },
      ],
    })
    expect(msgs[0].content).toContain('Error: timeout')
    expect(msgs[0].content).toContain('partial')
  })
})

// ─── tool conversion ──────────────────────────────────────────

describe('convertTools', () => {
  it('converts tool definitions to OpenAI format', () => {
    const tools: ToolDefinition[] = [
      {
        name: 'get_weather',
        description: 'Get weather info',
        parameters: {
          type: 'object',
          properties: { city: { type: 'string' } },
        },
      },
    ]
    const result = convertTools(tools)
    expect(result).toEqual([
      {
        type: 'function',
        function: {
          name: 'get_weather',
          description: 'Get weather info',
          parameters: {
            type: 'object',
            properties: { city: { type: 'string' } },
          },
        },
      },
    ])
  })

  it('handles empty tools array', () => {
    expect(convertTools([])).toEqual([])
  })
})

// ─── models.ts ────────────────────────────────────────────────

describe('PROVIDER_PRESETS', () => {
  it('has all expected providers', () => {
    expect(PROVIDER_PRESETS.groq).toBeDefined()
    expect(PROVIDER_PRESETS.openrouter).toBeDefined()
    expect(PROVIDER_PRESETS.ollama).toBeDefined()
    expect(PROVIDER_PRESETS.deepseek).toBeDefined()
  })

  it('each provider has correct baseUrl', () => {
    expect(PROVIDER_PRESETS.groq.baseUrl).toBe('https://api.groq.com/openai/v1')
    expect(PROVIDER_PRESETS.openrouter.baseUrl).toBe('https://openrouter.ai/api/v1')
    expect(PROVIDER_PRESETS.ollama.baseUrl).toBe('http://localhost:11434/v1')
    expect(PROVIDER_PRESETS.deepseek.baseUrl).toBe('https://api.deepseek.com/v1')
  })

  it('each provider has models array with entries', () => {
    for (const preset of Object.values(PROVIDER_PRESETS)) {
      expect(preset.models.length).toBeGreaterThan(0)
      for (const model of preset.models) {
        expect(model.name).toBeTruthy()
        expect(model.displayName).toBeTruthy()
        expect(model.contextWindow).toBeGreaterThan(0)
        expect(model.maxTokens).toBeGreaterThan(0)
        expect(typeof model.cost.inputPerToken).toBe('number')
        expect(typeof model.cost.outputPerToken).toBe('number')
      }
    }
  })
})

describe('createPresetModel', () => {
  it('creates model from valid preset', () => {
    const model = createPresetModel('groq', 'llama-3.3-70b-versatile', 'test-key')
    expect(model).toBeDefined()
    expect(model?.provider).toBe('groq')
    expect(model?.name).toBe('llama-3.3-70b-versatile')
    expect(model?.config.displayName).toBe('Llama 3.3 70B')
  })

  it('returns undefined for unknown provider', () => {
    expect(createPresetModel('nonexistent', 'model')).toBeUndefined()
  })

  it('returns undefined for unknown model', () => {
    expect(createPresetModel('groq', 'nonexistent-model')).toBeUndefined()
  })

  it('uses empty apiKey by default', () => {
    const model = createPresetModel('ollama', 'llama3.3')
    expect(model).toBeDefined()
    expect(model?.config.cost.inputPerToken).toBe(0)
  })

  it('sets correct capabilities from preset', () => {
    const model = createPresetModel('deepseek', 'deepseek-reasoner', 'key')
    expect(model).toBeDefined()
    expect(model?.config.capabilities.thinking).toBe(true)
  })

  it('uses default capabilities when none specified', () => {
    const model = createPresetModel('groq', 'gemma2-9b-it')
    expect(model).toBeDefined()
    expect(model?.config.capabilities.text).toBe(true)
    expect(model?.config.capabilities.thinking).toBe(false)
    expect(model?.config.capabilities.vision).toBe(false)
  })
})

describe('forge-free preset', () => {
  const GATEWAY = process.env.FORGE_GATEWAY_URL
  const TOKEN = process.env.FORGE_GATEWAY_TOKEN

  afterEach(() => {
    if (GATEWAY === undefined) Reflect.deleteProperty(process.env, 'FORGE_GATEWAY_URL')
    else process.env.FORGE_GATEWAY_URL = GATEWAY
    if (TOKEN === undefined) Reflect.deleteProperty(process.env, 'FORGE_GATEWAY_TOKEN')
    else process.env.FORGE_GATEWAY_TOKEN = TOKEN
  })

  it('creates a gateway-routed free model with zero cost', () => {
    process.env.FORGE_GATEWAY_URL = 'https://free.forge.dev'
    const model = createPresetModel(
      'forge-free',
      'openrouter/meta-llama/llama-3.3-70b-instruct:free',
    )
    expect(model).toBeDefined()
    expect(model?.provider).toBe('forge-free')
    expect(model?.config.cost.inputPerToken).toBe(0)
    expect(model?.config.cost.outputPerToken).toBe(0)
  })

  it('resolves base URL and token from environment', async () => {
    process.env.FORGE_GATEWAY_URL = 'https://free.forge.dev'
    process.env.FORGE_GATEWAY_TOKEN = 'getaway-secret'
    let requested: { url: string; authorization: string } | null = null
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const headers = init?.headers instanceof Headers ? init.headers : new Headers(init?.headers)
      requested = { url: String(input), authorization: headers.get('authorization') ?? '' }
      return new Response(
        JSON.stringify({
          id: 'x',
          choices: [
            { index: 0, message: { role: 'assistant', content: '' }, finish_reason: 'stop' },
          ],
          usage: {},
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }) as typeof fetch

    const model = createPresetModel('forge-free', 'groq/llama-3.3-70b-versatile')
    expect(model).toBeDefined()
    await model?.generate({ messages: [{ role: 'user', content: 'hi' }] })
    expect(requested?.url).toBe('https://free.forge.dev/chat/completions')
    expect(requested?.authorization).toBe('Bearer getaway-secret')
    globalThis.fetch = originalFetch
  })

  it('targets the default gateway URL when env is unset', async () => {
    Reflect.deleteProperty(process.env, 'FORGE_GATEWAY_URL')
    Reflect.deleteProperty(process.env, 'FORGE_GATEWAY_TOKEN')
    const model = createPresetModel('forge-free', 'nvidia/llama-3.1-nemotron-70b-instruct')
    expect(model).toBeDefined()
    expect(forgeFreeBaseUrl()).toBe('http://localhost:8787')
  })
})

describe('listPresetModels', () => {
  it('returns models for valid provider', () => {
    const models = listPresetModels('groq')
    expect(models.length).toBeGreaterThan(0)
  })

  it('returns empty array for unknown provider', () => {
    expect(listPresetModels('nonexistent')).toEqual([])
  })
})

// ─── discovery.ts ─────────────────────────────────────────────

describe('discoverModels', () => {
  it('returns discovered models on success', async () => {
    const restore = mockFetch({
      data: [
        { id: 'gpt-4', object: 'model', owned_by: 'openai' },
        { id: 'gpt-3.5-turbo', object: 'model', owned_by: 'openai' },
      ],
    })

    const models = await discoverModels('https://api.test.com/v1', 'key')
    expect(models).toHaveLength(2)
    expect(models[0].id).toBe('gpt-4')
    expect(models[0].ownedBy).toBe('openai')
    expect(models[1].id).toBe('gpt-3.5-turbo')
    restore()
  })

  it('returns empty array on fetch error', async () => {
    const restore = mockFetch({ error: 'fail' }, 500)
    const models = await discoverModels('https://api.test.com/v1', 'key')
    expect(models).toEqual([])
    restore()
  })

  it('returns empty array on network error', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = (() => Promise.reject(new Error('network'))) as typeof fetch
    const models = await discoverModels('https://api.test.com/v1', 'key')
    expect(models).toEqual([])
    globalThis.fetch = originalFetch
  })

  it('returns empty array when data is not an array', async () => {
    const restore = mockFetch({ data: 'not-an-array' })
    const models = await discoverModels('https://api.test.com/v1', 'key')
    expect(models).toEqual([])
    restore()
  })

  it('defaults ownedBy to unknown when missing', async () => {
    const restore = mockFetch({
      data: [{ id: 'model-1', object: 'model' }],
    })
    const models = await discoverModels('https://api.test.com/v1')
    expect(models[0].ownedBy).toBe('unknown')
    restore()
  })
})
