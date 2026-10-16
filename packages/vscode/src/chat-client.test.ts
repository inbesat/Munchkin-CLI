import { describe, expect, it } from 'bun:test'
import type { Session } from '@forge/sdk'
import { ForgeChatSession } from './chat-client'

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

describe('ForgeChatSession (Phase 141)', () => {
  it('creates one server session lazily and reuses it for later prompts', async () => {
    const { fetchImpl, calls } = fakeFetch((call) => {
      if (call.path === '/api/sessions') return json(testSession('s-1'), 201)
      if (call.path === '/api/prompts/s-1') return json(promptOk('s-1', 'pong'))
      return json({ error: { code: 'NOT_FOUND', message: 'nope' } }, 404)
    })
    const chat = new ForgeChatSession({ baseUrl: 'http://127.0.0.1:3000/', cwd: '/tmp', fetchImpl })

    const first = await chat.sendPrompt('hello')
    expect(first).toEqual({ ok: true, sessionId: 's-1', response: 'pong', turns: 1 })

    const second = await chat.sendPrompt('again')
    expect(second.ok).toBe(true)
    expect(chat.currentSessionId).toBe('s-1')
    expect(calls.filter((call) => call.path === '/api/sessions').length).toBe(1)
    expect(calls.filter((call) => call.path === '/api/prompts/s-1').length).toBe(2)
    expect(calls[0]?.body).toEqual({ cwd: '/tmp' })
  })

  it('rejects an empty prompt without touching the network', async () => {
    const { fetchImpl, calls } = fakeFetch(() => json({}, 500))
    const chat = new ForgeChatSession({ baseUrl: 'http://127.0.0.1:3000', cwd: '/tmp', fetchImpl })
    const result = await chat.sendPrompt('   ')
    expect(result).toEqual({ ok: false, error: 'empty prompt' })
    expect(calls.length).toBe(0)
  })

  it('surfaces server errors with status and message', async () => {
    const { fetchImpl } = fakeFetch((call) => {
      if (call.path === '/api/sessions') return json(testSession('s-2'), 201)
      return json({ error: { code: 'AGENT_ERROR', message: 'model exploded' } }, 500)
    })
    const chat = new ForgeChatSession({ baseUrl: 'http://127.0.0.1:3000', cwd: '/tmp', fetchImpl })
    const result = await chat.sendPrompt('boom')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('[500]')
      expect(result.error).toContain('model exploded')
    }
  })

  it('reports an unreachable server without throwing', async () => {
    const fetchImpl = (async () => {
      throw new TypeError('fetch failed')
    }) as typeof fetch
    const chat = new ForgeChatSession({ baseUrl: 'http://127.0.0.1:3000', cwd: '/tmp', fetchImpl })
    const result = await chat.sendPrompt('hello')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('cannot reach forge server')
  })

  it('turns an agent-loop error response into a failure result', async () => {
    const { fetchImpl } = fakeFetch((call) => {
      if (call.path === '/api/sessions') return json(testSession('s-3'), 201)
      return json({ ...promptOk('s-3', ''), reason: 'error', error: 'provider down' })
    })
    const chat = new ForgeChatSession({ baseUrl: 'http://127.0.0.1:3000', cwd: '/tmp', fetchImpl })
    const result = await chat.sendPrompt('hello')
    expect(result).toEqual({ ok: false, error: 'provider down' })
  })

  it('sends the bearer token when configured', async () => {
    const { fetchImpl, calls } = fakeFetch((call) => {
      if (call.path === '/api/sessions') return json(testSession('s-4'), 201)
      return json(promptOk('s-4', 'ok'))
    })
    const chat = new ForgeChatSession({
      baseUrl: 'http://127.0.0.1:3000',
      cwd: '/tmp',
      token: 'secret',
      fetchImpl,
    })
    await chat.sendPrompt('hi')
    expect(calls[0]?.headers.Authorization).toBe('Bearer secret')
  })
})
