import { runDeviceFlow } from './device-flow'
import { AuthFlowError } from './errors'
import { postForm } from './http'
import { FileTokenVault, type OAuthTokens, type TokenStore, validateTokens } from './tokens'

export interface CopilotSubscriptionOptions {
  /** Registered GitHub OAuth app client id (device grant) */
  clientId: string
  scopes?: readonly string[]
  store?: TokenStore
  deviceCodeUrl?: string
  tokenUrl?: string
  copilotTokenUrl?: string
  pollIntervalMs?: number
  timeoutMs?: number
  openBrowserFn?: (url: string, userCode: string) => Promise<void>
  fetchFn?: typeof fetch
}

export interface CopilotSession {
  token: string
  /** ISO 8601 expiry returned by the endpoint */
  expiresAt: string
}

const DEFAULT_DEVICE_CODE = 'https://github.com/login/device/code'
const DEFAULT_TOKEN = 'https://github.com/login/oauth/access_token'
const DEFAULT_COPILOT_TOKEN = 'https://api.github.com/copilot_internal/v2/token'
/** Refetch a Copilot session early once it's this close to expiry */
const SESSION_SKEW_MS = 2 * 60_000

interface CachedCopilotSession {
  token: string
  expiresAtMs: number
}

/**
 * GitHub Copilot subscription auth. Uses GitHub's documented device flow to get
 * an OAuth token scoped to the user's Copilot entitlement, then pulls the
 * short-lived Copilot session token via the public `copilot_internal/v2/token`
 * endpoint, which any Copilot-capable GitHub token can call.
 */
export class CopilotAuth {
  readonly #opts: CopilotSubscriptionOptions
  readonly #store: TokenStore
  #session: CachedCopilotSession | null = null

  constructor(opts: CopilotSubscriptionOptions) {
    if (!opts.clientId) {
      throw new AuthFlowError(
        'copilot',
        'invalid_options',
        'clientId is required for GitHub device flow',
      )
    }
    this.#opts = opts
    this.#store = opts.store ?? new FileTokenVault()
  }

  tokens(): OAuthTokens | null {
    return this.#store.load('copilot')
  }

  async login(): Promise<OAuthTokens> {
    const scopes = this.#opts.scopes ?? ['read:user', 'user:email', 'copilot']
    const tokens = await runDeviceFlow({
      provider: 'copilot',
      requestDeviceCode: () =>
        postForm(
          'copilot',
          'invalid_token_response',
          this.#opts.deviceCodeUrl ?? DEFAULT_DEVICE_CODE,
          {
            client_id: this.#opts.clientId,
            scope: scopes.join(' '),
          },
        ),
      requestToken: (deviceCode) =>
        postForm('copilot', 'invalid_token_response', this.#opts.tokenUrl ?? DEFAULT_TOKEN, {
          client_id: this.#opts.clientId,
          device_code: deviceCode,
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        }),
      pollIntervalMs: this.#opts.pollIntervalMs,
      timeoutMs: this.#opts.timeoutMs,
      openBrowserFn: this.#opts.openBrowserFn,
    })

    const saved: OAuthTokens = {
      provider: 'copilot',
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      scopes: tokens.scopes,
    }
    this.#store.save(saved)
    return saved
  }

  /** GitHub user token — the gateway for every Copilot call. */
  async bearer(): Promise<string> {
    return validateTokens('copilot', this.tokens()).accessToken
  }

  /**
   * Fetches a fresh, short-lived Copilot session token (the bearer used for
   * chat/completions). Cached in memory until within ~2 minutes of expiry.
   */
  async sessionToken(force?: boolean): Promise<string> {
    if (!force && this.#session && this.#session.expiresAtMs > Date.now() + SESSION_SKEW_MS) {
      return this.#session.token
    }
    const saved = validateTokens('copilot', this.tokens())
    const fetchFn = this.#opts.fetchFn ?? fetch
    const url = this.#opts.copilotTokenUrl ?? DEFAULT_COPILOT_TOKEN
    const resp = await fetchFn(url, {
      method: 'GET',
      headers: { authorization: `Bearer ${saved.accessToken}`, accept: 'application/json' },
    })
    const text = await resp.text()
    if (!resp.ok) {
      throw new AuthFlowError(
        'copilot',
        'refresh_failed',
        `Copilot session endpoint HTTP ${resp.status}: ${text.slice(0, 200)}`,
      )
    }
    let json: unknown
    try {
      json = JSON.parse(text)
    } catch {
      throw new AuthFlowError(
        'copilot',
        'invalid_token_response',
        'Copilot session endpoint returned non-JSON',
      )
    }
    const session = parseCopilotSession(json)
    const expiresAtMs = Date.parse(session.expiresAt)
    if (Number.isNaN(expiresAtMs)) {
      throw new AuthFlowError(
        'copilot',
        'invalid_token_response',
        'Copilot session payload had an unparseable expires_at',
      )
    }
    this.#session = { token: session.token, expiresAtMs }
    return session.token
  }

  /** Drop cached/token state, keep GitHub tokens. */
  clearSession(): void {
    this.#session = null
  }

  logout(): void {
    this.#session = null
    this.#store.clear('copilot')
  }
}

export function parseCopilotSession(payload: unknown): CopilotSession {
  const body = payload as { token?: unknown; expires_at?: unknown } | null
  if (typeof body?.token !== 'string' || typeof body?.expires_at !== 'string') {
    throw new AuthFlowError(
      'copilot',
      'invalid_token_response',
      'Copilot session endpoint returned a malformed payload',
    )
  }
  return { token: body.token, expiresAt: body.expires_at }
}
