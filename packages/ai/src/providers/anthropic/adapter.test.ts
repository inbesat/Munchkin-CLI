import { describe, expect, it } from 'bun:test'
import type { ModelCapabilities, ToolDefinition } from '../../model/types'
import {
  type AnthropicConfig,
  convertMessages,
  convertTools,
  createAnthropicModel,
  parseSSEEvent,
} from './adapter'
import { ANTHROPIC_MODELS, createAnthropicPresetModel } from './models'

function makeConfig(overrides: Partial<ModelCapabilities> = {}) {
  return {
    id: 'anthropic/claude-sonnet-4-20250514',
    provider: 'anthropic',
    name: 'claude-sonnet-4-20250514',
    displayName: 'Claude Sonnet',
    capabilities: {
      text: true,
      thinking: true,
      toolCalls: true,
      structuredOutput: false,
      vision: true,
      pdf: false,
      maxTokens: 64000,
      contextWindow: 200000,
      ...overrides,
    },
    cost: {
      inputPerToken: 0.000003,
      outputPerToken: 0.000015,
      cacheReadPerToken: 0.0000003,
      cacheWritePerToken: 0.00000375,
    },
  }
}

function makeAnthropicConfig(overrides: Partial<AnthropicConfig> = {}): AnthropicConfig {
  return {
    provider: 'anthropic',
    name: 'claude-sonnet-4-20250514',
    apiKey: 'test-api-key',
    baseUrl: 'https://api.anthropic.com',
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

function mockFetchCaptureWith(response: unknown) {
  const originalFetch = globalThis.fetch
  const state = { url: '', body: null as unknown, headers: null as Record<string, string> | null }

  globalThis.fetch = ((...args: unknown[]) => {
    const [url, opts] = args as [string, RequestInit]
    state.url = url
    state.body = JSON.parse(opts.body as string)
    state.headers = Object.fromEntries(Object.entries(opts.headers as Record<string, string>))
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
    get headers() {
      return state.headers
    },
    restore: () => {
      globalThis.fetch = originalFetch
    },
  }
}

function mockFetchStream(events: Array<{ event: string; data: unknown }>) {
  const originalFetch = globalThis.fetch
  const encoder = new TextEncoder()
  const lines: string[] = []

  for (const { event, data } of events) {
    lines.push(`event: ${event}`)
    lines.push(`data: ${JSON.stringify(data)}`)
    lines.push('')
    lines.push('')
  }
  // Ensure trailing \n\n so the last event is fully terminated
  lines.push('')
  lines.push('')

  const encoded = encoder.encode(lines.join('\n'))
  let offset = 0

  globalThis.fetch = (() =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
      text: () => Promise.resolve(''),
      body: {
        getReader: () => ({
          read: async () => {
            if (offset >= encoded.length) return { done: true, value: undefined }
            // Return in chunks
            const chunkSize = Math.min(256, encoded.length - offset)
            const chunk = encoded.slice(offset, offset + chunkSize)
            offset += chunkSize
            return { done: false, value: chunk }
          },
          releaseLock: () => {},
        }),
      },
    })) as unknown as typeof fetch

  return () => {
    globalThis.fetch = originalFetch
  }
}

// ─── createAnthropicModel ───────────────────────────────────

describe('createAnthropicModel', () => {
  it('creates a valid model with correct properties', () => {
    const model = createAnthropicModel(makeAnthropicConfig())
    expect(model.id).toBe('anthropic/claude-sonnet-4-20250514')
    expect(model.provider).toBe('anthropic')
    expect(model.name).toBe('claude-sonnet-4-20250514')
    expect(model.config).toBeDefined()
  })

  it('has correct config values', () => {
    const config = makeConfig({ contextWindow: 100000 })
    const model = createAnthropicModel(makeAnthropicConfig({ config }))
    expect(model.config.capabilities.contextWindow).toBe(100000)
    expect(model.config.cost.inputPerToken).toBe(0.000003)
  })

  it('supportsFeature returns true for enabled features', () => {
    const model = createAnthropicModel(makeAnthropicConfig())
    expect(model.supportsFeature('text')).toBe(true)
    expect(model.supportsFeature('toolCalls')).toBe(true)
    expect(model.supportsFeature('thinking')).toBe(true)
    expect(model.supportsFeature('vision')).toBe(true)
    expect(model.supportsFeature('pdf')).toBe(false)
    expect(model.supportsFeature('structuredOutput')).toBe(false)
  })

  it('supportsFeature returns true for numeric capabilities > 0', () => {
    const model = createAnthropicModel(makeAnthropicConfig())
    expect(model.supportsFeature('contextWindow')).toBe(true)
    expect(model.supportsFeature('maxTokens')).toBe(true)
  })

  it('getCapabilities returns full capabilities', () => {
    const model = createAnthropicModel(makeAnthropicConfig())
    const caps = model.getCapabilities()
    expect(caps.text).toBe(true)
    expect(caps.thinking).toBe(true)
    expect(caps.vision).toBe(true)
    expect(typeof caps.contextWindow).toBe('number')
    expect(typeof caps.maxTokens).toBe('number')
  })

  it('uses default baseUrl when not specified', async () => {
    const cap = mockFetchCaptureWith({
      id: 'msg-1',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: 'hi' }],
      model: 'claude-sonnet-4-20250514',
      stop_reason: 'end_turn',
      usage: { input_tokens: 5, output_tokens: 2 },
    })

    const model = createAnthropicModel(makeAnthropicConfig({ baseUrl: undefined }))
    await model.generate({ messages: [{ role: 'user', content: 'Hi' }] })

    expect(cap.url).toBe('https://api.anthropic.com/v1/messages')
    cap.restore()
  })
})

