import type { SessionMeta } from '@forge/core'
import { Hono } from 'hono'
import { createValidationMiddleware, sessionCreateSchema } from '../middleware/validation'
import type { SessionManager } from '../services/session-manager'
import type { SessionCreateRequest, SessionResponse } from '../types'

export function createSessionsRoutes(sessionManager: SessionManager) {
  const app = new Hono()

  app.post('/', createValidationMiddleware(sessionCreateSchema), async (c) => {
    const data = c.get('validatedData') as SessionCreateRequest
    const session = await sessionManager.createSession(data.cwd, data.model ?? 'auto', data.title)
    return c.json<SessionResponse>(
      {
        id: session.id,
        title: session.title,
        model: session.model,
        cwd: session.cwd,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        endedAt: session.endedAt,
        eventCount: session.eventCount,
        inputTokens: session.inputTokens,
        outputTokens: session.outputTokens,
        totalCost: session.totalCost,
        status: session.endedAt ? 'completed' : 'active',
      },
      201,
    )
  })

  app.get('/', async (c) => {
    const limit = Number(c.req.query('limit') ?? '50')
    const sessions = await sessionManager.listSessions(limit)
    return c.json(sessions.map(toResponse))
  })

  app.get('/search', async (c) => {
    const query = c.req.query('q') ?? ''
    const sessions = await sessionManager.searchSessions(query)
    return c.json(sessions.map(toResponse))
  })

  app.get('/:id', async (c) => {
    const id = c.req.param('id')
    const session = await sessionManager.getSession(id)
    if (!session) {
      return c.json({ error: { code: 'SESSION_NOT_FOUND', message: 'Session not found' } }, 404)
    }
    return c.json(toResponse(session))
  })

  app.get('/:id/events', async (c) => {
    const id = c.req.param('id')
    if (!(await sessionManager.getSession(id))) {
      return c.json({ error: { code: 'SESSION_NOT_FOUND', message: 'Session not found' } }, 404)
    }
    const fromIndex = Number(c.req.query('from') ?? '0')
    const events = await sessionManager.getEvents(id, fromIndex)
    return c.json(events)
  })

  app.delete('/:id', async (c) => {
    const id = c.req.param('id')
    const deleted = await sessionManager.deleteSession(id)
    if (!deleted) {
      return c.json({ error: { code: 'SESSION_NOT_FOUND', message: 'Session not found' } }, 404)
    }
    return c.json({ success: true })
  })

  return app
}

function toResponse(session: SessionMeta): SessionResponse {
  return {
    id: session.id,
    title: session.title,
    model: session.model,
    cwd: session.cwd,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    endedAt: session.endedAt,
    eventCount: session.eventCount,
    inputTokens: session.inputTokens,
    outputTokens: session.outputTokens,
    totalCost: session.totalCost,
    status: session.endedAt ? 'completed' : 'active',
  }
}
