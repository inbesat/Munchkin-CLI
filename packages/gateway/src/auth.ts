import type { Context, Next } from 'hono'

export type GatewayAuthMode = 'anonymous' | 'token'

export interface AuthConfig {
  mode?: GatewayAuthMode
  /** Shared bearer token; falls back to `GATEWAY_TOKEN` env */
  token?: string
}

export function resolveAuthConfig(cfg: AuthConfig): {
  mode: GatewayAuthMode
  token: string | undefined
} {
  const mode: GatewayAuthMode =
    cfg.mode ?? (process.env.GATEWAY_MODE as GatewayAuthMode) ?? 'anonymous'
  const token = cfg.token ?? process.env.GATEWAY_TOKEN
  if (mode !== 'anonymous' && mode !== 'token') {
    throw new Error(`Invalid GATEWAY_MODE: ${mode} (expected anonymous|token)`)
  }
  return { mode, token }
}

/**
 * Auth middleware. `anonymous` passes every request through (IP tracking and
 * rate limits are enforced in Phase 31). `token` requires
 * `Authorization: Bearer <token>` and returns 401 otherwise.
 */
export function authMiddleware(cfg: AuthConfig = {}) {
  const resolved = resolveAuthConfig(cfg)
  return async (c: Context, next: Next): Promise<Response | undefined> => {
    if (resolved.mode === 'anonymous') {
      await next()
      return undefined
    }
    if (!resolved.token) {
      return c.json(
        {
          error: { message: 'Gateway token not configured (GATEWAY_TOKEN)', type: 'server_error' },
        },
        500,
      )
    }
    const header = c.req.header('authorization')
    if (header !== `Bearer ${resolved.token}`) {
      return c.json({ error: { message: 'Unauthorized', type: 'authentication_error' } }, 401)
    }
    await next()
    return undefined
  }
}
