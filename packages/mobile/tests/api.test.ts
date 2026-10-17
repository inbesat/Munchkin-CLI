import { describe, expect, it } from 'bun:test'
import type { Session } from '@forge/sdk'
import { ForgeMobileApi } from '../src/api'

interface RecordedCall {
  path: string
  method: string
  body: unknown
  headers: Record<string, string>
}

function fakeFetch(responder: (call: RecordedCall) => Response): {
  fetchImpl: typeof fetch
  calls: RecordedCall[]
} {
  const calls: RecordedCall[] = []
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const target =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    const call: RecordedCall = {
      path: new URL(target).pathname,
      method: init?.method ?? 'GET',
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      headers: (init?.headers ?? {}) as Record<string, string>,
    }
    calls.push(call)
    return responder(call)
  }) as typeof fetch
  return { fetchImpl, calls }
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const health = {
  status: 'ok',
  version: '0.1.0',
  uptime: 10,
  timestamp: 0,
  services: { sessionStore: 'connected', sessionManager: 'ready', agentExecutor: 'ready' },
}

const testSession = (id: string): Session => ({
  id,
  model: 'auto',
  cwd: '/tmp',
  createdAt: 0,
  updatedAt: 0,
  eventCount: 0,
  inputTokens: 0,
  outputTokens: 0,
  totalCost: 0,
  status: 'active',
})

const promptOk = (sessionId: string, response: string) => ({
  sessionId,
  response,
  usage: { input: 1, output: 2, total: 3 },
  turns: 1,
  reason: 'complete' as const,
})

describe('ForgeMobileApi', () => {
  it('connect probes /health and carries the bearer token', async () => {
    const { fetchImpl, calls } = fakeFetch(() => json(health))
    const api = new ForgeMobileApi({ baseUrl: 'http://host:3000/', token: 'key-1', fetchImpl })

    const result = await api.connect()
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.status).toBe('ok')

    expect(calls[0]?.path).toBe('/health')
    expect(calls[0]?.headers.Authorization).toBe('Bearer key-1')
  })

  it('connect reports unreachable servers as {ok:false}', async () => {
    const fetchImpl = (async () => {
      throw new Error('ECONNREFUSED')
    }) as unknown as typeof fetch
    const api = new ForgeMobileApi({ baseUrl: 'http://host:3000', fetchImpl })

    const result = await api.connect()
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('cannot reach forge server')
  })

  it('connect reports timeouts as {ok:false}', async () => {
    // Signal-aware fake: real fetch rejects with the abort reason; this fake
    // mirrors that so the timeout path is exercised deterministically.
    const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const signal = init?.signal
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, 30)
        signal?.addEventListener(
          'abort',
          () => {
            clearTimeout(timer)
            reject(signal.reason ?? new Error('aborted'))
          },
          { once: true },
        )
      })
      return json(health)
    }) as unknown as typeof fetch
    const api = new ForgeMobileApi({
      baseUrl: 'http://host:3000',
      fetchImpl,
      timeoutMs: 5,
    })
    const result = await api.connect()
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('timed out')
  })

  it('listSessions returns the typed array', async () => {
    const { fetchImpl, calls } = fakeFetch(() => json([testSession('s-1')]))
    const api = new ForgeMobileApi({ baseUrl: 'http://host:3000', token: 'k', fetchImpl })

    const result = await api.listSessions()
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value[0]?.id).toBe('s-1')
    expect(calls[0]?.path).toBe('/api/sessions')
  })

  it('sendPrompt creates a session lazily then posts the prompt', async () => {
    const { fetchImpl, calls } = fakeFetch((call) => {
      if (call.method === 'POST' && call.path === '/api/sessions') {
        return json({
          ...testSession('s-new'),
          cwd:
            call.body !== undefined && call.body !== null && typeof call.body === 'object'
              ? (call.body as { cwd?: string }).cwd
              : undefined,
        })
      }
      if (call.method === 'POST' && call.path === '/api/prompts/s-new') {
        return json(promptOk('s-new', 'echoed'))
      }
      return json({ error: { message: 'unexpected route' } }, 404)
    })
    const api = new ForgeMobileApi({ baseUrl: 'http://host:3000', token: 'k', fetchImpl })

    const result = await api.sendPrompt('do a thing', { cwd: '/workspace' })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.response).toBe('echoed')

    expect(calls.length).toBe(2)
    const createBody = calls[0]?.body as { cwd?: string } | undefined
    expect(createBody?.cwd).toBe('/workspace')
  })

  it('sendPrompt reuses a provided sessionId without creating a session', async () => {
    const { fetchImpl, calls } = fakeFetch(() => json(promptOk('s-9', 'ok')))
    const api = new ForgeMobileApi({ baseUrl: 'http://host:3000', fetchImpl })

    const result = await api.sendPrompt('hi', { sessionId: 's-9' })
    expect(result.ok).toBe(true)
    expect(calls.length).toBe(1)
    if (result.ok) expect(result.value.sessionId).toBe('s-9')
  })

  it('sendPrompt surfaces agent-loop errors as {ok:false}', async () => {
    const { fetchImpl } = fakeFetch(() =>
      json({ ...promptOk('s-1', ''), reason: 'error', error: 'no model' }),
    )
    const api = new ForgeMobileApi({ baseUrl: 'http://host:3000', fetchImpl })

    const result = await api.sendPrompt('hi', { sessionId: 's-1' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('no model')
  })

  it('rejects empty prompts without a network call', async () => {
    const fetchImpl = (async () => json({})) as unknown as typeof fetch
    const api = new ForgeMobileApi({ baseUrl: 'http://host:3000', fetchImpl })

    const result = await api.sendPrompt('   ')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('empty prompt')
  })

  it('surfaces server errors with their message', async () => {
    const { fetchImpl } = fakeFetch(() => json({ error: { message: 'unauthorized' } }, 401))
    const api = new ForgeMobileApi({ baseUrl: 'http://host:3000', token: 'bad', fetchImpl })

    const result = await api.listSessions()
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('unauthorized')
  })

  it('listEvents hits the events endpoint with an encoded session id', async () => {
    const { fetchImpl, calls } = fakeFetch(() => json([]))
    const api = new ForgeMobileApi({ baseUrl: 'http://host:3000', fetchImpl })

    const result = await api.listEvents('a/b c')
    expect(result.ok).toBe(true)
    expect(calls[0]?.path).toBe('/api/sessions/a%2Fb%20c/events')
  })
})