// ─── generate ───────────────────────────────────────────────

describe('generate', () => {
  it('sends correct request format and parses response', async () => {
    const response = {
      id: 'msg-1',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: 'Hello world' }],
      model: 'claude-sonnet-4-20250514',
      stop_reason: 'end_turn',
      usage: { input_tokens: 10, output_tokens: 5 },
    }
    const cap = mockFetchCaptureWith(response)

    const model = createAnthropicModel(makeAnthropicConfig())
    const result = await model.generate({
      messages: [{ role: 'user', content: 'Hi' }],
    })

    expect(cap.url).toBe('https://api.anthropic.com/v1/messages')
    expect(result.content).toBe('Hello world')
    expect(result.finishReason).toBe('stop')
    expect(result.usage.input).toBe(10)
    expect(result.usage.output).toBe(5)
    expect(result.usage.total).toBe(15)
    expect(result.model).toBe('claude-sonnet-4-20250514')
    expect(result.provider).toBe('anthropic')
    expect(result.toolCalls).toEqual([])

    cap.restore()
  })

  it('sends x-api-key and anthropic-version headers', async () => {
    const cap = mockFetchCaptureWith({
      id: 'msg-1',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: '' }],
      model: 'claude-sonnet-4-20250514',
      stop_reason: 'end_turn',
      usage: { input_tokens: 0, output_tokens: 0 },
    })

    const model = createAnthropicModel(makeAnthropicConfig())
    await model.generate({
      messages: [{ role: 'user', content: 'Hi' }],
    })

    expect(cap.headers?.['x-api-key']).toBe('test-api-key')
    expect(cap.headers?.['anthropic-version']).toBe('2023-06-01')
    expect(cap.headers?.['Content-Type']).toBe('application/json')

    cap.restore()
  })

  it('puts system prompt in top-level system field', async () => {
    const cap = mockFetchCaptureWith({
      id: 'msg-1',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: '' }],
      model: 'claude-sonnet-4-20250514',
      stop_reason: 'end_turn',
      usage: { input_tokens: 0, output_tokens: 0 },
    })

    const model = createAnthropicModel(makeAnthropicConfig())
    await model.generate({
      messages: [{ role: 'user', content: 'Hi' }],
      system: 'You are a helpful assistant.',
    })

    const body = cap.body as { system?: string; messages?: unknown[] }
    expect(body.system).toBe('You are a helpful assistant.')
    expect(body.messages).toBeDefined()

    cap.restore()
  })

  it('parses tool calls from response', async () => {
    const restore = mockFetch({
      id: 'msg-1',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'tool_use', id: 'tc-1', name: 'get_weather', input: { city: 'NYC' } }],
      model: 'claude-sonnet-4-20250514',
      stop_reason: 'tool_use',
      usage: { input_tokens: 10, output_tokens: 20 },
    })

    const model = createAnthropicModel(makeAnthropicConfig())
    const result = await model.generate({
      messages: [{ role: 'user', content: 'Weather?' }],
    })

    expect(result.toolCalls).toHaveLength(1)
    expect(result.toolCalls[0].name).toBe('get_weather')
    expect(result.toolCalls[0].args).toEqual({ city: 'NYC' })
    expect(result.toolCalls[0].id).toBe('tc-1')
    expect(result.finishReason).toBe('tool-call')
    restore()
  })

  it('parses thinking blocks from response', async () => {
    const restore = mockFetch({
      id: 'msg-1',
      type: 'message',
      role: 'assistant',
      content: [
        { type: 'thinking', thinking: 'Let me think about this...' },
        { type: 'text', text: 'The answer is 42.' },
      ],
      model: 'claude-sonnet-4-20250514',
      stop_reason: 'end_turn',
      usage: { input_tokens: 5, output_tokens: 10 },
    })

    const model = createAnthropicModel(makeAnthropicConfig())
    const result = await model.generate({
      messages: [{ role: 'user', content: 'What is the meaning of life?' }],
    })

    expect(result.thinking).toBe('Let me think about this...')
    expect(result.content).toBe('The answer is 42.')
    restore()
  })

  it('sends thinking field when thinking is enabled', async () => {
    const cap = mockFetchCaptureWith({
      id: 'msg-1',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: '' }],
      model: 'claude-sonnet-4-20250514',
      stop_reason: 'end_turn',
      usage: { input_tokens: 0, output_tokens: 0 },
    })

    const model = createAnthropicModel(makeAnthropicConfig())
    await model.generate({
      messages: [{ role: 'user', content: 'Think' }],
      thinking: true,
    })

    const body = cap.body as { thinking?: { type: string; budget_tokens: number } }
    expect(body.thinking).toEqual({ type: 'enabled', budget_tokens: 10000 })

    cap.restore()
  })

  it('sends custom budget_tokens for thinking', async () => {
    const cap = mockFetchCaptureWith({
      id: 'msg-1',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: '' }],
      model: 'claude-sonnet-4-20250514',
      stop_reason: 'end_turn',
      usage: { input_tokens: 0, output_tokens: 0 },
    })

    const model = createAnthropicModel(makeAnthropicConfig())
    await model.generate({
      messages: [{ role: 'user', content: 'Think' }],
      thinking: { budgetTokens: 5000 },
    })

    const body = cap.body as { thinking?: { type: string; budget_tokens: number } }
    expect(body.thinking?.budget_tokens).toBe(5000)

    cap.restore()
  })

  it('passes max_tokens and temperature', async () => {
    const cap = mockFetchCaptureWith({
      id: 'msg-1',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: '' }],
      model: 'claude-sonnet-4-20250514',
      stop_reason: 'end_turn',
      usage: { input_tokens: 0, output_tokens: 0 },
    })

    const model = createAnthropicModel(makeAnthropicConfig())
    await model.generate({
      messages: [{ role: 'user', content: 'Hi' }],
      maxTokens: 512,
      temperature: 0.7,
    })

    const body = cap.body as { max_tokens: number; temperature: number }
    expect(body.max_tokens).toBe(512)
    expect(body.temperature).toBe(0.7)

    cap.restore()
  })

  it('includes tools in request body', async () => {
    const cap = mockFetchCaptureWith({
      id: 'msg-1',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: '' }],
      model: 'claude-sonnet-4-20250514',
      stop_reason: 'end_turn',
      usage: { input_tokens: 0, output_tokens: 0 },
    })

    const model = createAnthropicModel(makeAnthropicConfig())
    await model.generate({
      messages: [{ role: 'user', content: 'Hi' }],
      tools: [
        {
          name: 'bash',
          description: 'Run command',
          parameters: { type: 'object', properties: { command: { type: 'string' } } },
        },
      ],
    })

    const body = cap.body as { tools?: Array<{ name: string; input_schema: unknown }> }
    expect(body.tools).toHaveLength(1)
    expect(body.tools?.[0].name).toBe('bash')
    expect(body.tools?.[0].input_schema).toEqual({
      type: 'object',
      properties: { command: { type: 'string' } },
    })

    cap.restore()
  })

  it('maps cache usage from response', async () => {
    const restore = mockFetch({
      id: 'msg-1',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: 'ok' }],
      model: 'claude-sonnet-4-20250514',
      stop_reason: 'end_turn',
      usage: {
        input_tokens: 100,
        output_tokens: 10,
        cache_creation_input_tokens: 50,
        cache_read_input_tokens: 30,
      },
    })

    const model = createAnthropicModel(makeAnthropicConfig())
    const result = await model.generate({
      messages: [{ role: 'user', content: 'Hi' }],
    })

    expect(result.usage.input).toBe(100)
    expect(result.usage.output).toBe(10)
    expect(result.usage.cacheRead).toBe(30)
    expect(result.usage.cacheWrite).toBe(50)
    expect(result.usage.total).toBe(110)
    restore()
  })

  it('throws on non-200 response', async () => {
    const restore = mockFetch({ error: { message: 'rate limited' } }, 429)
    const model = createAnthropicModel(makeAnthropicConfig())

    await expect(model.generate({ messages: [{ role: 'user', content: 'Hi' }] })).rejects.toThrow(
      '429',
    )
    restore()
  })
})

