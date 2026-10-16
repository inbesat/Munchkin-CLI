import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { PrefixRouter } from './router'
import { createApp } from './server'

const UPSTREAM = { baseURL: 'https://upstream.test/v1', apiKey: 'sk-test' }
const originalFetch = globalThis.fetch

function makeApp(overrides: { auth?: { mode: 'token'; token: string } } = {}) {
  const router = new PrefixRouter().add('test', UPSTREAM)
  return createApp({ router, auth: overrides.auth, startedAt: 1750000000000 })
}

function sseDone(): Response {
  const chunks = [
    'data: {"id":"cmpl-1","choices":[{"delta":{"content":"hi"}}]}\n\n',
    'data: [DONE]\n\n',
  ]
  const encoder = new TextEncoder()
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
        controller.close()
      },
    }),
    { status: 200, headers: { 'content-type': 'text/event-stream' } },
  )
}

describe('gateway server', () => {
  describe('GET /health', () => {
    it('returns ok with version and uptime', async () => {
      const app = makeApp()
      const res = await app.request('/health')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.status).toBe('ok')
      expect(body.version).toBe('0.1.0')
      expect(body.modes.auth).toBe('anonymous')
    })
  })

  describe('GET /v1/models', () => {
    it('lists registered prefixes', async () => {
      const app = makeApp()
      const res = await app.request('/v1/models')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.object).toBe('list')
      expect(body.data.map((m: { id: string }) => m.id)).toEqual(['test'])
    })
  })

  describe('POST /v1/chat/completions', () => {
    let captured: { url: string; headers: Record<string, string>; body: string } | null = null

    beforeEach(() => {
      captured = null
      globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
        captured = {
          url: String(input),
          headers: (init?.headers as Record<string, string>) ?? {},
          body: String(init?.body ?? ''),
        }
        return new Response(
          JSON.stringify({
            id: 'cmpl-1',
            object: 'chat.completion',
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: 'relayed' },
                finish_reason: 'stop',
              },
            ],
            usage: { total_tokens: 3 },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      }
    })

    afterEach(() => {
      globalThis.fetch = originalFetch
    })

    it('relays a non-stream completion to the routed upstream', async () => {
      const app = makeApp()
      const res = await app.request('/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'test/model-a',
          messages: [{ role: 'user', content: 'hi' }],
        }),
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.id).toBe('cmpl-1')
      expect(body.choices[0].message.content).toBe('relayed')
      expect(captured?.url).toBe('https://upstream.test/v1/chat/completions')
      expect(captured?.headers.authorization).toBe('Bearer sk-test')
      expect(JSON.parse(captured?.body ?? '{}').model).toBe('test/model-a')
    })

    it('passes streaming SSE through untouched', async () => {
      globalThis.fetch = async () => sseDone()
      const app = makeApp()
      const res = await app.request('/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'test/model-b', stream: true, messages: [] }),
      })
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toContain('text/event-stream')
      const text = await res.text()
      expect(text).toContain('data: {"id":"cmpl-1"')
      expect(text).toContain('data: [DONE]')
    })

    it('rejects a missing model with 400', async () => {
      const app = makeApp()
      const res = await app.request('/v1/chat/completions', {
        method: 'POST',
        body: JSON.stringify({ messages: [] }),
      })
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error.type).toBe('invalid_request_error')
    })

    it('returns 404 for an unknown model', async () => {
      const app = makeApp()
      const res = await app.request('/v1/chat/completions', {
        method: 'POST',
        body: JSON.stringify({ model: 'nope/x', messages: [] }),
      })
      expect(res.status).toBe(404)
    })

    it('returns 502 when the upstream is unreachable', async () => {
      globalThis.fetch = async () => {
        throw new TypeError('fetch failed')
      }
      const app = makeApp()
      const res = await app.request('/v1/chat/completions', {
        method: 'POST',
        body: JSON.stringify({ model: 'test/model-c', messages: [] }),
      })
      expect(res.status).toBe(502)
    })

    it('relays upstream error status and body', async () => {
      globalThis.fetch = async () =>
        new Response(
          JSON.stringify({ error: { message: 'rate limited', type: 'rate_limit_error' } }),
          {
            status: 429,
            headers: { 'content-type': 'application/json' },
          },
        )
      const app = makeApp()
      const res = await app.request('/v1/chat/completions', {
        method: 'POST',
        body: JSON.stringify({ model: 'test/model-d', messages: [] }),
      })
      expect(res.status).toBe(429)
      const body = await res.json()
      expect(body.error.message).toBe('rate limited')
    })
  })

  describe('token auth', () => {
    it('restores global fetch after completion tests', () => {
      expect(globalThis.fetch).toBe(originalFetch)
    })
    it('rejects requests without a bearer token', async () => {
      const app = makeApp({ auth: { mode: 'token', token: 'secret' } })
      const res = await app.request('/v1/models')
      expect(res.status).toBe(401)
    })

    it('rejects a wrong token', async () => {
      const app = makeApp({ auth: { mode: 'token', token: 'secret' } })
      const res = await app.request('/v1/models', { headers: { authorization: 'Bearer wrong' } })
      expect(res.status).toBe(401)
    })

    it('accepts the correct token', async () => {
      const app = makeApp({ auth: { mode: 'token', token: 'secret' } })
      const res = await app.request('/v1/models', { headers: { authorization: 'Bearer secret' } })
      expect(res.status).toBe(200)
    })

    it('leaves /health public in token mode', async () => {
      const app = makeApp({ auth: { mode: 'token', token: 'secret' } })
      const res = await app.request('/health')
      expect(res.status).toBe(200)
    })
  })
})
