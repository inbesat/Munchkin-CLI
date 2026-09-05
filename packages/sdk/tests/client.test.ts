import { beforeEach, describe, expect, it } from 'bun:test'
import { ForgeClient } from '../src/client'
import { ForgeApiError, ForgeTransportError } from '../src/errors'
import type { Session } from '../src/types'

type FetchCall = { url: string; init: RequestInit | undefined }

function buildFetch(responses: Array<{ status: number; body: unknown; contentType?: string }>) {
  const calls: FetchCall[] = []
  const fn = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init })
    const r = responses.shift()
    if (!r) throw new Error('No more mock responses')
    const headers: Record<string, string> = {}
    if (r.contentType ?? true) headers['content-type'] = r.contentType ?? 'application/json'
    return new Response(r.body === undefined ? null : JSON.stringify(r.body), {
      status: r.status,
      headers,
    })
  }) as unknown as typeof fetch
  return { fn, calls }
}

describe('ForgeClient', () => {
  let calls: FetchCall[]
  let client: ForgeClient
  let responses: Array<{ status: number; body: unknown; contentType?: string }>

  beforeEach(() => {
    responses = []
    ;({ fn: globalThis.fetch, calls } = buildFetch(responses))
    client = new ForgeClient({ baseUrl: 'http://localhost:3000', fetchImpl: globalThis.fetch })
  })

  it('throws when baseUrl is missing', () => {
    expect(() => new ForgeClient({ baseUrl: '' })).toThrow(ForgeTransportError)
  })

  it('GET /health returns the typed payload', async () => {
    responses.push({
      status: 200,
      body: {
        status: 'ok',
        version: '0.1',
        uptime: 1,
        timestamp: 2,
        services: { sessionStore: 'connected', sessionManager: 'ready', agentExecutor: 'ready' },
      },
    })
    const h = await client.health()
    expect(h.status).toBe('ok')
    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe('http://localhost:3000/health')
    expect(calls[0]?.init?.method).toBe('GET')
  })

  it('strips trailing slashes from baseUrl', async () => {
    const c = new ForgeClient({ baseUrl: 'http://x/', fetchImpl: globalThis.fetch })
    responses.push({
      status: 200,
      body: {
        status: 'ok',
        version: 'v',
        uptime: 0,
        timestamp: 0,
        services: { sessionStore: 's', sessionManager: 'm', agentExecutor: 'a' },
      },
    })
    await c.health()
    expect(calls[0]?.url).toBe('http://x/health')
  })

  it('sends Authorization header when a token is configured', async () => {
    const c = new ForgeClient({ baseUrl: 'http://x', token: 'secret', fetchImpl: globalThis.fetch })
    responses.push({
      status: 200,
      body: {
        status: 'ok',
        version: 'v',
        uptime: 0,
        timestamp: 0,
        services: { sessionStore: 's', sessionManager: 'm', agentExecutor: 'a' },
      },
    })
    await c.health()
    const headers = (calls[0]?.init?.headers ?? {}) as Record<string, string>
    expect(headers.Authorization).toBe('Bearer secret')
  })

  it('encodes session ids in path segments', async () => {
    const session: Session = {
      id: 'abc/123',
      model: 'auto',
      cwd: '/tmp',
      createdAt: 0,
      updatedAt: 0,
      eventCount: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalCost: 0,
      status: 'active',
    }
    responses.push({ status: 200, body: session })
    await client.sessions.get('abc/123')
    expect(calls[0]?.url).toBe('http://localhost:3000/api/sessions/abc%2F123')
  })

  it('POSTs a prompt with JSON body and Content-Type', async () => {
    responses.push({
      status: 200,
      body: {
        sessionId: 's',
        response: 'r',
        usage: { input: 1, output: 2, total: 3 },
        turns: 1,
        reason: 'complete',
      },
    })
    const out = await client.prompts.submit('s', { prompt: 'hi', model: 'auto' })
    expect(out.response).toBe('r')
    const init = calls[0]?.init
    expect(init?.method).toBe('POST')
    expect((init?.headers as Record<string, string>)['Content-Type']).toBe('application/json')
    expect(init?.body).toBe(JSON.stringify({ prompt: 'hi', model: 'auto' }))
  })

  it('converts non-2xx into a ForgeApiError with code+message', async () => {
    responses.push({ status: 404, body: { error: { code: 'SESSION_NOT_FOUND', message: 'nope' } } })
    try {
      await client.sessions.get('missing')
      throw new Error('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(ForgeApiError)
      const e = err as ForgeApiError
      expect(e.status).toBe(404)
      expect(e.code).toBe('SESSION_NOT_FOUND')
      expect(e.message).toContain('nope')
      expect(e.message).toContain('SESSION_NOT_FOUND')
    }
  })

  it('falls back to UNKNOWN_ERROR when the error envelope cannot be parsed', async () => {
    ;(globalThis.fetch as unknown as ReturnType<typeof buildFetch>['fn']) = (async () =>
      new Response('not json', { status: 500 })) as unknown as typeof fetch
    const c = new ForgeClient({ baseUrl: 'http://x', fetchImpl: globalThis.fetch })
    try {
      await c.health()
      throw new Error('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(ForgeApiError)
      expect((err as ForgeApiError).code).toBe('UNKNOWN_ERROR')
    }
  })

  it('wraps network failures as ForgeTransportError', async () => {
    ;(globalThis.fetch as unknown as ReturnType<typeof buildFetch>['fn']) = (async () => {
      throw new TypeError('socket reset')
    }) as unknown as typeof fetch
    const c = new ForgeClient({ baseUrl: 'http://x', fetchImpl: globalThis.fetch })
    try {
      await c.health()
      throw new Error('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(ForgeTransportError)
      expect((err as Error).message).toContain('socket reset')
    }
  })

  it('encodes dotted config keys but preserves dots between segments', async () => {
    responses.push({ status: 200, body: { key: 'model.model', value: 'claude-opus-4' } })
    await client.configConfig.get('model.model')
    expect(calls[0]?.url).toBe('http://localhost:3000/api/config/model.model')
  })

  it('encodes spaces and special chars in config keys', async () => {
    responses.push({ status: 200, body: { key: 'theme.colors.bg', value: '#000' } })
    await client.configConfig.get('theme.colors.bg')
    expect(calls[0]?.url).toBe('http://localhost:3000/api/config/theme.colors.bg')
  })

  it('passes scope through config set', async () => {
    responses.push({ status: 200, body: { key: 'x', value: 1 } })
    await client.configConfig.set({ key: 'x', value: 1, scope: 'global' })
    expect(calls[0]?.url).toContain('scope=global')
  })

  it('omits empty query params (e.g. search with no q)', async () => {
    responses.push({ status: 200, body: [] })
    await client.sessions.search({})
    expect(calls[0]?.url).toBe('http://localhost:3000/api/sessions/search')
  })

  it('lists tools', async () => {
    responses.push({ status: 200, body: [{ name: 'read', description: 'd', parameters: {} }] })
    const tools = await client.tools.list()
    expect(tools).toHaveLength(1)
    expect(tools[0]?.name).toBe('read')
  })

  it('executes a tool', async () => {
    responses.push({ status: 200, body: { result: 'ok', durationMs: 5 } })
    const out = await client.tools.execute({ name: 'read', args: { path: '/x' } })
    expect(out.result).toBe('ok')
  })

  it('returns auth status', async () => {
    responses.push({
      status: 200,
      body: { authenticated: true, providers: { anthropic: true, openai: false } },
    })
    const s = await client.auth.status()
    expect(s.authenticated).toBe(true)
    expect(s.providers.anthropic).toBe(true)
  })

  it('broadcasts an SSE event', async () => {
    responses.push({ status: 200, body: { delivered: 3 } })
    const out = await client.sse.broadcast({
      event: 'agent_done',
      data: { sessionId: 's', reason: 'complete' },
    })
    expect(out.delivered).toBe(3)
    const init = calls[0]?.init
    expect(JSON.parse(init?.body as string)).toEqual({
      event: 'agent_done',
      data: { sessionId: 's', reason: 'complete' },
    })
  })

  it('passes session ids to the SSE stream url', async () => {
    let opened = ''
    ;(globalThis.fetch as unknown as ReturnType<typeof buildFetch>['fn']) = (async (
      url: string | URL,
    ) => {
      opened = String(url)
      return new Response('', { status: 200, headers: { 'content-type': 'text/event-stream' } })
    }) as unknown as typeof fetch
    const c = new ForgeClient({ baseUrl: 'http://x', fetchImpl: globalThis.fetch })
    const iter = c.sse.stream({ sessionIds: ['a', 'b'] })
    await iter.next()
    expect(opened).toContain('sessions=a%2Cb')
  })
})
