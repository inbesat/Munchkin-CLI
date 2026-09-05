import { describe, expect, it } from 'bun:test'
import type { ModelConfig } from '../../model/types'
import { createBedrockModel } from './adapter'

const mockConfig: ModelConfig = {
  id: 'bedrock/anthropic.claude-3-5-sonnet-20241022-v2:0',
  provider: 'bedrock',
  name: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
  displayName: 'Claude 3.5 Sonnet (Bedrock)',
  capabilities: {
    text: true,
    thinking: false,
    toolCalls: true,
    structuredOutput: false,
    vision: true,
    pdf: false,
    maxTokens: 8192,
    contextWindow: 200000,
  },
  cost: { inputPerToken: 0.000003, outputPerToken: 0.000015 },
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

describe('Bedrock Adapter', () => {
  describe('model creation', () => {
    it('creates model with correct id and provider', () => {
      const model = createBedrockModel({
        name: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
        region: 'us-east-1',
        accessKeyId: 'test',
        secretAccessKey: 'test',
        config: mockConfig,
      })
      expect(model.id).toBe('bedrock/anthropic.claude-3-5-sonnet-20241022-v2:0')
      expect(model.provider).toBe('bedrock')
      expect(model.name).toBe('anthropic.claude-3-5-sonnet-20241022-v2:0')
    })

    it('returns correct capabilities', () => {
      const model = createBedrockModel({
        name: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
        region: 'us-east-1',
        config: mockConfig,
      })
      const caps = model.getCapabilities()
      expect(caps.text).toBe(true)
      expect(caps.thinking).toBe(false)
      expect(caps.toolCalls).toBe(true)
      expect(caps.vision).toBe(true)
      expect(caps.contextWindow).toBe(200000)
    })

    it('supportsFeature returns correct values', () => {
      const model = createBedrockModel({
        name: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
        region: 'us-east-1',
        config: mockConfig,
      })
      expect(model.supportsFeature('text')).toBe(true)
      expect(model.supportsFeature('toolCalls')).toBe(true)
      expect(model.supportsFeature('vision')).toBe(true)
      expect(model.supportsFeature('pdf')).toBe(false)
    })

    it('uses custom provider name', () => {
      const model = createBedrockModel({
        provider: 'custom-bedrock',
        name: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
        region: 'us-east-1',
        config: mockConfig,
      })
      expect(model.id).toBe('custom-bedrock/anthropic.claude-3-5-sonnet-20241022-v2:0')
      expect(model.provider).toBe('custom-bedrock')
    })
  })

  describe('generate', () => {
    it('sends correct request to Bedrock API', async () => {
      let capturedUrl: string | undefined
      let capturedBody: Record<string, unknown> | undefined

      const origFetch = globalThis.fetch
      globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
        if (typeof url === 'string') capturedUrl = url
        if (init?.body) capturedBody = JSON.parse(init.body as string)
        return makeMockResponse({
          output: {
            message: {
              role: 'assistant',
              content: [{ text: 'Hello!' }],
            },
          },
          stopReason: 'end_turn',
          usage: { inputTokens: 10, outputTokens: 5 },
        })
      }

      try {
        const model = createBedrockModel({
          name: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
          region: 'us-east-1',
          accessKeyId: 'test',
          secretAccessKey: 'test',
          config: mockConfig,
        })

        const result = await model.generate({
          messages: [{ role: 'user', content: 'Hello' }],
          maxTokens: 100,
        })

        expect(capturedUrl).toContain('bedrock-runtime.us-east-1.amazonaws.com')
        expect(capturedUrl).toContain('anthropic.claude-3-5-sonnet-20241022-v2:0')
        expect(capturedBody?.modelId).toBe('anthropic.claude-3-5-sonnet-20241022-v2:0')
        expect(result.content).toBe('Hello!')
        expect(result.usage.input).toBe(10)
        expect(result.usage.output).toBe(5)
        expect(result.usage.total).toBe(15)
        expect(result.finishReason).toBe('stop')
        expect(result.model).toBe('anthropic.claude-3-5-sonnet-20241022-v2:0')
      } finally {
        globalThis.fetch = origFetch
      }
    })

    it('converts tool calls correctly', async () => {
      let capturedBody: Record<string, unknown> | undefined

      const origFetch = globalThis.fetch
      globalThis.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
        if (init?.body) capturedBody = JSON.parse(init.body as string)
        return makeMockResponse({
          output: {
            message: {
              role: 'assistant',
              content: [
                { text: 'I will read the file.' },
                { toolUse: { id: 'call_1', name: 'read_file', input: { path: '/test.txt' } } },
              ],
            },
          },
          stopReason: 'tool_use',
          usage: { inputTokens: 10, outputTokens: 20 },
        })
      }

      try {
        const model = createBedrockModel({
          name: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
          region: 'us-east-1',
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

        const tools = capturedBody?.tools as Array<Record<string, unknown>>
        expect(tools).toHaveLength(1)
        expect(tools[0].toolSpec).toBeDefined()
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
          output: {
            message: {
              role: 'assistant',
              content: [{ text: 'Done!' }],
            },
          },
          stopReason: 'end_turn',
          usage: { inputTokens: 10, outputTokens: 5 },
        })
      }

      try {
        const model = createBedrockModel({
          name: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
          region: 'us-east-1',
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
        expect(toolMsg.role).toBe('user')
        const content = toolMsg.content as Array<Record<string, unknown>>
        expect(content[0].type).toBe('tool_result')
        expect(content[0].tool_use_id).toBe('call_1')
        expect(content[0].content).toBe('file contents')
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
          output: {
            message: {
              role: 'assistant',
              content: [{ text: 'ok' }],
            },
          },
          stopReason: 'end_turn',
          usage: { inputTokens: 10, outputTokens: 5 },
        })
      }

      try {
        const model = createBedrockModel({
          name: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
          region: 'us-east-1',
          config: mockConfig,
        })

        await model.generate({
          messages: [{ role: 'user', content: 'hi' }],
          system: 'You are helpful',
          maxTokens: 100,
        })

        const system = capturedBody?.system as Array<{ text: string }>
        expect(system).toHaveLength(1)
        expect(system[0].text).toBe('You are helpful')
      } finally {
        globalThis.fetch = origFetch
      }
    })

    it('throws on API error', async () => {
      const origFetch = globalThis.fetch
      globalThis.fetch = async () => makeMockResponse({ message: 'Invalid credentials' }, 403)

      try {
        const model = createBedrockModel({
          name: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
          region: 'us-east-1',
          config: mockConfig,
        })

        await expect(
          model.generate({
            messages: [{ role: 'user', content: 'hi' }],
            maxTokens: 100,
          }),
        ).rejects.toThrow('Bedrock API error: 403')
      } finally {
        globalThis.fetch = origFetch
      }
    })

    it('uses default region us-east-1', async () => {
      let capturedUrl: string | undefined

      const origFetch = globalThis.fetch
      globalThis.fetch = async (url: string | URL | Request) => {
        if (typeof url === 'string') capturedUrl = url
        return makeMockResponse({
          output: { message: { role: 'assistant', content: [{ text: 'ok' }] } },
          stopReason: 'end_turn',
          usage: { inputTokens: 10, outputTokens: 5 },
        })
      }

      try {
        const model = createBedrockModel({
          name: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
          config: mockConfig,
        })

        await model.generate({
          messages: [{ role: 'user', content: 'hi' }],
          maxTokens: 100,
        })

        expect(capturedUrl).toContain('us-east-1')
      } finally {
        globalThis.fetch = origFetch
      }
    })
  })
})
