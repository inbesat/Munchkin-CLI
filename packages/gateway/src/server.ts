import { type ServerType, serve } from '@hono/node-server'
import { Hono } from 'hono'
import { type AuthConfig, authMiddleware, resolveAuthConfig } from './auth'
import { type ClientIp, clientIp } from './client-ip'
import { DEFAULT_PORT, VERSION } from './constants'
import { FREE_TIER_PRESETS } from './presets'
import { relayChatCompletion } from './proxy'
import { SqliteQuotaEngine } from './quota'
import { SlidingWindowLimiter } from './ratelimit'
import { PrefixRouter, type UpstreamResolver } from './router'

export interface GatewayLimits {
  /** Per-IP requests allowed per minute (default 60) */
  ipRequestsPerMinute?: number
  /** Daily hard cap on total tokens per quota key (default 1,000,000) */
  dailyTokenCap?: number
  /** Optional daily cost cap in USD */
  dailyCostCapUsd?: number
  /** SQLite path for quota persistence; default in-memory */
  quotaDbPath?: string
}

export interface GatewayOptions {
  router?: UpstreamResolver
  auth?: AuthConfig
  startedAt?: number
  upstreams?: Record<
    string,
    { baseURL: string; apiKey?: string; apiKeyEnv?: string; headers?: Record<string, string> }
  >
  /** Seed the router with the bundled free-tier presets (NVIDIA/Groq/Cerebras/OpenRouter) */
  usePresets?: boolean
  limits?: GatewayLimits
  /** Custom client-address extractor (tests inject a stable IP) */
  ipExtractor?: ClientIp
}

export interface HealthBody {
  status: 'ok'
  version: string
  uptimeSeconds: number
  modes: { auth: string }
}

export interface MetricsBody {
  version: string
  uptimeSeconds: number
  requests: number
  completions: number
  rateLimited: number
  quotaRejected: number
  tokensCharged: number
  killswitches: readonly string[]
}

const QUOTA_KEY_PREFIX = 'ip:'

export function createApp(opts: GatewayOptions = {}): Hono {
  const startedAt = opts.startedAt ?? Date.now()
  const parseIp = opts.ipExtractor ?? clientIp

  let router: UpstreamResolver
  if (opts.router) {
    router = opts.router
  } else if (opts.usePresets) {
    const prefixRouter = new PrefixRouter()
    for (const preset of FREE_TIER_PRESETS) {
      prefixRouter.add(preset.prefix, preset.upstream, {
        models: preset.models,
        modelRewrite: preset.modelRewrite,
      })
    }
    router = prefixRouter
  } else {
    const prefixRouter = new PrefixRouter()
    for (const [prefix, upstream] of Object.entries(opts.upstreams ?? {})) {
      prefixRouter.add(prefix, upstream)
    }
    router = prefixRouter
  }

  const auth = resolveAuthConfig(opts.auth ?? {})
  const limits = opts.limits ?? {}
  const limiter = new SlidingWindowLimiter(60_000, limits.ipRequestsPerMinute ?? 60)
  const quota = new SqliteQuotaEngine({
    dbPath: limits.quotaDbPath,
    dailyTokenCap: limits.dailyTokenCap ?? 1_000_000,
    dailyCostCapUsd: limits.dailyCostCapUsd,
  })

  const metrics = {
    requests: 0,
    completions: 0,
    rateLimited: 0,
    quotaRejected: 0,
    tokensCharged: 0,
  }

  const app = new Hono()

  app.use('/v1/*', authMiddleware({ mode: auth.mode, token: auth.token }))

  app.get('/health', (c) => {
    const body: HealthBody = {
      status: 'ok',
      version: VERSION,
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      modes: { auth: auth.mode },
    }
    return c.json(body)
  })

  app.get('/metrics', (c) => {
    const body: MetricsBody = {
      version: VERSION,
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      requests: metrics.requests,
      completions: metrics.completions,
      rateLimited: metrics.rateLimited,
      quotaRejected: metrics.quotaRejected,
      tokensCharged: metrics.tokensCharged,
      killswitches: quota.list(),
    }
    return c.json(body)
  })

  app.get('/v1/models', (c) => {
    return c.json({
      object: 'list',
      data: router.list().map((id) => ({ id, object: 'model', owned_by: 'forge-gateway' })),
    })
  })

  app.post('/v1/chat/completions', async (c) => {
    metrics.requests++
    const key = `${QUOTA_KEY_PREFIX}${parseIp(c)}`

    const decision = limiter.check(key)
    if (!decision.allowed) {
      metrics.rateLimited++
      c.header('retry-after', String(Math.ceil(decision.retryAfterMs / 1000)))
      return c.json({ error: { message: 'Rate limit exceeded', type: 'rate_limit_error' } }, 429)
    }

    if (quota.isOverQuota(key)) {
      metrics.quotaRejected++
      return c.json({ error: { message: 'Daily quota exceeded', type: 'quota_error' } }, 429)
    }

    const raw = await c.req.text()
    metrics.completions++
    return relayChatCompletion(router, raw, {
      killSwitch: quota,
      onUsage: (usage) => {
        quota.addUsage(key, usage)
        metrics.tokensCharged += usage.tokens
      },
    })
  })

  app.onError((err, c) => {
    console.error('[gateway] error:', err)
    return c.json({ error: { message: 'Internal server error', type: 'server_error' } }, 500)
  })

  return app
}

export interface StartGatewayOptions extends GatewayOptions {
  port?: number
  hostname?: string
}

export function startGateway(opts: StartGatewayOptions = {}): ServerType {
  const app = createApp(opts)
  const port = opts.port ?? (Number(process.env.PORT) || DEFAULT_PORT)
  return serve({ fetch: app.fetch, port, hostname: opts.hostname ?? '0.0.0.0' })
}

export { clientIp } from './client-ip'
export type { ClientIp } from './client-ip'
export { QUOTA_KEY_PREFIX }
