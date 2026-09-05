import { describe, expect, it } from 'bun:test'
import type { ModelCapabilities, ToolDefinition } from '../../model/types'
import {
  type GoogleConfig,
  convertContents,
  convertTools,
  createGoogleModel,
  parseSSELine,
} from './adapter'
import { GOOGLE_MODELS, createGooglePresetModel } from './models'

function makeConfig(overrides: Partial<ModelCapabilities> = {}) {
  return {
    id: 'google/gemini-2.5-pro',
    provider: 'google',
    name: 'gemini-2.5-pro',
    displayName: 'Gemini 2.5 Pro',
    capabilities: {
      text: true,
      thinking: true,
      toolCalls: true,
      structuredOutput: true,
      vision: true,
      pdf: false,
      maxTokens: 65536,
      contextWindow: 1000000,
      ...overrides,
    },
    cost: { inputPerToken: 0.00000125, outputPerToken: 0.00001 },
  }
}

function makeGoogleConfig(overrides: Partial<GoogleConfig> = {}): GoogleConfig {
  return {
    provider: 'google',
    name: 'gemini-2.5-pro',
    apiKey: 'test-api-key',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
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
    })) as unknown as typeof fetch
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
    })) as unknown as typeof fetch
  return () => {
    globalThis.fetch = originalFetch
  }
}

function mockFetchCaptureWith(response: unknown) {
  const originalFetch = globalThis.fetch
  const state = { url: '', body: null as unknown }

  globalThis.fetch = ((...args: unknown[]) => {
    const [url, opts] = args as [string, RequestInit]
    state.url = url
    state.body = JSON.parse(opts.body as string)
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(response),
      text: () => Promise.resolve(''),
      body: undefined,
    })
  }) as unknown as typeof fetch

  return {
    get url() {
      return state.url
    },
    get body() {
      return state.body
    },
    restore: () => {
      globalThis.fetch = originalFetch
    },
  }
}

// ─── adapter.ts ────────────────────────────────────────────────

describe('createGoogleModel', () => {
  it('creates a valid model with correct properties', () => {
    const model = createGoogleModel(makeGoogleConfig())
    expect(model.id).toBe('google/gemini-2.5-pro')
    expect(model.provider).toBe('google')
    expect(model.name).toBe('gemini-2.5-pro')
    expect(model.config).toBeDefined()
  })

  it('has correct config values', () => {
    const config = makeConfig({
      contextWindow: 2000000,
    })
    const model = createGoogleModel(makeGoogleConfig({ config }))
    expect(model.config.capabilities.contextWindow).toBe(2000000)
    expect(model.config.cost.inputPerToken).toBe(0.00000125)
  })

  it('supportsFeature returns true for enabled features', () => {
    const model = createGoogleModel(makeGoogleConfig())
    expect(model.supportsFeature('text')).toBe(true)
    expect(model.supportsFeature('toolCalls')).toBe(true)
    expect(model.supportsFeature('thinking')).toBe(true)
    expect(model.supportsFeature('vision')).toBe(true)
    expect(model.supportsFeature('pdf')).toBe(false)
  })

  it('supportsFeature returns true for numeric capabilities > 0', () => {
    const model = createGoogleModel(makeGoogleConfig())
    expect(model.supportsFeature('contextWindow')).toBe(true)
    expect(model.supportsFeature('maxTokens')).toBe(true)
  })

  it('getCapabilities returns full capabilities', () => {
    const model = createGoogleModel(makeGoogleConfig())
    const caps = model.getCapabilities()
    expect(caps.text).toBe(true)
    expect(caps.thinking).toBe(true)
    expect(caps.vision).toBe(true)
    expect(typeof caps.contextWindow).toBe('number')
    expect(typeof caps.maxTokens).toBe('number')
  })
})

// ─── generate ──────────────────────────────────────────────────