// ─── stream ─────────────────────────────────────────────────

describe('stream', () => {
  it('yields text deltas from Anthropic SSE', async () => {
    const restore = mockFetchStream([
      { event: 'message_start', data: { message: { usage: { input_tokens: 10 } } } },
      { event: 'content_block_start', data: { index: 0, content_block: { type: 'text' } } },
      {
        event: 'content_block_delta',
        data: { index: 0, delta: { type: 'text_delta', text: 'Hello' } },
      },
      {
        event: 'content_block_delta',
        data: { index: 0, delta: { type: 'text_delta', text: ' world' } },
      },
      { event: 'content_block_stop', data: { index: 0 } },
      {
        event: 'message_delta',
        data: { delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 5 } },
      },
      { event: 'message_stop', data: {} },
    ])

    const model = createAnthropicModel(makeAnthropicConfig())
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
    const restore = mockFetchStream([
      { event: 'message_start', data: { message: { usage: { input_tokens: 5 } } } },
      { event: 'content_block_start', data: { index: 0, content_block: { type: 'thinking' } } },
      {
        event: 'content_block_delta',
        data: { index: 0, delta: { type: 'thinking_delta', thinking: 'Reasoning...' } },
      },
      { event: 'content_block_stop', data: { index: 0 } },
      { event: 'content_block_start', data: { index: 1, content_block: { type: 'text' } } },
      {
        event: 'content_block_delta',
        data: { index: 1, delta: { type: 'text_delta', text: 'The answer.' } },
      },
      { event: 'content_block_stop', data: { index: 1 } },
      {
        event: 'message_delta',
        data: { delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 10 } },
      },
      { event: 'message_stop', data: {} },
    ])

    const model = createAnthropicModel(makeAnthropicConfig())
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
    const restore = mockFetchStream([
      { event: 'message_start', data: { message: { usage: { input_tokens: 5 } } } },
      {
        event: 'content_block_start',
        data: { index: 0, content_block: { type: 'tool_use', id: 'tc-1', name: 'get_weather' } },
      },
      {
        event: 'content_block_delta',
        data: { index: 0, delta: { type: 'input_json_delta', partial_json: '{"city":' } },
      },
      {
        event: 'content_block_delta',
        data: { index: 0, delta: { type: 'input_json_delta', partial_json: '"NYC"}' } },
      },
      { event: 'content_block_stop', data: { index: 0 } },
      {
        event: 'message_delta',
        data: { delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 10 } },
      },
      { event: 'message_stop', data: {} },
    ])

    const model = createAnthropicModel(makeAnthropicConfig())
    const toolCalls: Array<{ name: string; args: unknown }> = []
    const toolCallDeltas: string[] = []

    for await (const chunk of model.stream({
      messages: [{ role: 'user', content: 'Weather?' }],
    })) {
      if (chunk.type === 'tool-call') {
        toolCalls.push({ name: chunk.toolCall.name, args: chunk.toolCall.args })
      }
      if (chunk.type === 'tool-call-delta') {
        toolCallDeltas.push(chunk.delta)
      }
    }

    expect(toolCalls).toHaveLength(1)
    expect(toolCalls[0].name).toBe('get_weather')
    expect(toolCalls[0].args).toEqual({ city: 'NYC' })
    expect(toolCallDeltas).toEqual(['{"city":', '"NYC"}'])
    restore()
  })

  it('emits usage with cache info from message_start and message_delta', async () => {
    const restore = mockFetchStream([
      {
        event: 'message_start',
        data: {
          message: {
            usage: {
              input_tokens: 50,
              cache_creation_input_tokens: 30,
              cache_read_input_tokens: 20,
            },
          },
        },
      },
      { event: 'content_block_start', data: { index: 0, content_block: { type: 'text' } } },
      {
        event: 'content_block_delta',
        data: { index: 0, delta: { type: 'text_delta', text: 'ok' } },
      },
      { event: 'content_block_stop', data: { index: 0 } },
      {
        event: 'message_delta',
        data: { delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 5 } },
      },
      { event: 'message_stop', data: {} },
    ])

    const model = createAnthropicModel(makeAnthropicConfig())
    let usage: {
      input: number
      output: number
      total: number
      cacheRead?: number
      cacheWrite?: number
    } | null = null

    for await (const chunk of model.stream({
      messages: [{ role: 'user', content: 'Hi' }],
    })) {
      if (chunk.type === 'usage') usage = chunk.usage
    }

    expect(usage).not.toBeNull()
    expect(usage?.input).toBe(50)
    expect(usage?.output).toBe(5)
    expect(usage?.total).toBe(55)
    expect(usage?.cacheRead).toBe(20)
    expect(usage?.cacheWrite).toBe(30)
    restore()
  })

  it('emits finish with correct reason mapping', async () => {
    const restore = mockFetchStream([
      { event: 'message_start', data: { message: { usage: { input_tokens: 1 } } } },
      { event: 'content_block_start', data: { index: 0, content_block: { type: 'text' } } },
      {
        event: 'content_block_delta',
        data: { index: 0, delta: { type: 'text_delta', text: 'hi' } },
      },
      { event: 'content_block_stop', data: { index: 0 } },
      {
        event: 'message_delta',
        data: { delta: { stop_reason: 'max_tokens' }, usage: { output_tokens: 1 } },
      },
      { event: 'message_stop', data: {} },
    ])

    const model = createAnthropicModel(makeAnthropicConfig())
    const reasons: string[] = []

    for await (const chunk of model.stream({
      messages: [{ role: 'user', content: 'Hi' }],
    })) {
      if (chunk.type === 'finish') reasons.push(chunk.reason)
    }

    expect(reasons).toEqual(['length'])
    restore()
  })

  it('ignores ping events', async () => {
    const restore = mockFetchStream([
      { event: 'ping', data: {} },
      { event: 'message_start', data: { message: { usage: { input_tokens: 1 } } } },
      { event: 'content_block_start', data: { index: 0, content_block: { type: 'text' } } },
      {
        event: 'content_block_delta',
        data: { index: 0, delta: { type: 'text_delta', text: 'ok' } },
      },
      { event: 'content_block_stop', data: { index: 0 } },
      {
        event: 'message_delta',
        data: { delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 1 } },
      },
      { event: 'message_stop', data: {} },
    ])

    const model = createAnthropicModel(makeAnthropicConfig())
    const textChunks: string[] = []

    for await (const chunk of model.stream({
      messages: [{ role: 'user', content: 'Hi' }],
    })) {
      if (chunk.type === 'text-delta') textChunks.push(chunk.delta)
    }

    expect(textChunks).toEqual(['ok'])
    restore()
  })

  it('throws on non-200 response', async () => {
    const restore = mockFetch({ error: { message: 'forbidden' } }, 403)
    const model = createAnthropicModel(makeAnthropicConfig())

    const gen = model.stream({ messages: [{ role: 'user', content: 'Hi' }] })
    await expect(gen[Symbol.asyncIterator]().next()).rejects.toThrow('403')
    restore()
  })
})

