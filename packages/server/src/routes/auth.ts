import { Hono } from 'hono'
import { Logger, getLogger } from '@forge/core'

const PROVIDER_ENV_KEYS: Record<string, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  google: 'GOOGLE_API_KEY',
  'forge-free': 'FORGE_FREE_API_KEY',
}

/**
 * Auth routes expose provider authentication status. The server never returns
 * secret values — only whether a credential is configured so clients can warn
 * the user before attempting a prompt against an unauthenticated provider.
 */
export function createAuthRoutes(logger?: Logger) {
  const log = logger ?? getLogger()
  const app = new Hono()

  app.get('/', (c) => {
    const providers: Record<string, boolean> = {}
    for (const [provider, envKey] of Object.entries(PROVIDER_ENV_KEYS)) {
      providers[provider] = Boolean(process.env[envKey])
    }

    const authenticated = Object.values(providers).some(Boolean)
    log.debug('Auth status requested', { authenticated })
    return c.json({ authenticated, providers })
  })

  return app
}