describe('generate', () => {
  it('sends correct request format and parses response', async () => {
    const response = {
      candidates: [{ content: { parts: [{ text: 'Hello world' }] }, finishReason: 'STOP' }],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
    }
    const cap = mockFetchCaptureWith(response)

    const model = createGoogleModel(makeGoogleConfig())
    const result = await model.generate({
      messages: [{ role: 'user', content: 'Hi' }],
    })

    expect(cap.url).toContain(
      'generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=test-api-key',
    )
    expect(result.content).toBe('Hello world')
    expect(result.finishReason).toBe('stop')
    expect(result.usage.input).toBe(10)
    expect(result.usage.output).toBe(5)
    expect(result.usage.total).toBe(15)
    expect(result.model).toBe('gemini-2.5-pro')
    expect(result.provider).toBe('google')
    expect(result.toolCalls).toEqual([])

    cap.restore()
  })

  it('parses tool calls from response', async () => {
    const restore = mockFetch({
      candidates: [
        {
          content: {
            parts: [{ functionCall: { name: 'get_weather', args: { city: 'NYC' } } }],
          },
          finishReason: 'STOP',
        },
      ],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20, totalTokenCount: 30 },
    })

    const model = createGoogleModel(makeGoogleConfig())
    const result = await model.generate({
      messages: [{ role: 'user', content: 'Weather?' }],
    })

    expect(result.toolCalls).toHaveLength(1)
    expect(result.toolCalls[0].name).toBe('get_weather')
    expect(result.toolCalls[0].args).toEqual({ city: 'NYC' })
    expect(result.toolCalls[0].id).toBeTruthy()
    restore()
  })

  it('parses thinking parts', async () => {
    const restore = mockFetch({
      candidates: [
        {
          content: {
            parts: [
              { thought: true, text: 'Let me think about this...' },
              { text: 'The answer is 42.' },
            ],
          },
          finishReason: 'STOP',
        },
      ],
      usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 10, totalTokenCount: 15 },
    })

    const model = createGoogleModel(makeGoogleConfig())
    const result = await model.generate({
      messages: [{ role: 'user', content: 'What is the meaning of life?' }],
    })

    expect(result.thinking).toBe('Let me think about this...')
    expect(result.content).toBe('The answer is 42.')
    restore()
  })

  it('puts system prompt in systemInstruction', async () => {
    const cap = mockFetchCaptureWith({
      candidates: [{ content: { parts: [{ text: '' }] }, finishReason: 'STOP' }],
      usageMetadata: { promptTokenCount: 0, candidatesTokenCount: 0, totalTokenCount: 0 },
    })

    const model = createGoogleModel(makeGoogleConfig())
    await model.generate({
      messages: [{ role: 'user', content: 'Hi' }],
      system: 'You are a helpful assistant.',
    })

    const body = cap.body as {
      systemInstruction?: { parts: Array<{ text: string }> }
      contents?: Array<{ role: string }>
    }
    expect(body.systemInstruction).toBeDefined()
    expect(body.systemInstruction?.parts[0].text).toBe('You are a helpful assistant.')
    expect(body.contents?.[0].role).toBe('user')

    cap.restore()
  })

  it('passes maxTokens and temperature in generationConfig', async () => {
    const cap = mockFetchCaptureWith({
      candidates: [{ content: { parts: [{ text: '' }] }, finishReason: 'STOP' }],
      usageMetadata: { promptTokenCount: 0, candidatesTokenCount: 0, totalTokenCount: 0 },
    })

    const model = createGoogleModel(makeGoogleConfig())
    await model.generate({
      messages: [{ role: 'user', content: 'Hi' }],
      maxTokens: 512,
      temperature: 0.7,
    })

    const body = cap.body as { generationConfig: { maxOutputTokens: number; temperature: number } }
    expect(body.generationConfig.maxOutputTokens).toBe(512)
    expect(body.generationConfig.temperature).toBe(0.7)

    cap.restore()
  })

  it('throws on non-200 response', async () => {
    const restore = mockFetch({ error: { message: 'rate limited', code: 429 } }, 429)
    const model = createGoogleModel(makeGoogleConfig())

    await expect(model.generate({ messages: [{ role: 'user', content: 'Hi' }] })).rejects.toThrow(
      '429',
    )
    restore()
  })
})

// ─── stream ────────────────────────────────────────────────────

