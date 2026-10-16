import type { Context, Next } from 'hono'
import type { AuthKeyMetadata, AuthStore } from '../auth/store'

export interface AuthMiddlewareOptions {
  /** Pre-shared single token (Phase 77 compatibility). When set, any request
   *  carrying this exact token is allowed; AuthStore (if provided) is not
   *  consulted. Use only for boot-time admin tokens.
   */
  legacyToken?: string
  /** AuthStore for per-key validation. Required for full Phase 81 auth. */
  store?: AuthStore
  /** Override the unauthenticated path skip (e.g. in tests). */
  allowAnonymousPaths?: (path: string) => boolean
  /** Called on every successful authentication; useful for logging. */
  onAuth?: (key: AuthKeyMetadata) => void
}

const DEFAULT_ALLOW: Array<[string, string]> = [
  ['GET', '/health'],
  ['GET', '/health/ready'],
]

/**
 * Bearer-token gate (Phase 81).
 *
 * Precedence:
 *  1. If the request targets a default-allow path (`/health`, `/health/ready`)
 *     or a path matched by `allowAnonymousPaths`, pass through.
 *  2. If `legacyToken` is set and the request matches, pass through.
 *  3. Otherwise consult `AuthStore.validate(presented)` and either pass
 *     through with `c.set('authKey', key)` or return 401/429.
 *
 * On `429 Too Many Requests` the response includes a `Retry-After` header
 * so well-behaved clients back off automatically.
 */
export function createAuthMiddleware(options: AuthMiddlewareOptions) {
  const { legacyToken, store, onAuth } = options
  const allowAnonymous = options.allowAnonymousPaths ?? defaultAllow

  return async (c: Context, next: Next) => {
    const method = c.req.method
    const path = c.req.path
    if (allowAnonymous(`${method} ${path}`) || allowAnonymous(path)) {
      await next()
      return
    }

    const header = c.req.header('authorization')
    const presented = parseBearer(header)

    if (legacyToken && presented && isMatch(presented, legacyToken)) {
      await next()
      return
    }

    if (!store) {
      // No AuthStore at all: no auth surface configured, pass through.
      await next()
      return
    }

    // Dev convenience: only when there is no legacy token AND no keys
    // configured, allow anonymous access. Once either is present,
    // anonymous access is disabled.
    const hasKeys = await store.hasKeys()
    if (!hasKeys && !legacyToken && !presented) {
      await next()
      return
    }

    const result = await store.validate(presented)
    if (result.ok) {
      c.set('authKey' as never, result.key as never)
      onAuth?.(result.key)
      await next()
      return
    }

    if (result.reason === 'rate-limited') {
      c.header('Retry-After', '1')
      return c.json(
        {
          error: {
            code: 'RATE_LIMITED',
            message: 'Per-key rate limit exceeded; retry after a moment',
          },
        },
        429,
      )
    }

    const message =
      result.reason === 'missing'
        ? 'Missing bearer token'
        : result.reason === 'malformed'
          ? 'Token is malformed (expected `frg_<env>_<random>`)'
          : result.reason === 'unknown'
            ? 'Token not recognized'
            : 'Token not recognized'
    return c.json({ error: { code: 'UNAUTHORIZED', message } }, 401)
  }
}

function parseBearer(header: string | undefined): string | undefined {
  if (!header) return undefined
  const trimmed = header.trim()
  if (!trimmed.toLowerCase().startsWith('bearer ')) return undefined
  return trimmed.slice('bearer '.length).trim() || undefined
}

function isMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

function defaultAllow(key: string): boolean {
  for (const [m, p] of DEFAULT_ALLOW) {
    if (key === `${m} ${p}` || key === p) return true
  }
  return false
}
