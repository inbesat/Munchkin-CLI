import { AuthFlowError, type AuthProviderName } from './errors'

export interface ParsedTokens {
  accessToken: string
  refreshToken?: string
  expiresAt?: number
  scopes?: string[]
  account?: string
}

export interface RefreshOptions {
  provider: AuthProviderName
  refreshToken: string
  /** POSTs grant_type=refresh_token and returns the raw payload */
  requestRefresh: (refreshToken: string) => Promise<unknown>
  /** Turns the raw payload into the token shape */
  parseTokens: (payload: unknown) => ParsedTokens
}

/**
 * Runs a single refresh, deduped so concurrent callers sharing one refresh
 * token hit the upstream once instead of stampeding it. Providers that rotate
 * refresh tokens invalidate the superseded one — a parallel duplicate token
 * POST can race and break the fresh token, so the dedupe is load-bearing.
 */
const inFlight = new Map<string, Promise<ParsedTokens>>()

export async function refreshTokens(opts: RefreshOptions): Promise<ParsedTokens> {
  const dedupKey = opts.refreshToken
  const running = inFlight.get(dedupKey)
  if (running) return running

  const attempt = (async () => {
    try {
      const payload = await opts.requestRefresh(opts.refreshToken)
      return opts.parseTokens(payload)
    } catch (cause) {
      throw new AuthFlowError(
        opts.provider,
        'refresh_failed',
        `Token refresh failed for ${opts.provider}`,
        { cause },
      )
    } finally {
      inFlight.delete(dedupKey)
    }
  })()

  inFlight.set(dedupKey, attempt)
  return attempt
}

/** Refresh, then persist the fresh tokens back into a TokenStore-compatible sink. */
export async function refreshAndStore(
  opts: RefreshOptions & { save: (tokens: ParsedTokens & { provider: AuthProviderName }) => void },
): Promise<ParsedTokens> {
  const fresh = await refreshTokens(opts)
  opts.save({ provider: opts.provider, ...fresh })
  return fresh
}
