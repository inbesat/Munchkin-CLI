/**
 * Hono routes for the GitHub App (Phase 142). Mounted at `/api/github` by the
 * server when an app is configured; the webhook is signature-verified inside
 * `GitHubApp.handleWebhook`, so the auth middleware exempts this path.
 */

import { Hono } from 'hono'
import type { GitHubApp } from './app'

export function createGitHubRoutes(app: GitHubApp): Hono {
  const routes = new Hono()

  routes.post('/webhook', async (c) => {
    const rawBody = await c.req.text()
    const outcome = await app.handleWebhook({
      eventName: c.req.header('x-github-event') ?? '',
      signature: c.req.header('x-hub-signature-256'),
      rawBody,
    })
    if (outcome.status === 'rejected') {
      return c.json({ error: { code: 'UNAUTHORIZED', message: outcome.reason } }, 401)
    }
    if (outcome.status === 'failed') {
      return c.json({ error: { code: 'REVIEW_FAILED', message: outcome.error } }, 502)
    }
    return c.json(outcome, 202)
  })

  return routes
}
