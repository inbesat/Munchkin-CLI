import { afterAll, describe, expect, it } from 'bun:test'
import { McpStreamableHttpTransport } from './http'
import type { MockServerRequest } from './mock-server'
import { ReconnectingMcpClient } from './reconnect'
import { McpSseTransport } from './sse'

describe('SSE / streamable-HTTP transports + auto-reconnect (Phase 118)', () => {
  const servers: ReturnType<typeof Bun.serve>[] = []
  afterAll(() => {
    for (const server of servers) server.stop(true)
  })

  it('SSE transport: endpoint event, request over POST, response via the stream', async () => {
    let broadcast: ((event: string, data: string) => void) | null = null
    const seenNotifications: string[] = []
    const server = Bun.serve({
      port: 0,
      async fetch(request) {
        const url = new URL(request.url)
        if (url.pathname === '/sse') {
          const stream = new ReadableStream({
            start(controller) {
              const encoder = new TextEncoder()
              broadcast = (event, data) => {
                controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`))
              }
              broadcast('endpoint', '/message')
            },
          })
          return new Response(stream, { headers: { 'content-type': 'text/event-stream' } })
        }
        if (url.pathname === '/message' && request.method === 'POST') {
          const message = (await request.json().catch(() => null)) as MockServerRequest | null
          if (message !== null && typeof message.id === 'number') {
            broadcast?.(
              'message',
              JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { tools: ['x'] } }),
            )
            broadcast?.('message', JSON.stringify({ jsonrpc: '2.0', method: 'notifications/test' }))
          }
          return new Response(null, { status: 202 })
        }
        return new Response('not found', { status: 404 })
      },
    })
    const transport = new McpSseTransport({ url: `http://localhost:${server.port}/sse` })
    transport.onNotification((n) => seenNotifications.push(n.method))

    const opened = await transport.open()
    expect(opened.ok).toBe(true)

    const response = await transport.request('tools/list')
    expect(response.ok).toBe(true)
    if (response.ok) expect(response.result).toEqual({ tools: ['x'] })
    expect(seenNotifications).toContain('notifications/test')

    const notified: string[] = []
    const notifiedResult = await transport.notify('notifications/bye')
    expect(notifiedResult.ok).toBe(true)
    transport.close()
    const afterClose = await transport.request('tools/list')
    expect(afterClose.ok).toBe(false)
    void notified
  })

  it('streamable-HTTP transport: direct JSON answers, in-body SSE answers, session header', async () => {
    let lastSession: string | null = null
    const server = Bun.serve({
      port: 0,
      async fetch(request) {
        const url = new URL(request.url)
        if (url.pathname !== '/mcp') return new Response('not found', { status: 404 })
        lastSession = request.headers.get('mcp-session-id')
        const message = (await request.json()) as { id?: number; method?: string }
        if (typeof message.id !== 'number') return new Response(null, { status: 202 })
        if (message.method === 'streaming/call') {
          const stream = new ReadableStream({
            start(controller) {
              const encoder = new TextEncoder()
              controller.enqueue(
                encoder.encode(
                  `event: message\ndata: ${JSON.stringify({
                    jsonrpc: '2.0',
                    id: message.id,
                    result: { via: 'sse-body', sessionSeen: lastSession },
                  })}\n\n`,
                ),
              )
            },
          })
          return new Response(stream, {
            headers: {
              'content-type': 'text/event-stream',
              'mcp-session-id': 'sess-1',
            },
          })
        }
        return new Response(
          JSON.stringify({
            jsonrpc: '2.0',
            id: message.id,
            result: { via: 'json', sessionSeen: lastSession },
          }),
          { headers: { 'content-type': 'application/json', 'mcp-session-id': 'sess-1' } },
        )
      },
    })
    servers.push(server)

    const transport = new McpStreamableHttpTransport({ url: `http://localhost:${server.port}/mcp` })
    expect((await transport.open()).ok).toBe(true)

    const direct = await transport.request('initialize')
    expect(direct.ok).toBe(true)
    if (direct.ok) expect(direct.result).toEqual({ via: 'json', sessionSeen: null })

    const withSse = await transport.request('streaming/call')
    expect(withSse.ok).toBe(true)
    if (withSse.ok) expect(withSse.result).toEqual({ via: 'sse-body', sessionSeen: 'sess-1' })
  })

  it('auto-reconnect: onRestore replays after a drop, retries exhausted surface an error', async () => {
    type FakeClient = { id: number; dead: boolean }
    let nextId = 0
    const restoredFor: number[] = []
    const client = new ReconnectingMcpClient<FakeClient>({
      connect: async () => {
        nextId += 1
        return { id: nextId, dead: false }
      },
      probe: async (candidate) =>
        candidate.dead ? { ok: false, error: 'server down' } : { ok: true },
      onRestore: async (restored) => {
        restoredFor.push(restored.id)
      },
      maxRetries: 3,
      baseBackoffMs: 5,
    })

    const first = await client.get()
    expect(first.ok).toBe(true)
    if (first.ok) expect(first.client.dead).toBe(false)

    // Simulate a disconnect.
    const active = client.client
    if (active !== null) active.dead = true

    const recovered = await client.get()
    expect(recovered.ok).toBe(true)
    if (recovered.ok) {
      expect(recovered.reconnected).toBe(true)
      expect(recovered.client.id).not.toBe(active?.id)
    }
    expect(restoredFor.length).toBe(1)

    // Drop + exhaust the retry budget: factory keeps producing dead clients.
    client.invalidate()
    const hopeless = new ReconnectingMcpClient<FakeClient>({
      connect: async () => ({ id: Math.floor(Math.random() * 1000), dead: true }),
      probe: async (c) => (c.dead ? { ok: false, error: 'server down' } : { ok: true }),
      maxRetries: 2,
      baseBackoffMs: 5,
    })
    const failed = await hopeless.get()
    expect(failed.ok).toBe(false)
    if (!failed.ok) expect(failed.error).toContain('reconnect failed after 2 attempts')
  })
})
