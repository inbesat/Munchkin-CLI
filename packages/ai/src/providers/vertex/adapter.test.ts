import { describe, expect, it } from 'bun:test'
import type { ModelConfig } from '../../model/types'
import { createVertexModel } from './adapter'

const mockConfig: ModelConfig = {
  id: 'vertex/gemini-2.0-flash',
  provider: 'vertex',
  name: 'gemini-2.0-flash',
  displayName: 'Gemini 2.0 Flash (Vertex)',
  capabilities: {
    text: true,
    thinking: false,
    toolCalls: true,
    structuredOutput: false,
    vision: true,
    pdf: false,
    maxTokens: 8192,
    contextWindow: 1000000,
  },
  cost: { inputPerToken: 0.0000001, outputPerToken: 0.0000004 },
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

describe('Vertex Adapter', () => {
  describe('model creation', () => {
    it('creates model with correct id and provider', () => {
      const model = createVertexModel({
        name: 'gemini-2.0-flash',
        projectId: 'my-project',
        location: 'us-central1',
        accessToken: 'test-token',
        config: mockConfig,
      })
      expect(model.id).toBe('vertex/gemini-2.0-flash')
      expect(model.provider).toBe('vertex')
      expect(model.name).toBe('gemini-2.0-flash')
    })

    it('returns correct capabilities', () => {
      const model = createVertexModel({
        name: 'gemini-2.0-flash',
        projectId: 'my-project',
        config: mockConfig,
      })
      const caps = model.getCapabilities()
      expect(caps.text).toBe(true)
      expect(caps.thinking).toBe(false)
      expect(caps.toolCalls).toBe(true)
      expect(caps.vision).toBe(true)
      expect(caps.contextWindow).toBe(1000000)
    })

    it('supportsFeature returns correct values', () => {
      const model = createVertexModel({
        name: 'gemini-2.0-flash',
        projectId: 'my-project',
        config: mockConfig,
      })
      expect(model.supportsFeature('text')).toBe(true)
      expect(model.supportsFeature('toolCalls')).toBe(true)
      expect(model.supportsFeature('vision')).toBe(true)
      expect(model.supportsFeature('pdf')).toBe(false)
    })
  })

  describe('generate', () => {
    it('sends correct request to Vertex AI API', async () => {
      let capturedUrl: string | undefined
      let capturedBody: Record<string, unknown> | undefined

      const origFetch = globalThis.fetch
      globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
        if (typeof url === 'string') capturedUrl = url
        if (init?.body) capturedBody = JSON.parse(init.body as string)
        return makeMockResponse({
          candidates: [
            {
              content: {
                role: 'model',
                parts: [{ text: 'Hello!' }],
              },
              finishReason: 'STOP',
            },
          ],
          usageMetadata: {
            promptTokenCount: 10,
            candidatesTokenCount: 5,
            totalTokenCount: 15,
          },
        })
      }

      try {
        const model = createVertexModel({
          name: 'gemini-2.0-flash',
          projectId: 'my-project',
          location: 'us-central1',
          accessToken: 'test-token',
          config: mockConfig,
        })

        const result = await model.generate({
          messages: [{ role: 'user', content: 'Hello' }],
          maxTokens: 100,
        })

        expect(capturedUrl).toContain('us-central1-aiplatform.googleapis.com')
        expect(capturedUrl).toContain('projects/my-project')
        expect(capturedUrl).toContain('publishers/google/models/gemini-2.0-flash')
        expect(capturedBody?.contents).toBeDefined()
        expect(result.content).toBe('Hello!')
        expect(result.usage.input).toBe(10)
        expect(result.usage.output).toBe(5)
        expect(result.usage.total).toBe(15)
        expect(result.finishReason).toBe('stop')
        expect(result.model).toBe('gemini-2.0-flash')
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
          candidates: [
            {
              content: {
                role: 'model',
                parts: [
                  { text: 'I will read the file.' },
                  { functionCall: { name: 'read_file', args: { path: '/test.txt' } } },
                ],
              },
              finishReason: 'STOP',
            },
          ],
          usageMetadata: {
            promptTokenCount: 10,
            candidatesTokenCount: 20,
            totalTokenCount: 30,
          },
        })
      }

      try {
        const model = createVertexModel({
          name: 'gemini-2.0-flash',
          projectId: 'my-project',
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
        expect(result.toolCalls[0].name).toBe('read_file')
        expect(result.toolCalls[0].args).toEqual({ path: '/test.txt' })
        expect(result.finishReason).toBe('stop')

        const tools = capturedBody?.tools as Array<Record<string, unknown>>
        expect(tools).toHaveLength(1)
        expect(tools[0].functionDeclarations).toBeDefined()
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
          candidates: [
            {
              content: {
                role: 'model',
                parts: [{ text: 'Done!' }],
              },
              finishReason: 'STOP',
            },
          ],
          usageMetadata: {
            promptTokenCount: 10,
            candidatesTokenCount: 5,
            totalTokenCount: 15,
          },
        })
      }

      try {
        const model = createVertexModel({
          name: 'gemini-2.0-flash',
          projectId: 'my-project',
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

        const contents = capturedBody?.contents as Array<Record<string, unknown>>
        const toolMsg = contents[2]
        expect(toolMsg.role).toBe('user')
        const parts = toolMsg.parts as Array<Record<string, unknown>>
        expect(parts[0].functionResponse).toBeDefined()
        const funcResponse = parts[0].functionResponse as Record<string, unknown>
        expect(funcResponse.name).toBe('call_1')
      } finally {
        globalThis.fetch = origFetch
      }
    })

    it('includes system instruction', async () => {
      let capturedBody: Record<string, unknown> | undefined

      const origFetch = globalThis.fetch
      globalThis.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
        if (init?.body) capturedBody = JSON.parse(init.body as string)
        return makeMockResponse({
          candidates: [
            {
              content: {
                role: 'model',
                parts: [{ text: 'ok' }],
              },
              finishReason: 'STOP',
            },
          ],
          usageMetadata: {
            promptTokenCount: 10,
            candidatesTokenCount: 5,
            totalTokenCount: 15,
          },
        })
      }

      try {
        const model = createVertexModel({
          name: 'gemini-2.0-flash',
          projectId: 'my-project',
          config: mockConfig,
        })

        await model.generate({
          messages: [{ role: 'user', content: 'hi' }],
          system: 'You are helpful',
          maxTokens: 100,
        })

        const systemInstruction = capturedBody?.systemInstruction as Record<string, unknown>
        expect(systemInstruction).toBeDefined()
        const parts = systemInstruction.parts as Array<{ text: string }>
        expect(parts[0].text).toBe('You are helpful')
      } finally {
        globalThis.fetch = origFetch
      }
    })

    it('throws on API error', async () => {
      const origFetch = globalThis.fetch
      globalThis.fetch = async () =>
        makeMockResponse({ error: { message: 'Permission denied' } }, 403)

      try {
        const model = createVertexModel({
          name: 'gemini-2.0-flash',
          projectId: 'my-project',
          config: mockConfig,
        })

        await expect(
          model.generate({
            messages: [{ role: 'user', content: 'hi' }],
            maxTokens: 100,
          }),
        ).rejects.toThrow('Vertex AI error: 403')
      } finally {
        globalThis.fetch = origFetch
      }
    })

    it('uses default location us-central1', async () => {
      let capturedUrl: string | undefined

      const origFetch = globalThis.fetch
      globalThis.fetch = async (url: string | URL | Request) => {
        if (typeof url === 'string') capturedUrl = url
        return makeMockResponse({
          candidates: [
            {
              content: { role: 'model', parts: [{ text: 'ok' }] },
              finishReason: 'STOP',
            },
          ],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
        })
      }

      try {
        const model = createVertexModel({
          name: 'gemini-2.0-flash',
          projectId: 'my-project',
          config: mockConfig,
        })

        await model.generate({
          messages: [{ role: 'user', content: 'hi' }],
          maxTokens: 100,
        })

        expect(capturedUrl).toContain('us-central1')
      } finally {
        globalThis.fetch = origFetch
      }
    })
  })
})
