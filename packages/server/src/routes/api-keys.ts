import { Hono } from 'hono'
import { z } from 'zod'
import { Logger, getLogger } from '@forge/core'
import { AuthStore, type AuthKeyMetadata, type CreateKeyOptions } from '../auth/store'

const createKeySchema = z.object({
  name: z.string().min(1).max(120),
  env: z.string().min(1).max(32).optional(),
  scopes: z.array(z.string().min(1)).optional(),
  description: z.string().max(500).optional(),
  rateLimit: z.object({
    capacity: z.number().int().positive().max(10_000).optional(),
    refillPerSec: z.number().positive().max(10_000).optional(),
  }).optional(),
})

const idParamSchema = z.object({ id: z.string().min(1).max(64) })

/**
 * Server API key management routes (Phase 81).
 *
 *   GET    /api/auth/keys         list all keys (metadata only, never the hash)
 *   POST   /api/auth/keys         create a new key, returns the secret ONCE
 *   GET    /api/auth/keys/:id     get one key's metadata
 *   DELETE /api/auth/keys/:id     revoke a key
 *   GET    /api/auth/keys/usage   per-key rate-limit token snapshot
 *
 * These routes are mounted under the auth middleware, so creating/revoking
 * keys requires a valid bearer token (the chicken-and-egg case is handled
 * by `legacyToken` in `ServerOptions`).
 */
export function createApiKeyRoutes(store: AuthStore, logger?: Logger) {
  const log = logger ?? getLogger()
  const app = new Hono()

  app.get('/keys', async (c) => {
    const keys = await store.listKeys()
    return c.json({ keys })
  })

  app.post('/keys', async (c) => {
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON body' } }, 400)
    }
    const parsed = createKeySchema.safeParse(body)
    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid key options',
            details: parsed.error.errors,
          },
        },
        400,
      )
    }
    const options: CreateKeyOptions = parsed.data
    const result = await store.createKey(options)
    log.info('auth key created via route', { id: result.metadata.id, name: result.metadata.name })
    return c.json({ key: result.metadata, secret: result.secret }, 201)
  })

  app.get('/keys/usage', (c) => {
    return c.json({ rateLimits: store.rateLimitState() })
  })

  app.get('/keys/:id', async (c) => {
    const parsed = idParamSchema.safeParse(c.req.param())
    if (!parsed.success) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid id' } }, 400)
    }
    const key = await store.getKey(parsed.data.id)
    if (!key) {
      return c.json({ error: { code: 'KEY_NOT_FOUND', message: 'No such key' } }, 404)
    }
    return c.json({ key })
  })

  app.delete('/keys/:id', async (c) => {
    const parsed = idParamSchema.safeParse(c.req.param())
    if (!parsed.success) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid id' } }, 400)
    }
    const ok = await store.revokeKey(parsed.data.id)
    if (!ok) {
      return c.json({ error: { code: 'KEY_NOT_FOUND', message: 'No such key' } }, 404)
    }
    return c.json({ success: true })
  })

  return app
}

/** Re-export for ergonomics in `routes/index.ts`. */
export type { AuthKeyMetadata }
