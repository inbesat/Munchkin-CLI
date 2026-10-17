import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ForgeServer } from '@forge/server'
import { ForgeClient } from '../src'
import { SSEParser, parseSSEData } from '../src/sse'

/** In-process transport: drive the Hono app's request method directly. */
class AppSseTransport {
  constructor(private app: ForgeServer['getApp'] extends () => infer A ? () => A : never) {}
  async fetch(url: string, init?: RequestInit): Promise<Response> {
    const u = new URL(url)
    const path = u.pathname + u.search
    return this.app().request(path, init as RequestInit)
  }
}

describe('Multi-client SSE attach (integration)', () => {
  let server: ForgeServer
  let baseDir: string
  let client: ForgeClient

  beforeAll(async () => {
    baseDir = mkdtempSync(join(tmpdir(), 'forge-mc-'))
    server = await (await import('@forge/server')).ForgeServer.create({
      baseDir,
      dbPath: join(baseDir, 'mc.db'),
    })
    const transport = new AppSseTransport(() => server.getApp())
    ;(transport as unknown as { fetch: typeof fetch }).fetch = transport.fetch.bind(transport)
    client = new ForgeClient({
      baseUrl: 'http://test.local',
      fetchImpl: transport.fetch as unknown as typeof fetch,
    })
  })

  afterAll(() => {
    server.close()
    try {
      rmSync(baseDir, { recursive: true, force: true })
    } catch {
      // best-effort
    }
  })

  it('two clients subscribed to the same session both receive the same broadcast', async () => {
    const a: string[] = []
    const b: string[] = []
    const ctrlA = new AbortController()
    const ctrlB = new AbortController()
    // handler form: streamSSE pushes every frame into the handler; nothing to
    // drain because the iterator is never consumed.
    client.sse.stream({
      signal: ctrlA.signal,
      handler: (f) => a.push(`${f.event}:${JSON.stringify(f.data)}`),
    })
    client.sse.stream({
      signal: ctrlB.signal,
      handler: (f) => b.push(`${f.event}:${JSON.stringify(f.data)}`),
    })

    await new Promise((r) => setTimeout(r, 30))
    const connectedA = a.find((s) => s.startsWith('connected'))
    const connectedB = b.find((s) => s.startsWith('connected'))
    expect(connectedA).toBeDefined()
    expect(connectedB).toBeDefined()
    // biome noNonNullAssertion: the two expects above fail the test already
    if (connectedA === undefined || connectedB === undefined) return
    const clientIdA = JSON.parse(connectedA.split(':').slice(1).join(':')).clientId
    const clientIdB = JSON.parse(connectedB.split(':').slice(1).join(':')).clientId

    // Both attach to the same session.
    await client.sse.attach('S-room-1', { clientId: clientIdA })
    await client.sse.attach('S-room-1', { clientId: clientIdB })
    const presence = await client.sse.presence('S-room-1')
    expect(presence.clientCount).toBe(2)
    expect(presence.clientIds.sort()).toEqual([clientIdA, clientIdB].sort())

    // Broadcast a frame and verify both receive it.
    const aBefore = a.length
    const bBefore = b.length
    const out = await client.sse.broadcast({
      sessionId: 'S-room-1',
      event: 'text_delta',
      data: { delta: 'hello' },
    })
    expect(out.delivered).toBe(2)
    expect(out.failed).toBe(0)

    await new Promise((r) => setTimeout(r, 30))
    const newA = a.slice(aBefore).filter((s) => s.startsWith('text_delta:'))
    const newB = b.slice(bBefore).filter((s) => s.startsWith('text_delta:'))
    expect(newA.length).toBeGreaterThanOrEqual(1)
    expect(newB.length).toBeGreaterThanOrEqual(1)
    expect(newA[0]).toContain('hello')
    expect(newB[0]).toContain('hello')

    // Detach B and verify only A receives the next broadcast.
    await client.sse.detach('S-room-1', { clientId: clientIdB })
    expect((await client.sse.presence('S-room-1')).clientCount).toBe(1)
    const aBefore2 = a.length
    const bBefore2 = b.length
    const out2 = await client.sse.broadcast({
      sessionId: 'S-room-1',
      event: 'text_delta',
      data: { delta: 'only-a' },
    })
    expect(out2.delivered).toBe(1)
    await new Promise((r) => setTimeout(r, 30))
    expect(a.slice(aBefore2).filter((s) => s.includes('only-a')).length).toBe(1)
    expect(b.slice(bBefore2).filter((s) => s.includes('only-a')).length).toBe(0)

    ctrlA.abort()
    ctrlB.abort()
  })

  it('replay pushes the session event log to attached clients', async () => {
    const session = await client.sessions.create({ cwd: '/tmp/mc', model: 'auto' })
    const frames: string[] = []
    const ctrl = new AbortController()
    client.sse.stream({
      sessionIds: [session.id],
      signal: ctrl.signal,
      handler: (f) => frames.push(`${f.event}:${JSON.stringify(f.data)}`),
    })
    await new Promise((r) => setTimeout(r, 30))

    const replay = await client.sse.replay({ sessionId: session.id, limit: 10 })
    expect(replay.count).toBeGreaterThan(0)
    expect(replay.nextIndex).toBeGreaterThanOrEqual(replay.count)
    await new Promise((r) => setTimeout(r, 30))
    const history = frames.filter((s) => s.startsWith('history:'))
    expect(history.length).toBe(replay.count)

    // Unknown session → 404
    try {
      await client.sse.replay({ sessionId: 'no-such-session' })
      throw new Error('should have thrown')
    } catch (err) {
      expect((err as { status?: number }).status).toBe(404)
    }

    ctrl.abort()
  })

  it('parsed frames survive end-to-end through the SSE parser', async () => {
    const parser = new SSEParser()
    const frames = parser.push('event: text_delta\ndata: {"delta":"x"}\n\n')
    expect(frames[0]?.event).toBe('text_delta')
    expect(parseSSEData(String(frames[0]?.data))).toEqual({ delta: 'x' })
  })
})
