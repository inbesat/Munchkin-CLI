import { describe, expect, it } from 'bun:test'
import type { ModelConfig } from '../../model/types'
import { createAzureModel } from './adapter'

const mockConfig: ModelConfig = {
  id: 'azure/gpt-4o',
  provider: 'azure',
  name: 'gpt-4o',
  displayName: 'GPT-4o (Azure)',
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

describe('Azure Adapter', () => {
  describe('model creation', () => {
    it('creates model with correct id and provider', () => {
      const model = createAzureModel({
        name: 'gpt-4o',
        apiKey: 'test-key',
        endpoint: 'https://my-resource.openai.azure.com',
        config: mockConfig,
      })
      expect(model.id).toBe('azure/gpt-4o')
      expect(model.provider).toBe('azure')
      expect(model.name).toBe('gpt-4o')
    })

    it('returns correct capabilities', () => {
      const model = createAzureModel({
        name: 'gpt-4o',
        apiKey: 'test-key',
        endpoint: 'https://my-resource.openai.azure.com',
        config: mockConfig,
      })
      const caps = model.getCapabilities()
      expect(caps.text).toBe(true)
      expect(caps.thinking).toBe(false)
      expect(caps.toolCalls).toBe(true)
      expect(caps.structuredOutput).toBe(true)
      expect(caps.vision).toBe(true)
      expect(caps.contextWindow).toBe(128000)
    })

    it('supportsFeature returns correct values', () => {
      const model = createAzureModel({
        name: 'gpt-4o',
        apiKey: 'test-key',
        endpoint: 'https://my-resource.openai.azure.com',
        config: mockConfig,
      })
      expect(model.supportsFeature('text')).toBe(true)
      expect(model.supportsFeature('thinking')).toBe(false)
      expect(model.supportsFeature('toolCalls')).toBe(true)
      expect(model.supportsFeature('vision')).toBe(true)
      expect(model.supportsFeature('pdf')).toBe(false)
    })

    it('uses custom provider name', () => {
      const model = createAzureModel({
        provider: 'custom-azure',
        name: 'gpt-4o',
        apiKey: 'test-key',
        endpoint: 'https://my-resource.openai.azure.com',
        config: mockConfig,
      })
      expect(model.id).toBe('custom-azure/gpt-4o')
      expect(model.provider).toBe('custom-azure')
    })
  })

  describe('generate', () => {
    it('sends correct request to Azure OpenAI API', async () => {
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
        const model = createAzureModel({
          name: 'gpt-4o',
          apiKey: 'test-key',
          endpoint: 'https://my-resource.openai.azure.com',
          apiVersion: '2024-02-15-preview',
          config: mockConfig,
        })

        const result = await model.generate({
          messages: [{ role: 'user', content: 'Hello' }],
          maxTokens: 100,
        })

        expect(capturedUrl).toContain('my-resource.openai.azure.com')
        expect(capturedUrl).toContain('deployments/gpt-4o')
        expect(capturedUrl).toContain('api-version=2024-02-15-preview')
        expect(capturedBody?.messages).toBeDefined()
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

    it('converts tool calls correctly', async () => {
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
                    id: 'call_1',
                    type: 'function',
                    function: { name: 'read_file', arguments: '{"path":"/test.txt"}' },
                  },
                ],
              },
              finish_reason: 'tool_calls',
              logprobs: null,
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        })

      try {
        const model = createAzureModel({
          name: 'gpt-4o',
          apiKey: 'test-key',
          endpoint: 'https://my-resource.openai.azure.com',
          config: mockConfig,
        })

        const result = await model.generate({
          messages: [{ role: 'user', content: 'read the file' }],
          tools: [
            {
              name: 'read_file',
              description: 'Read a file',
              parameters: { type: 'object', properties: {} },
            },
          ],
          maxTokens: 100,
        })

        expect(result.toolCalls).toHaveLength(1)
        expect(result.toolCalls[0].id).toBe('call_1')
        expect(result.toolCalls[0].name).toBe('read_file')
        expect(result.toolCalls[0].args).toEqual({ path: '/test.txt' })
        expect(result.finishReason).toBe('tool-call')
      } finally {
        globalThis.fetch = origFetch
      }
    })

    it('converts tool results correctly', async () => {
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
        const model = createAzureModel({
          name: 'gpt-4o',
          apiKey: 'test-key',
          endpoint: 'https://my-resource.openai.azure.com',
          config: mockConfig,
        })

        await model.generate({
          messages: [
            { role: 'user', content: 'read the file' },
            {
              role: 'assistant',
              content: '',
              toolCalls: [{ id: 'call_1', name: 'read_file', args: { path: '/test.txt' } }],
            },
            {
              role: 'user',
              content: '',
              toolResults: [{ toolCallId: 'call_1', result: 'file contents' }],
            },
          ],
          tools: [
            {
              name: 'read_file',
              description: 'Read a file',
              parameters: { type: 'object', properties: {} },
            },
          ],
          maxTokens: 100,
        })

        const msgs = capturedBody?.messages as Array<Record<string, unknown>>
        const toolMsg = msgs[2]
        expect(toolMsg.role).toBe('tool')
        expect(toolMsg.content).toBe('file contents')
        expect(toolMsg.tool_call_id).toBe('call_1')
      } finally {
        globalThis.fetch = origFetch
      }
    })

    it('includes system prompt', async () => {
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
        const model = createAzureModel({
          name: 'gpt-4o',
          apiKey: 'test-key',
          endpoint: 'https://my-resource.openai.azure.com',
          config: mockConfig,
        })

        await model.generate({
          messages: [{ role: 'user', content: 'hi' }],
          system: 'You are helpful',
          maxTokens: 100,
        })

        const msgs = capturedBody?.messages as Array<{ role: string; content: string }>
        expect(msgs[0].role).toBe('system')
        expect(msgs[0].content).toBe('You are helpful')
        expect(msgs[1].role).toBe('user')
        expect(msgs[1].content).toBe('hi')
      } finally {
        globalThis.fetch = origFetch
      }
    })

    it('throws on API error', async () => {
      const origFetch = globalThis.fetch
      globalThis.fetch = async () =>
        makeMockResponse({ error: { message: 'Invalid API key' } }, 401)

      try {
        const model = createAzureModel({
          name: 'gpt-4o',
          apiKey: 'bad-key',
          endpoint: 'https://my-resource.openai.azure.com',
          config: mockConfig,
        })

        await expect(
          model.generate({
            messages: [{ role: 'user', content: 'hi' }],
            maxTokens: 100,
          }),
        ).rejects.toThrow('Azure OpenAI error: 401')
      } finally {
        globalThis.fetch = origFetch
      }
    })

    it('sends api-key header', async () => {
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
        const model = createAzureModel({
          name: 'gpt-4o',
          apiKey: 'sk-my-key',
          endpoint: 'https://my-resource.openai.azure.com',
          config: mockConfig,
        })

        await model.generate({
          messages: [{ role: 'user', content: 'hi' }],
          maxTokens: 100,
        })

        expect(capturedHeaders?.get('api-key')).toBe('sk-my-key')
      } finally {
        globalThis.fetch = origFetch
      }
    })

    it('uses custom deployment name', async () => {
      let capturedUrl: string | undefined

      const origFetch = globalThis.fetch
      globalThis.fetch = async (url: string | URL | Request) => {
        if (typeof url === 'string') capturedUrl = url
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
        const model = createAzureModel({
          name: 'gpt-4o',
          apiKey: 'test-key',
          endpoint: 'https://my-resource.openai.azure.com',
          deploymentName: 'my-custom-deployment',
          config: mockConfig,
        })

        await model.generate({
          messages: [{ role: 'user', content: 'hi' }],
          maxTokens: 100,
        })

        expect(capturedUrl).toContain('deployments/my-custom-deployment')
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
            choices: [{ index: 0, delta: {}, finish_reason: 'stop', logprobs: null }],
          },
        ])

      try {
        const model = createAzureModel({
          name: 'gpt-4o',
          apiKey: 'test-key',
          endpoint: 'https://my-resource.openai.azure.com',
          config: mockConfig,
        })

        const chunks: Array<{ type: string; delta?: string }> = []
        for await (const chunk of model.stream({
          messages: [{ role: 'user', content: 'Hello' }],
          maxTokens: 100,
        })) {
          chunks.push(chunk as { type: string; delta?: string })
        }

        const textDeltas = chunks.filter((c) => c.type === 'text-delta')
        expect(textDeltas).toHaveLength(1)
        expect(textDeltas[0].delta).toBe('Hello')

        const finishChunks = chunks.filter((c) => c.type === 'finish')
        expect(finishChunks).toHaveLength(1)
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
        const model = createAzureModel({
          name: 'gpt-4o',
          apiKey: 'test-key',
          endpoint: 'https://my-resource.openai.azure.com',
          config: mockConfig,
        })

        const chunks: Array<{ type: string; toolCall?: { name: string; args: unknown } }> = []
        for await (const chunk of model.stream({
          messages: [{ role: 'user', content: 'list files' }],
          tools: [
            { name: 'bash', description: 'Run', parameters: { type: 'object', properties: {} } },
          ],
          maxTokens: 100,
        })) {
          chunks.push(chunk as { type: string; toolCall?: { name: string; args: unknown } })
        }

        const toolCallChunks = chunks.filter((c) => c.type === 'tool-call')
        expect(toolCallChunks.length).toBeGreaterThanOrEqual(1)
        const lastTc = toolCallChunks[toolCallChunks.length - 1]
        expect(lastTc.toolCall?.name).toBe('bash')
        expect(lastTc.toolCall?.args).toEqual({ command: 'ls' })
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
        const model = createAzureModel({
          name: 'gpt-4o',
          apiKey: 'test-key',
          endpoint: 'https://my-resource.openai.azure.com',
          config: mockConfig,
        })

        const chunks: Array<{
          type: string
          usage?: { input: number; output: number; total: number }
        }> = []
        for await (const chunk of model.stream({
          messages: [{ role: 'user', content: 'hi' }],
          maxTokens: 100,
        })) {
          chunks.push(
            chunk as { type: string; usage?: { input: number; output: number; total: number } },
          )
        }

        const usageChunks = chunks.filter((c) => c.type === 'usage')
        expect(usageChunks).toHaveLength(1)
        expect(usageChunks[0].usage).toEqual({ input: 10, output: 3, total: 13 })
      } finally {
        globalThis.fetch = origFetch
      }
    })
  })
})