// ─── SSE parser ─────────────────────────────────────────────

describe('parseSSEEvent', () => {
  it('parses valid event and data lines', () => {
    const result = parseSSEEvent(
      'event: message_start',
      'data: {"type":"message_start","message":{"id":"msg-1"}}',
    )
    expect(result).not.toBeNull()
    expect(result?.type).toBe('message_start')
  })

  it('returns null for non-event lines', () => {
    expect(parseSSEEvent('random event', 'data: {}')).toBeNull()
    expect(parseSSEEvent('event: message_start', 'random data')).toBeNull()
  })

  it('returns null for empty lines', () => {
    expect(parseSSEEvent('', '')).toBeNull()
  })

  it('returns null for malformed JSON', () => {
    expect(parseSSEEvent('event: error', 'data: {broken')).toBeNull()
  })
})

// ─── message conversion ─────────────────────────────────────

describe('convertMessages', () => {
  it('converts basic user message', () => {
    const { messages } = convertMessages([{ role: 'user', content: 'Hello' }])
    expect(messages).toEqual([{ role: 'user', content: 'Hello' }])
  })

  it('extracts system messages to system field', () => {
    const { system, messages } = convertMessages([
      { role: 'system', content: 'Be helpful' },
      { role: 'user', content: 'Hi' },
    ])
    expect(system).toBe('Be helpful')
    expect(messages).toEqual([{ role: 'user', content: 'Hi' }])
  })

  it('concatenates multiple system messages', () => {
    const { system } = convertMessages([
      { role: 'system', content: 'Rule 1' },
      { role: 'system', content: 'Rule 2' },
      { role: 'user', content: 'Hi' },
    ])
    expect(system).toBe('Rule 1\nRule 2')
  })

  it('prefers system option over system role messages', () => {
    const { system } = convertMessages(
      [
        { role: 'system', content: 'From message' },
        { role: 'user', content: 'Hi' },
      ],
      'From option',
    )
    expect(system).toBe('From option\nFrom message')
  })

  it('uses system option when no system role messages', () => {
    const { system } = convertMessages([{ role: 'user', content: 'Hi' }], 'Be concise')
    expect(system).toBe('Be concise')
  })

  it('converts assistant message with text', () => {
    const { messages } = convertMessages([
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: 'Hello!' },
    ])
    expect(messages).toHaveLength(2)
    expect(messages[0]).toEqual({ role: 'user', content: 'Hi' })
    expect(messages[1]).toEqual({
      role: 'assistant',
      content: [{ type: 'text', text: 'Hello!' }],
    })
  })

  it('converts assistant with tool_use blocks', () => {
    const { messages } = convertMessages([
      {
        role: 'assistant',
        content: '',
        toolCalls: [{ id: 'tc-1', name: 'bash', args: { command: 'ls' } }],
      },
    ])
    expect(messages).toHaveLength(1)
    expect(messages[0]).toEqual({
      role: 'assistant',
      content: [{ type: 'tool_use', id: 'tc-1', name: 'bash', input: { command: 'ls' } }],
    })
  })

  it('converts assistant with text and tool_use blocks', () => {
    const { messages } = convertMessages([
      {
        role: 'assistant',
        content: 'I will run the command.',
        toolCalls: [{ id: 'tc-1', name: 'bash', args: { command: 'ls' } }],
      },
    ])
    expect(messages[0]).toEqual({
      role: 'assistant',
      content: [
        { type: 'text', text: 'I will run the command.' },
        { type: 'tool_use', id: 'tc-1', name: 'bash', input: { command: 'ls' } },
      ],
    })
  })

  it('converts user message with tool_results', () => {
    const { messages } = convertMessages([
      {
        role: 'user',
        content: '',
        toolResults: [
          {
            toolCallId: 'tc-1',
            toolName: 'bash',
            result: 'file1.txt\nfile2.txt',
            durationMs: 50,
          },
        ],
      },
    ])
    expect(messages).toHaveLength(1)
    expect(messages[0]).toEqual({
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: 'tc-1', content: 'file1.txt\nfile2.txt' }],
    })
  })

  it('converts user message with tool_results and error', () => {
    const { messages } = convertMessages([
      {
        role: 'user',
        content: '',
        toolResults: [
          {
            toolCallId: 'tc-1',
            toolName: 'bash',
            result: 'partial output',
            error: 'command failed',
            durationMs: 1000,
          },
        ],
      },
    ])
    expect(messages[0]).toEqual({
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: 'tc-1',
          content: 'Error: command failed\npartial output',
        },
      ],
    })
  })

  it('converts user message with text and tool_results', () => {
    const { messages } = convertMessages([
      {
        role: 'user',
        content: 'Here are the results:',
        toolResults: [
          {
            toolCallId: 'tc-1',
            toolName: 'bash',
            result: 'done',
            durationMs: 10,
          },
        ],
      },
    ])
    expect(messages[0]).toEqual({
      role: 'user',
      content: [
        { type: 'text', text: 'Here are the results:' },
        { type: 'tool_result', tool_use_id: 'tc-1', content: 'done' },
      ],
    })
  })

  it('skips empty assistant messages', () => {
    const { messages } = convertMessages([
      { role: 'assistant', content: '' },
      { role: 'user', content: 'Hi' },
    ])
    expect(messages).toEqual([{ role: 'user', content: 'Hi' }])
  })
})

