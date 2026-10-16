import { type Logger, type SessionEvent, getLogger } from '@forge/core'
import { Hono } from 'hono'
import type { SessionManager } from '../services/session-manager'
import { type SSEHub, formatSSE } from '../services/sse-hub'

/**
 * Phase 78: multi-client session attach.
 *
 *   POST /api/sse/sessions/:id/attach   { clientId }   subscribe a stream to a session
 *   POST /api/sse/sessions/:id/detach   { clientId }   drop a session from a stream
 *   GET  /api/sse/sessions/:id/presence                 list clients watching a session
 *   GET  /api/sse/sessions                              list sessions with ≥1 attached client
 *   POST /api/sse/replay             { sessionId, fromIndex? }   push recent events to attached clients
 *
 * The `clientId` is the value sent to the client in the initial `connected` frame
 * on `/api/sse/events`. Clients pass it back to identify which stream to mutate.
 */
export function createSSERoutes(hub: SSEHub, sessionManager?: SessionManager, logger?: Logger) {
  const log = logger ?? getLogger()
  const app = new Hono()

  app.get('/events', async (c) => {
    const sessionIdsParam = c.req.query('sessions') ?? ''
    const sessionIds = sessionIdsParam ? sessionIdsParam.split(',').filter(Boolean) : []
    const clientId = crypto.randomUUID()
    const lastEventId = c.req.header('last-event-id') ?? undefined
    log.info('SSE stream opened', { clientId, sessionIds, lastEventId })

    const stream = new ReadableStream<string>({
      async start(controller) {
        hub.register({
          id: clientId,
          controller,
          sessionIds: new Set(sessionIds),
          connectedAt: Date.now(),
          lastEventId,
        })
        controller.enqueue(
          formatSSE({ event: 'connected', data: JSON.stringify({ clientId, sessionIds }) }),
        )
      },
      cancel() {
        hub.unregister(clientId)
      },
    })

    return new Response(stream.pipeThrough(new TextEncoderStream()), {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    })
  })

  app.post('/broadcast', async (c) => {
    const body = await c.req.json<{
      sessionId?: string
      event: string
      data: unknown
      id?: string
    }>()
    const result = body.id
      ? hub.broadcastSince(body.event, body.data, body.sessionId ?? '', body.id)
      : hub.broadcast(body.event, body.data, body.sessionId)
    log.info('SSE broadcast', {
      event: body.event,
      sessionId: body.sessionId,
      delivered: result.delivered,
      failed: result.failed,
    })
    return c.json(result)
  })

  app.get('/stats', (c) => {
    return c.json(hub.stats())
  })

  // ── Phase 78: session attach / detach / presence ──────────────

  app.post('/sessions/:id/attach', async (c) => {
    const sessionId = c.req.param('id')
    if (!sessionId) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Missing session id' } }, 400)
    }
    const body = (await c.req.json().catch(() => ({}))) as { clientId?: string }
    const clientId = body.clientId
    if (!clientId) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Missing clientId' } }, 400)
    }
    const ok = hub.attach(clientId, sessionId)
    if (!ok) {
      return c.json(
        { error: { code: 'CLIENT_NOT_FOUND', message: 'No active stream with that clientId' } },
        404,
      )
    }
    return c.json({ sessionId, clientId, attached: true })
  })

  app.post('/sessions/:id/detach', async (c) => {
    const sessionId = c.req.param('id')
    if (!sessionId) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Missing session id' } }, 400)
    }
    const body = (await c.req.json().catch(() => ({}))) as { clientId?: string }
    const clientId = body.clientId
    if (!clientId) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Missing clientId' } }, 400)
    }
    const ok = hub.detach(clientId, sessionId)
    if (!ok) {
      return c.json(
        { error: { code: 'CLIENT_NOT_FOUND', message: 'No active stream with that clientId' } },
        404,
      )
    }
    return c.json({ sessionId, clientId, detached: true })
  })

  app.get('/sessions/:id/presence', (c) => {
    const sessionId = c.req.param('id')
    return c.json(hub.presence(sessionId ?? ''))
  })

  app.get('/sessions', (c) => {
    return c.json({ activeSessions: hub.activeSessions() })
  })

  /**
   * Push a slice of a session's event log to every attached client. Used by
   * late-join replay: a client that connects after activity can ask for the
   * last N events and the server fans them out as `event: history` frames.
   *
   * Body: { sessionId, fromIndex?, limit? }
   */
  app.post('/replay', async (c) => {
    if (!sessionManager) {
      return c.json(
        { error: { code: 'NO_SESSION_MANAGER', message: 'Session manager not wired' } },
        503,
      )
    }
    const body = await c.req.json<{ sessionId?: string; fromIndex?: number; limit?: number }>()
    const sessionId = body.sessionId
    if (!sessionId) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Missing sessionId' } }, 400)
    }
    const session = await sessionManager.getSession(sessionId)
    if (!session) {
      return c.json({ error: { code: 'SESSION_NOT_FOUND', message: 'Session not found' } }, 404)
    }

    const fromIndex = Math.max(0, body.fromIndex ?? 0)
    const limit = Math.max(1, Math.min(body.limit ?? 100, 1000))
    const events = await sessionManager.getEvents(sessionId, fromIndex)
    const slice = events.slice(0, limit) as SessionEvent[]

    let delivered = 0
    for (const event of slice) {
      const result = hub.broadcast('history', { sessionId, event }, sessionId)
      delivered += result.delivered
    }
    return c.json({
      sessionId,
      fromIndex,
      delivered,
      count: slice.length,
      nextIndex: fromIndex + slice.length,
    })
  })

  return app
}
