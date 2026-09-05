import { describe, expect, it } from 'bun:test'
import type { GenerateOptions, ModelConfig, StreamChunk } from '../../model/types'
import { createOpenAIModel } from './adapter'
import { OPENAI_MODELS, createOpenAIPresetModel, listOpenAIModels } from './models'

const mockConfig: ModelConfig = {
  id: 'openai/gpt-4o',
  provider: 'openai',
  name: 'gpt-4o',
  displayName: 'GPT-4o',
  capabilities: {
    text: true,
    thinking: false,
    toolCalls: true,
    structuredOutput: true,
    vision: true,
    pdf: false,
    maxTokens: 16384,
    contextWindow: 128000,
  },
  cost: { inputPerToken: 0.0000025, outputPerToken: 0.00001 },
  defaultMaxTokens: 4096,
  supportsCacheControl: false,
}

const mockOptions: GenerateOptions = {
  messages: [{ role: 'user', content: 'Hello' }],
  maxTokens: 100,
}

function makeMockResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: { 'Content-Type': 'application/json' },
  })
}

function makeMockStreamResponse(
  chunks: Array<Record<string, unknown>>,
  usage?: Record<string, number>,
): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`))
      }
      if (usage) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ id: 'mock', object: 'chat.completion.chunk', created: 0, model: 'gpt-4o', choices: [], usage })}\n\n`,
          ),
        )
      }
      controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      controller.close()
    },
  })

  return new Response(stream, { status: 200, statusText: 'OK' })
}