describe('stream', () => {
  it('yields text deltas from SSE', async () => {
    const sseData = [
      'data: {"candidates":[{"content":{"parts":[{"text":"Hello"}]},"finishReason":null}]}',
      'data: {"candidates":[{"content":{"parts":[{"text":" world"}]},"finishReason":null}]}',
      'data: {"candidates":[{"content":{"parts":[]},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":10,"candidatesTokenCount":5,"totalTokenCount":15}}',
    ]
    const restore = mockFetchStream(sseData.map((l) => `${l}\n`))

    const model = createGoogleModel(makeGoogleConfig())
    const chunks: string[] = []
    const reasons: string[] = []

    for await (const chunk of model.stream({
      messages: [{ role: 'user', content: 'Hi' }],
    })) {
      if (chunk.type === 'text-delta') chunks.push(chunk.delta)
      if (chunk.type === 'finish') reasons.push(chunk.reason)
    }

    expect(chunks).toEqual(['Hello', ' world'])
    expect(reasons).toEqual(['stop'])
    restore()
  })

  it('yields thinking deltas', async () => {
    const sseData = [
      'data: {"candidates":[{"content":{"parts":[{"thought":true,"text":"Reasoning..."}]},"finishReason":null}]}',
      'data: {"candidates":[{"content":{"parts":[{"text":"The answer."}]},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":5,"candidatesTokenCount":10,"totalTokenCount":15}}',
    ]
    const restore = mockFetchStream(sseData.map((l) => `${l}\n`))

    const model = createGoogleModel(makeGoogleConfig())
    const thinkingDeltas: string[] = []
    const textDeltas: string[] = []

    for await (const chunk of model.stream({
      messages: [{ role: 'user', content: 'Think' }],
    })) {
      if (chunk.type === 'thinking-delta') thinkingDeltas.push(chunk.delta)
      if (chunk.type === 'text-delta') textDeltas.push(chunk.delta)
    }

    expect(thinkingDeltas).toEqual(['Reasoning...'])
    expect(textDeltas).toEqual(['The answer.'])
    restore()
  })

  it('yields tool calls from streaming', async () => {
    const sseData = [
      'data: {"candidates":[{"content":{"parts":[{"functionCall":{"name":"get_weather","args":{"city":"NYC"}}}]},"finishReason":null}]}',
      'data: {"candidates":[{"content":{"parts":[]},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":5,"candidatesTokenCount":10,"totalTokenCount":15}}',
    ]
    const restore = mockFetchStream(sseData.map((l) => `${l}\n`))

    const model = createGoogleModel(makeGoogleConfig())
    const toolCalls: Array<{ name: string; args: unknown }> = []

    for await (const chunk of model.stream({
      messages: [{ role: 'user', content: 'Weather?' }],
    })) {
      if (chunk.type === 'tool-call') {
        toolCalls.push({ name: chunk.toolCall.name, args: chunk.toolCall.args })
      }
    }

    expect(toolCalls).toHaveLength(1)
    expect(toolCalls[0].name).toBe('get_weather')
    expect(toolCalls[0].args).toEqual({ city: 'NYC' })
    restore()
  })

  it('emits usage from final chunk', async () => {
    const sseData = [
      'data: {"candidates":[{"content":{"parts":[{"text":"ok"}]},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":10,"candidatesTokenCount":5,"totalTokenCount":15}}',
    ]
    const restore = mockFetchStream(sseData.map((l) => `${l}\n`))

    const model = createGoogleModel(makeGoogleConfig())
    let usage: { input: number; output: number; total: number } | null = null

    for await (const chunk of model.stream({
      messages: [{ role: 'user', content: 'Hi' }],
    })) {
      if (chunk.type === 'usage') usage = chunk.usage
    }

    expect(usage).toEqual({ input: 10, output: 5, total: 15 })
    restore()
  })

  it('throws on non-200 response', async () => {
    const restore = mockFetch({ error: { message: 'forbidden' } }, 403)
    const model = createGoogleModel(makeGoogleConfig())

    const gen = model.stream({ messages: [{ role: 'user', content: 'Hi' }] })
    await expect(gen[Symbol.asyncIterator]().next()).rejects.toThrow('403')
    restore()
  })
})

// ─── SSE parser ────────────────────────────────────────────────

