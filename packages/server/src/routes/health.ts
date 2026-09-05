import { Hono } from 'hono'
import { VERSION } from '@forge/core'
import { SessionStore } from '@forge/core'
import { AgentExecutor } from '../services/agent-executor'
import { SessionManager } from '../services/session-manager'

interface HealthDependencies {
  sessionStore?: SessionStore
  sessionManager?: SessionManager
  agentExecutor?: AgentExecutor
}

export function createHealthRoutes(deps: HealthDependencies = {}) {
  const app = new Hono()
  const startTime = Date.now()

  app.get('/', (c) => {
    return c.json({
      status: 'ok',
      version: VERSION,
      uptime: Date.now() - startTime,
      timestamp: Date.now(),
      services: {
        sessionStore: deps.sessionStore ? 'connected' : 'not configured',
        sessionManager: deps.sessionManager ? 'ready' : 'not configured',
        agentExecutor: deps.agentExecutor ? 'ready' : 'not configured',
      },
    })
  })

  app.get('/ready', async (c) => {
    const checks: Record<string, boolean> = {}

    if (deps.sessionStore) {
      try {
        deps.sessionStore.listSessions()
        checks.sessionStore = true
      } catch {
        checks.sessionStore = false
      }
    }

    const allHealthy = Object.values(checks).every((v) => v)
    return c.json({ ready: allHealthy, checks }, allHealthy ? 200 : 503)
  })

  return app
}