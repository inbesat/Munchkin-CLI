import { buildTrajectory } from '@forge/core'
import { Hono } from 'hono'
import type { SessionManager } from '../services/session-manager'
import { renderTrajectoryNotFound, renderTrajectoryPage } from './page'

/**
 * Phase 144: trajectory browser. `GET /trajectory/:id` renders the session's
 * event log as a step-by-step page (decisions, tool calls, results). Gated by
 * the normal auth middleware, like `/docs`.
 */
export function createTrajectoryRoutes(sessionManager: SessionManager) {
  const app = new Hono()

  app.get('/:id', async (c) => {
    const id = c.req.param('id')
    const session = await sessionManager.getSession(id)
    if (!session) {
      return c.html(renderTrajectoryNotFound(id), 404)
    }
    const events = await sessionManager.getEvents(id)
    return c.html(renderTrajectoryPage(session, buildTrajectory(events)))
  })

  return app
}