describe('parseSSELine', () => {
  it('parses valid SSE data line', () => {
    const line =
      'data: {"candidates":[{"content":{"parts":[{"text":"hi"}]},"finishReason":"STOP"}]}'
    const result = parseSSELine(line)
    expect(result).not.toBeNull()
    expect(result?.candidates?.[0].content.parts[0].text).toBe('hi')
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

describe('convertContents', () => {
  it('converts basic user message', () => {
    const { contents } = convertContents([{ role: 'user', content: 'Hello' }])
    expect(contents).toEqual([{ role: 'user', parts: [{ text: 'Hello' }] }])
  })

  it('maps assistant to model role', () => {
    const { contents } = convertContents([
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: 'Hello!' },
    ])
    expect(contents[0].role).toBe('user')
    expect(contents[1].role).toBe('model')
    expect(contents[1].parts[0].text).toBe('Hello!')
  })

  it('extracts system messages to systemInstruction', () => {
    const { contents, systemInstruction } = convertContents(
      [
        { role: 'system', content: 'Be helpful' },
        { role: 'user', content: 'Hi' },
      ],
      'You are a system',
    )
    expect(contents).toHaveLength(1)
    expect(contents[0].role).toBe('user')
    expect(systemInstruction).toEqual({ parts: [{ text: 'You are a system' }] })
  })

  it('puts system option into systemInstruction', () => {
    const { systemInstruction } = convertContents([{ role: 'user', content: 'Hi' }], 'Be concise')
    expect(systemInstruction).toEqual({ parts: [{ text: 'Be concise' }] })
  })

  it('converts assistant with tool calls', () => {
    const { contents } = convertContents([
      {
        role: 'assistant',
        content: '',
        toolCalls: [{ id: 'c1', name: 'search', args: { q: 'test' } }],
      },
    ])
    expect(contents[0].role).toBe('model')
    expect(contents[0].parts[0]).toEqual({
      functionCall: { name: 'search', args: { q: 'test' } },
    })
  })

  it('converts tool results into functionResponse parts', () => {
    const { contents } = convertContents([
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
    ])
    expect(contents).toHaveLength(1)
    expect(contents[0].role).toBe('user')
    expect(contents[0].parts[0]).toEqual({
      functionResponse: { name: 'search', response: { result: 'found it' } },
    })
  })

  it('includes error in functionResponse when toolResult has error', () => {
    const { contents } = convertContents([
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
    ])
    expect(contents[0].parts[0]).toEqual({
      functionResponse: { name: 'search', response: { error: 'timeout', result: 'partial' } },
    })
  })
})

// ─── tool conversion ──────────────────────────────────────────

describe('convertTools', () => {
  it('converts tool definitions to Gemini format', () => {
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
        functionDeclarations: [
          {
            name: 'get_weather',
            description: 'Get weather info',
            parameters: {
              type: 'object',
              properties: { city: { type: 'string' } },
            },
          },
        ],
      },
    ])
  })

  it('returns undefined for empty tools array', () => {
    expect(convertTools([])).toBeUndefined()
  })
})

// ─── models.ts ────────────────────────────────────────────────

describe('GOOGLE_MODELS', () => {
  it('has three models', () => {
    expect(GOOGLE_MODELS).toHaveLength(3)
  })

  it('each model has correct properties', () => {
    for (const model of GOOGLE_MODELS) {
      expect(model.name).toBeTruthy()
      expect(model.displayName).toBeTruthy()
      expect(model.contextWindow).toBeGreaterThan(0)
      expect(model.maxTokens).toBeGreaterThan(0)
      expect(typeof model.cost.inputPerToken).toBe('number')
      expect(typeof model.cost.outputPerToken).toBe('number')
    }
  })

  it('has gemini-2.5-pro with thinking', () => {
    const pro = GOOGLE_MODELS.find((m) => m.name === 'gemini-2.5-pro')
    expect(pro).toBeDefined()
    expect(pro?.thinking).toBe(true)
    expect(pro?.contextWindow).toBe(1000000)
    expect(pro?.maxTokens).toBe(65536)
  })

  it('has gemini-2.5-flash with thinking', () => {
    const flash = GOOGLE_MODELS.find((m) => m.name === 'gemini-2.5-flash')
    expect(flash).toBeDefined()
    expect(flash?.thinking).toBe(true)
  })

  it('has gemini-2.0-flash without thinking', () => {
    const flash = GOOGLE_MODELS.find((m) => m.name === 'gemini-2.0-flash')
    expect(flash).toBeDefined()
    expect(flash?.thinking).toBeUndefined()
  })
})

describe('createGooglePresetModel', () => {
  it('creates model from valid preset', () => {
    const model = createGooglePresetModel('gemini-2.5-pro', 'test-key')
    expect(model).toBeDefined()
    expect(model?.provider).toBe('google')
    expect(model?.name).toBe('gemini-2.5-pro')
    expect(model?.config.displayName).toBe('Gemini 2.5 Pro')
  })

  it('returns undefined for unknown model', () => {
    expect(createGooglePresetModel('nonexistent-model', 'key')).toBeUndefined()
  })

  it('sets thinking capability from preset', () => {
    const model = createGooglePresetModel('gemini-2.5-pro', 'key')
    expect(model?.config.capabilities.thinking).toBe(true)
  })

  it('sets vision and toolCalls capabilities', () => {
    const model = createGooglePresetModel('gemini-2.5-flash', 'key')
    expect(model?.config.capabilities.vision).toBe(true)
    expect(model?.config.capabilities.toolCalls).toBe(true)
  })

  it('sets correct defaultMaxTokens', () => {
    const model = createGooglePresetModel('gemini-2.0-flash', 'key')
    expect(model?.config.defaultMaxTokens).toBe(8192)
  })
})