describe('OpenAI Adapter', () => {
  describe('model creation', () => {
    it('creates model with correct id and provider', () => {
      const model = createOpenAIModel({ name: 'gpt-4o', apiKey: 'test-key', config: mockConfig })
      expect(model.id).toBe('openai/gpt-4o')
      expect(model.provider).toBe('openai')
      expect(model.name).toBe('gpt-4o')
    })

    it('returns correct capabilities', () => {
      const model = createOpenAIModel({ name: 'gpt-4o', apiKey: 'test-key', config: mockConfig })
      const caps = model.getCapabilities()
      expect(caps.text).toBe(true)
      expect(caps.thinking).toBe(false)
      expect(caps.toolCalls).toBe(true)
      expect(caps.structuredOutput).toBe(true)
      expect(caps.vision).toBe(true)
      expect(caps.contextWindow).toBe(128000)
    })

    it('supportsFeature returns correct values', () => {
      const model = createOpenAIModel({ name: 'gpt-4o', apiKey: 'test-key', config: mockConfig })
      expect(model.supportsFeature('text')).toBe(true)
      expect(model.supportsFeature('thinking')).toBe(false)
      expect(model.supportsFeature('toolCalls')).toBe(true)
      expect(model.supportsFeature('vision')).toBe(true)
      expect(model.supportsFeature('pdf')).toBe(false)
    })

    it('uses custom provider name', () => {
      const model = createOpenAIModel({
        provider: 'custom-openai',
        name: 'gpt-4o',
        apiKey: 'key',
        config: mockConfig,
      })
      expect(model.id).toBe('custom-openai/gpt-4o')
      expect(model.provider).toBe('custom-openai')
    })
  })

  describe('generate', () => {
    it('sends correct request to OpenAI API', async () => {
      let capturedUrl: string | undefined
      let capturedBody: Record<string, unknown> | undefined

      const origFetch = globalThis.fetch
      globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
        if (typeof url === 'string') capturedUrl = url
        if (init?.body) capturedBody = JSON.parse(init.body as string)
        return makeMockResponse({
          id: 'chatcmpl-123',
          object: 'chat.completion',
          created: 0,
          model: 'gpt-4o',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: 'Hello!' },
              finish_reason: 'stop',
              logprobs: null,
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        })
      }

      try {
        const model = createOpenAIModel({ name: 'gpt-4o', apiKey: 'sk-test', config: mockConfig })
        const result = await model.generate(mockOptions)

        expect(capturedUrl).toBe('https://api.openai.com/v1/chat/completions')
        expect(capturedBody?.model).toBe('gpt-4o')
        expect(capturedBody?.stream).toBe(false)
        expect(capturedBody?.max_tokens).toBe(100)
        expect(result.content).toBe('Hello!')
        expect(result.usage.input).toBe(10)
        expect(result.usage.output).toBe(5)
        expect(result.usage.total).toBe(15)
        expect(result.finishReason).toBe('stop')
        expect(result.model).toBe('gpt-4o')
      } finally {
        globalThis.fetch = origFetch
      }
    })

    it('converts system prompt to system message', async () => {
      let capturedBody: Record<string, unknown> | undefined

      const origFetch = globalThis.fetch
      globalThis.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
        if (init?.body) capturedBody = JSON.parse(init.body as string)
        return makeMockResponse({
          id: 'chatcmpl-123',
          object: 'chat.completion',
          created: 0,
          model: 'gpt-4o',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: 'ok' },
              finish_reason: 'stop',
              logprobs: null,
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        })
      }

      try {
        const model = createOpenAIModel({ name: 'gpt-4o', apiKey: 'key', config: mockConfig })
        await model.generate({
          messages: [{ role: 'user', content: 'Hi' }],
          system: 'You are helpful',
          maxTokens: 100,
        })

        const msgs = capturedBody?.messages as Array<{ role: string; content: string }>
        expect(msgs[0].role).toBe('system')
        expect(msgs[0].content).toBe('You are helpful')
        expect(msgs[1].role).toBe('user')
        expect(msgs[1].content).toBe('Hi')
      } finally {
        globalThis.fetch = origFetch
      }
    })

    it('parses tool calls from assistant message', async () => {
      const origFetch = globalThis.fetch
      globalThis.fetch = async () =>
        makeMockResponse({
          id: 'chatcmpl-123',
          object: 'chat.completion',
          created: 0,
          model: 'gpt-4o',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: '',
                tool_calls: [
                  {
                    id: 'call_abc',
                    type: 'function',
                    function: { name: 'bash', arguments: '{"command":"ls"}' },
                  },
                ],
              },
              finish_reason: 'tool_calls',
              logprobs: null,
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        })

      try {
        const model = createOpenAIModel({ name: 'gpt-4o', apiKey: 'key', config: mockConfig })
        const result = await model.generate({
          messages: [{ role: 'user', content: 'list files' }],
          tools: [
            { name: 'bash', description: 'Run', parameters: { type: 'object', properties: {} } },
          ],
          maxTokens: 100,
        })

        expect(result.toolCalls).toHaveLength(1)
        expect(result.toolCalls[0].id).toBe('call_abc')
        expect(result.toolCalls[0].name).toBe('bash')
        expect(result.toolCalls[0].args).toEqual({ command: 'ls' })
        expect(result.finishReason).toBe('tool-call')
      } finally {
        globalThis.fetch = origFetch
      }
    })

    it('converts tool result messages correctly', async () => {
      let capturedBody: Record<string, unknown> | undefined

      const origFetch = globalThis.fetch
      globalThis.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
        if (init?.body) capturedBody = JSON.parse(init.body as string)
        return makeMockResponse({
          id: 'chatcmpl-123',
          object: 'chat.completion',
          created: 0,
          model: 'gpt-4o',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: 'ok' },
              finish_reason: 'stop',
              logprobs: null,
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        })
      }

      try {
        const model = createOpenAIModel({ name: 'gpt-4o', apiKey: 'key', config: mockConfig })
        await model.generate({
          messages: [
            { role: 'user', content: 'list files' },
            {
              role: 'assistant',
              content: '',
              toolCalls: [{ id: 'call_1', name: 'bash', args: { command: 'ls' } }],
            },
            {
              role: 'user',
              content: '',
              toolResults: [{ toolCallId: 'call_1', result: 'file1.txt\nfile2.txt' }],
            },
          ],
          tools: [
            { name: 'bash', description: 'Run', parameters: { type: 'object', properties: {} } },
          ],
          maxTokens: 100,
        })

        const msgs = capturedBody?.messages as Array<Record<string, unknown>>
        const toolMsg = msgs[2]
        expect(toolMsg.role).toBe('tool')
        expect(toolMsg.content).toBe('file1.txt\nfile2.txt')
        expect(toolMsg.tool_call_id).toBe('call_1')
      } finally {
        globalThis.fetch = origFetch
      }
    })

    it('includes tools in request when provided', async () => {
      let capturedBody: Record<string, unknown> | undefined

      const origFetch = globalThis.fetch
      globalThis.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
        if (init?.body) capturedBody = JSON.parse(init.body as string)
        return makeMockResponse({
          id: 'chatcmpl-123',
          object: 'chat.completion',
          created: 0,
          model: 'gpt-4o',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: 'ok' },
              finish_reason: 'stop',
              logprobs: null,
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        })
      }

      try {
        const model = createOpenAIModel({ name: 'gpt-4o', apiKey: 'key', config: mockConfig })
        await model.generate({
          messages: [{ role: 'user', content: 'hi' }],
          tools: [
            {
              name: 'read_file',
              description: 'Read a file',
              parameters: { type: 'object', properties: { path: { type: 'string' } } },
            },
          ],
          maxTokens: 100,
        })

        const tools = capturedBody?.tools as Array<Record<string, unknown>>
        expect(tools).toHaveLength(1)
        expect(tools[0].type).toBe('function')
        const fn = tools[0].function as Record<string, unknown>
        expect(fn.name).toBe('read_file')
        expect(fn.description).toBe('Read a file')
        expect(capturedBody?.tool_choice).toBe('auto')
      } finally {
        globalThis.fetch = origFetch
      }
    })

    it('sends reasoning for o3 models', async () => {
      let capturedBody: Record<string, unknown> | undefined

      const origFetch = globalThis.fetch
      globalThis.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
        if (init?.body) capturedBody = JSON.parse(init.body as string)
        return makeMockResponse({
          id: 'chatcmpl-123',
          object: 'chat.completion',
          created: 0,
          model: 'o3',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: 'reasoned answer' },
              finish_reason: 'stop',
              logprobs: null,
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        })
      }

      try {
        const model = createOpenAIModel({ name: 'o3', apiKey: 'key', config: mockConfig })
        await model.generate({
          messages: [{ role: 'user', content: 'think hard' }],
          thinking: { budgetTokens: 100000 },
          maxTokens: 100,
        })

        expect(capturedBody?.reasoning).toEqual({ effort: 'high' })
      } finally {
        globalThis.fetch = origFetch
      }
    })

    it('sends response_format for structured output', async () => {
      let capturedBody: Record<string, unknown> | undefined

      const origFetch = globalThis.fetch
      globalThis.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
        if (init?.body) capturedBody = JSON.parse(init.body as string)
        return makeMockResponse({
          id: 'chatcmpl-123',
          object: 'chat.completion',
          created: 0,
          model: 'gpt-4o',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: '{"key":"value"}' },
              finish_reason: 'stop',
              logprobs: null,
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        })
      }

      try {
        const model = createOpenAIModel({ name: 'gpt-4o', apiKey: 'key', config: mockConfig })
        await model.generate({
          messages: [{ role: 'user', content: 'get data' }],
          maxTokens: 100,
        })

        expect(capturedBody?.response_format).toEqual({ type: 'json_object' })
      } finally {
        globalThis.fetch = origFetch
      }
    })

    it('throws on API error', async () => {
      const origFetch = globalThis.fetch
      globalThis.fetch = async () => makeMockResponse({ error: 'rate limited' }, 429)

      try {
        const model = createOpenAIModel({ name: 'gpt-4o', apiKey: 'key', config: mockConfig })
        await expect(model.generate(mockOptions)).rejects.toThrow('OpenAI API error: 429')
      } finally {
        globalThis.fetch = origFetch
      }
    })

    it('sends Authorization header with API key', async () => {
      let capturedHeaders: Headers | undefined

      const origFetch = globalThis.fetch
      globalThis.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
        capturedHeaders = new Headers(init?.headers as HeadersInit)
        return makeMockResponse({
          id: 'chatcmpl-123',
          object: 'chat.completion',
          created: 0,
          model: 'gpt-4o',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: 'ok' },
              finish_reason: 'stop',
              logprobs: null,
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        })
      }

      try {
        const model = createOpenAIModel({ name: 'gpt-4o', apiKey: 'sk-my-key', config: mockConfig })
        await model.generate(mockOptions)
        expect(capturedHeaders?.get('Authorization')).toBe('Bearer sk-my-key')
      } finally {
        globalThis.fetch = origFetch
      }
    })
  })

  describe('stream', () => {
    it('streams text deltas', async () => {
      const origFetch = globalThis.fetch
      globalThis.fetch = async () =>
        makeMockStreamResponse([
          {
            id: 'chatcmpl-123',
            object: 'chat.completion.chunk',
            created: 0,
            model: 'gpt-4o',
            choices: [
              {
                index: 0,
                delta: { role: 'assistant', content: '' },
                finish_reason: null,
                logprobs: null,
              },
            ],
          },
          {
            id: 'chatcmpl-123',
            object: 'chat.completion.chunk',
            created: 0,
            model: 'gpt-4o',
            choices: [
              { index: 0, delta: { content: 'Hello' }, finish_reason: null, logprobs: null },
            ],
          },
          {
            id: 'chatcmpl-123',
            object: 'chat.completion.chunk',
            created: 0,
            model: 'gpt-4o',
            choices: [
              { index: 0, delta: { content: ' world' }, finish_reason: null, logprobs: null },
            ],
          },
          {
            id: 'chatcmpl-123',
            object: 'chat.completion.chunk',
            created: 0,
            model: 'gpt-4o',
            choices: [{ index: 0, delta: {}, finish_reason: 'stop', logprobs: null }],
          },
        ])

      try {
        const model = createOpenAIModel({ name: 'gpt-4o', apiKey: 'key', config: mockConfig })
        const chunks: StreamChunk[] = []
        for await (const chunk of model.stream(mockOptions)) {
          chunks.push(chunk)
        }

        const textDeltas = chunks.filter((c) => c.type === 'text-delta')
        expect(textDeltas).toHaveLength(2)
        expect(textDeltas[0]).toEqual({ type: 'text-delta', delta: 'Hello' })
        expect(textDeltas[1]).toEqual({ type: 'text-delta', delta: ' world' })

        const finishChunks = chunks.filter((c) => c.type === 'finish')
        expect(finishChunks).toHaveLength(1)
        expect(finishChunks[0]).toEqual({ type: 'finish', reason: 'stop' })
      } finally {
        globalThis.fetch = origFetch
      }
    })

    it('streams tool call deltas', async () => {
      const origFetch = globalThis.fetch
      globalThis.fetch = async () =>
        makeMockStreamResponse([
          {
            id: 'chatcmpl-123',
            object: 'chat.completion.chunk',
            created: 0,
            model: 'gpt-4o',
            choices: [
              {
                index: 0,
                delta: {
                  tool_calls: [
                    {
                      index: 0,
                      id: 'call_1',
                      type: 'function',
                      function: { name: 'bash', arguments: '' },
                    },
                  ],
                },
                finish_reason: null,
                logprobs: null,
              },
            ],
          },
          {
            id: 'chatcmpl-123',
            object: 'chat.completion.chunk',
            created: 0,
            model: 'gpt-4o',
            choices: [
              {
                index: 0,
                delta: { tool_calls: [{ index: 0, function: { arguments: '{"comm' } }] },
                finish_reason: null,
                logprobs: null,
              },
            ],
          },
          {
            id: 'chatcmpl-123',
            object: 'chat.completion.chunk',
            created: 0,
            model: 'gpt-4o',
            choices: [
              {
                index: 0,
                delta: { tool_calls: [{ index: 0, function: { arguments: 'and":"ls"}' } }] },
                finish_reason: null,
                logprobs: null,
              },
            ],
          },
          {
            id: 'chatcmpl-123',
            object: 'chat.completion.chunk',
            created: 0,
            model: 'gpt-4o',
            choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls', logprobs: null }],
          },
        ])

      try {
        const model = createOpenAIModel({ name: 'gpt-4o', apiKey: 'key', config: mockConfig })
        const chunks: StreamChunk[] = []
        for await (const chunk of model.stream(mockOptions)) {
          chunks.push(chunk)
        }

        const toolCallChunks = chunks.filter((c) => c.type === 'tool-call')
        expect(toolCallChunks.length).toBeGreaterThanOrEqual(1)
        const tc = toolCallChunks[toolCallChunks.length - 1] as {
          type: 'tool-call'
          toolCall: { id: string; name: string; args: unknown }
        }
        expect(tc.toolCall.name).toBe('bash')
        expect(tc.toolCall.args).toEqual({ command: 'ls' })
      } finally {
        globalThis.fetch = origFetch
      }
    })

    it('streams usage info', async () => {
      const origFetch = globalThis.fetch
      globalThis.fetch = async () =>
        makeMockStreamResponse(
          [
            {
              id: 'chatcmpl-123',
              object: 'chat.completion.chunk',
              created: 0,
              model: 'gpt-4o',
              choices: [
                { index: 0, delta: { content: 'hi' }, finish_reason: null, logprobs: null },
              ],
            },
            {
              id: 'chatcmpl-123',
              object: 'chat.completion.chunk',
              created: 0,
              model: 'gpt-4o',
              choices: [{ index: 0, delta: {}, finish_reason: 'stop', logprobs: null }],
            },
          ],
          { prompt_tokens: 10, completion_tokens: 3, total_tokens: 13 },
        )

      try {
        const model = createOpenAIModel({ name: 'gpt-4o', apiKey: 'key', config: mockConfig })
        const chunks: StreamChunk[] = []
        for await (const chunk of model.stream(mockOptions)) {
          chunks.push(chunk)
        }

        const usageChunks = chunks.filter((c) => c.type === 'usage')
        expect(usageChunks).toHaveLength(1)
        expect(usageChunks[0]).toEqual({
          type: 'usage',
          usage: { input: 10, output: 3, total: 13 },
        })
      } finally {
        globalThis.fetch = origFetch
      }
    })

    it('handles empty content chunks', async () => {
      const origFetch = globalThis.fetch
      globalThis.fetch = async () =>
        makeMockStreamResponse([
          {
            id: 'chatcmpl-123',
            object: 'chat.completion.chunk',
            created: 0,
            model: 'gpt-4o',
            choices: [
              { index: 0, delta: { role: 'assistant' }, finish_reason: null, logprobs: null },
            ],
          },
          {
            id: 'chatcmpl-123',
            object: 'chat.completion.chunk',
            created: 0,
            model: 'gpt-4o',
            choices: [{ index: 0, delta: {}, finish_reason: 'stop', logprobs: null }],
          },
        ])

      try {
        const model = createOpenAIModel({ name: 'gpt-4o', apiKey: 'key', config: mockConfig })
        const chunks: StreamChunk[] = []
        for await (const chunk of model.stream(mockOptions)) {
          chunks.push(chunk)
        }

        const textChunks = chunks.filter((c) => c.type === 'text-delta')
        expect(textChunks).toHaveLength(0)
      } finally {
        globalThis.fetch = origFetch
      }
    })

    it('throws on stream error', async () => {
      const origFetch = globalThis.fetch
      globalThis.fetch = async () => makeMockResponse({ error: 'bad request' }, 400)

      try {
        const model = createOpenAIModel({ name: 'gpt-4o', apiKey: 'key', config: mockConfig })
        const iter = model.stream(mockOptions)
        await expect(iter[Symbol.asyncIterator]().next()).rejects.toThrow('OpenAI API error: 400')
      } finally {
        globalThis.fetch = origFetch
      }
    })
  })

  describe('stream with vision', () => {
    it('sends text content correctly', async () => {
      let capturedBody: Record<string, unknown> | undefined

      const origFetch = globalThis.fetch
      globalThis.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
        if (init?.body) capturedBody = JSON.parse(init.body as string)
        return makeMockResponse({
          id: 'chatcmpl-123',
          object: 'chat.completion',
          created: 0,
          model: 'gpt-4o',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: 'I see a cat' },
              finish_reason: 'stop',
              logprobs: null,
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        })
      }

      try {
        const model = createOpenAIModel({ name: 'gpt-4o', apiKey: 'key', config: mockConfig })
        await model.generate({
          messages: [
            {
              role: 'user',
              content: 'What is this?',
            },
          ],
          maxTokens: 100,
        })

        const msgs = capturedBody?.messages as Array<{ role: string; content: string }>
        expect(msgs[0].content).toBe('What is this?')
      } finally {
        globalThis.fetch = origFetch
      }
    })
  })
})