// ─── tool conversion ────────────────────────────────────────

describe('convertTools', () => {
  it('converts tool definitions to Anthropic format with input_schema', () => {
    const tools: ToolDefinition[] = [
      {
        name: 'bash',
        description: 'Run a bash command',
        parameters: {
          type: 'object',
          properties: { command: { type: 'string' } },
          required: ['command'],
        },
      },
    ]
    const result = convertTools(tools)
    expect(result).toEqual([
      {
        name: 'bash',
        description: 'Run a bash command',
        input_schema: {
          type: 'object',
          properties: { command: { type: 'string' } },
          required: ['command'],
        },
      },
    ])
  })

  it('returns undefined for empty tools array', () => {
    expect(convertTools([])).toBeUndefined()
  })

  it('converts multiple tools', () => {
    const tools: ToolDefinition[] = [
      { name: 'a', description: 'A', parameters: { type: 'object' } },
      { name: 'b', description: 'B', parameters: { type: 'object' } },
    ]
    const result = convertTools(tools)
    expect(result).toHaveLength(2)
    expect(result?.[0].name).toBe('a')
    expect(result?.[1].name).toBe('b')
  })
})

// ─── models.ts ─────────────────────────────────────────────

describe('ANTHROPIC_MODELS', () => {
  it('has three models', () => {
    expect(ANTHROPIC_MODELS).toHaveLength(3)
  })

  it('each model has correct properties', () => {
    for (const model of ANTHROPIC_MODELS) {
      expect(model.name).toBeTruthy()
      expect(model.displayName).toBeTruthy()
      expect(model.contextWindow).toBeGreaterThan(0)
      expect(model.maxTokens).toBeGreaterThan(0)
      expect(typeof model.cost.inputPerToken).toBe('number')
      expect(typeof model.cost.outputPerToken).toBe('number')
    }
  })

  it('has claude-opus-4 with thinking', () => {
    const opus = ANTHROPIC_MODELS.find((m) => m.name === 'claude-opus-4-20250514')
    expect(opus).toBeDefined()
    expect(opus?.thinking).toBe(true)
    expect(opus?.contextWindow).toBe(200000)
    expect(opus?.maxTokens).toBe(32000)
  })

  it('has claude-sonnet-4 with thinking', () => {
    const sonnet = ANTHROPIC_MODELS.find((m) => m.name === 'claude-sonnet-4-20250514')
    expect(sonnet).toBeDefined()
    expect(sonnet?.thinking).toBe(true)
  })

  it('has claude-haiku-3.5 without thinking', () => {
    const haiku = ANTHROPIC_MODELS.find((m) => m.name === 'claude-haiku-3-5-20241022')
    expect(haiku).toBeDefined()
    expect(haiku?.thinking).toBeUndefined()
  })
})

describe('createAnthropicPresetModel', () => {
  it('creates model from valid preset', () => {
    const model = createAnthropicPresetModel('claude-sonnet-4-20250514', 'test-key')
    expect(model).toBeDefined()
    expect(model?.provider).toBe('anthropic')
    expect(model?.name).toBe('claude-sonnet-4-20250514')
    expect(model?.config.displayName).toBe('Claude Sonnet')
  })

  it('returns undefined for unknown model', () => {
    expect(createAnthropicPresetModel('nonexistent-model', 'key')).toBeUndefined()
  })

  it('sets thinking capability from preset', () => {
    const model = createAnthropicPresetModel('claude-opus-4-20250514', 'key')
    expect(model?.config.capabilities.thinking).toBe(true)
  })

  it('sets vision and toolCalls capabilities', () => {
    const model = createAnthropicPresetModel('claude-sonnet-4-20250514', 'key')
    expect(model?.config.capabilities.vision).toBe(true)
    expect(model?.config.capabilities.toolCalls).toBe(true)
  })

  it('sets correct defaultMaxTokens', () => {
    const model = createAnthropicPresetModel('claude-haiku-3-5-20241022', 'key')
    expect(model?.config.defaultMaxTokens).toBe(8192)
  })
})
