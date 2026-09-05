import { describe, expect, it, beforeEach } from 'bun:test'
import { SSEHub } from '../src/services/sse-hub'

/** Build a fake ReadableStreamDefaultController that just buffers enqueued chunks. */
function fakeController(): { controller: ReadableStreamDefaultController<string>; chunks: string[]; enqueue: (s: string) => void } {
  const chunks: string[] = []
  return {
    chunks,
    controller: {
      enqueue: (chunk: string) => chunks.push(chunk),
      close: () => {},
      error: () => {},
      desiredSize: 0,
    } as unknown as ReadableStreamDefaultController<string>,
    enqueue: (s: string) => chunks.push(s),
  }
}

describe('SSEHub (multi-client attach)', () => {
  let hub: SSEHub
  beforeEach(() => {
    hub = new SSEHub()
  })

  it('registers a client and routes broadcasts to it', () => {
    const a = fakeController()
    hub.register({ id: 'a', controller: a.controller, sessionIds: new Set(['s1']), connectedAt: Date.now() })
    const r = hub.broadcast('text_delta', { sessionId: 's1', delta: 'hi' }, 's1')
    expect(r.delivered).toBe(1)
    expect(r.failed).toBe(0)
    expect(a.chunks.length).toBe(1)
    expect(a.chunks[0]).toMatch(/event: text_delta/)
  })

  it('delivers the same broadcast to every client subscribed to the session', () => {
    const a = fakeController()
    const b = fakeController()
    const c = fakeController()
    hub.register({ id: 'a', controller: a.controller, sessionIds: new Set(['s1']), connectedAt: Date.now() })
    hub.register({ id: 'b', controller: b.controller, sessionIds: new Set(['s1']), connectedAt: Date.now() })
    hub.register({ id: 'c', controller: c.controller, sessionIds: new Set(['s2']), connectedAt: Date.now() })

    const r = hub.broadcast('text_delta', { sessionId: 's1', delta: 'hi' }, 's1')
    expect(r.delivered).toBe(2)
    expect(a.chunks.length).toBe(1)
    expect(b.chunks.length).toBe(1)
    expect(c.chunks.length).toBe(0) // not subscribed to s1
  })

  it('attaches a running client to a new session without disconnecting', () => {
    const a = fakeController()
    hub.register({ id: 'a', controller: a.controller, sessionIds: new Set(['s1']), connectedAt: Date.now() })
    expect(hub.attach('a', 's2')).toBe(true)
    expect(hub.presence('s2').clientCount).toBe(1)

    hub.broadcast('text_delta', { delta: 's2' }, 's2')
    hub.broadcast('text_delta', { delta: 's1' }, 's1')
    expect(a.chunks.length).toBe(2)
  })

  it('detach is idempotent and does not leave empty session entries', () => {
    hub.register({ id: 'a', controller: fakeController().controller, sessionIds: new Set(['s1']), connectedAt: Date.now() })
    expect(hub.detach('a', 's1')).toBe(true)
    expect(hub.detach('a', 's1')).toBe(true)
    expect(hub.presence('s1').clientCount).toBe(0)
    expect(hub.activeSessions()).not.toContain('s1')
  })

  it('returns CLIENT_NOT_FOUND-equivalent for unknown clients', () => {
    expect(hub.attach('ghost', 's1')).toBe(false)
    expect(hub.detach('ghost', 's1')).toBe(false)
  })

  it('counts failed enqueues separately from delivered', () => {
    const good = fakeController()
    const broken: ReadableStreamDefaultController<string> = {
      enqueue: () => {
        throw new Error('closed')
      },
      close: () => {},
      error: () => {},
      desiredSize: 0,
    } as unknown as ReadableStreamDefaultController<string>
    hub.register({ id: 'good', controller: good.controller, sessionIds: new Set(['s1']), connectedAt: Date.now() })
    hub.register({ id: 'broken', controller: broken, sessionIds: new Set(['s1']), connectedAt: Date.now() })
    const r = hub.broadcast('text_delta', { sessionId: 's1' }, 's1')
    expect(r.delivered).toBe(1)
    expect(r.failed).toBe(1)
    // broken client is auto-pruned.
    expect(hub.stats().totalClients).toBe(1)
  })

  it('broadcastSince skips clients already past the replay id', () => {
    const a = fakeController()
    const b = fakeController()
    // Use zero-padded ids so the lexicographic comparison matches the numeric one.
    hub.register({ id: 'a', controller: a.controller, sessionIds: new Set(['s1']), connectedAt: Date.now(), lastEventId: 'evt-0010' })
    hub.register({ id: 'b', controller: b.controller, sessionIds: new Set(['s1']), connectedAt: Date.now() /* no last id */ })

    const r = hub.broadcastSince('history', { sessionId: 's1' }, 's1', 'evt-0005')
    // a has seen evt-0010, which is past evt-0005; a should NOT receive.
    expect(r.delivered).toBe(1)
    expect(a.chunks.length).toBe(0)
    expect(b.chunks.length).toBe(1)
  })

  it('tracks presence and active sessions', () => {
    hub.register({ id: 'a', controller: fakeController().controller, sessionIds: new Set(['s1', 's2']), connectedAt: Date.now() })
    hub.register({ id: 'b', controller: fakeController().controller, sessionIds: new Set(['s2']), connectedAt: Date.now() })
    expect(hub.presence('s1').clientCount).toBe(1)
    expect(hub.presence('s2').clientCount).toBe(2)
    expect(hub.activeSessions().sort()).toEqual(['s1', 's2'])
  })

  it('unregister cleans up session index', () => {
    hub.register({ id: 'a', controller: fakeController().controller, sessionIds: new Set(['s1']), connectedAt: Date.now() })
    hub.unregister('a')
    expect(hub.presence('s1').clientCount).toBe(0)
    expect(hub.activeSessions()).toEqual([])
  })
})