describe('OpenAI Models', () => {
  it('lists all models', () => {
    expect(listOpenAIModels()).toHaveLength(6)
    expect(OPENAI_MODELS).toHaveLength(6)
  })

  it('gpt-4o preset has correct values', () => {
    const preset = OPENAI_MODELS.find((m) => m.name === 'gpt-4o')
    expect(preset).toBeDefined()
    expect(preset?.displayName).toBe('GPT-4o')
    expect(preset?.contextWindow).toBe(128000)
    expect(preset?.maxTokens).toBe(16384)
    expect(preset?.vision).toBe(true)
    expect(preset?.reasoning).toBeUndefined()
  })

  it('o3 preset has reasoning enabled', () => {
    const preset = OPENAI_MODELS.find((m) => m.name === 'o3')
    expect(preset).toBeDefined()
    expect(preset?.reasoning).toBe(true)
    expect(preset?.maxTokens).toBe(100000)
  })

  it('o4-mini preset has reasoning enabled', () => {
    const preset = OPENAI_MODELS.find((m) => m.name === 'o4-mini')
    expect(preset).toBeDefined()
    expect(preset?.reasoning).toBe(true)
  })

  it('createOpenAIPresetModel creates a valid model', () => {
    const model = createOpenAIPresetModel('gpt-4o', 'sk-key')
    expect(model).toBeDefined()
    expect(model?.id).toBe('openai/gpt-4o')
    expect(model?.provider).toBe('openai')
    expect(model?.getCapabilities().text).toBe(true)
    expect(model?.getCapabilities().vision).toBe(true)
    expect(model?.getCapabilities().toolCalls).toBe(true)
    expect(model?.getCapabilities().structuredOutput).toBe(true)
    expect(model?.getCapabilities().thinking).toBe(false)
  })

  it('createOpenAIPresetModel returns undefined for unknown model', () => {
    const model = createOpenAIPresetModel('nonexistent', 'sk-key')
    expect(model).toBeUndefined()
  })

  it('gpt-4.1 preset has 1M context window', () => {
    const preset = OPENAI_MODELS.find((m) => m.name === 'gpt-4.1')
    expect(preset).toBeDefined()
    expect(preset?.contextWindow).toBe(1000000)
    expect(preset?.maxTokens).toBe(32768)
  })
})
