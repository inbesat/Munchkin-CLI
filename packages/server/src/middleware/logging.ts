import { type Logger, getLogger } from '@forge/core'
import type { Context, Next } from 'hono'

function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

export function createLoggingMiddleware(logger?: Logger) {
  const log = logger ?? getLogger()

  return async (c: Context, next: Next) => {
    const requestId = generateRequestId()
    c.set('requestId', requestId)

    const start = Date.now()
    const method = c.req.method
    const path = c.req.path
    const url = c.req.url

    log.debug('Request started', { requestId, method, path, url })

    try {
      await next()
      const duration = Date.now() - start
      const status = c.res.status
      log.info('Request completed', { requestId, method, path, status, durationMs: duration })
    } catch (err) {
      const duration = Date.now() - start
      log.error('Request failed', { requestId, method, path, durationMs: duration, err })
      throw err
    }
  }
}
