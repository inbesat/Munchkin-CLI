import { randomUUID } from 'node:crypto'
import { AuthFlowError } from './errors'
import { idTokenAccount, postForm } from './http'
import { type ExchangeResult, runBrowserOAuthFlow } from './oauth'
import { refreshAndStore } from './refresh'
import {
  FileTokenVault,
  type OAuthTokens,
  type TokenStore,
  isExpired,
  validateTokens,
} from './tokens'

export interface ClaudeSubscriptionOptions {
  /** Client id of the registered claude.ai OAuth app */
  clientId: string
  /** Default `model.read`+`user.read`; override via config */
  scopes?: readonly string[]
  /** Anthropic's documented claude.ai OAuth authorize endpoint */
  authorizeBaseUrl?: string
  /** Anthropic's documented claude.ai OAuth token endpoint */
  tokenBaseUrl?: string
  loopbackPort?: number
  timeoutMs?: number
  store?: TokenStore
  fetchFn?: typeof fetch
  openBrowserFn?: (url: string) => Promise<void>
  /** Bubbles up the callback redirect URI + state (test hook / UX) */
  onListening?: (redirectUri: string, state: string) => void
}

const DEFAULT_AUTHORIZE = 'https://claude.ai/oauth/authorize'
const DEFAULT_TOKEN = 'https://claude.ai/oauth/token'

interface RawTokenPayload {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  scope?: string
  id_token?: string
}

/**
 * Claude Pro/Max subscription auth via claude.ai's documented OAuth 2.0 flow
 * (authorization-code grant, loopback redirect). This mirrors the flow any
 * third-party OAuth client uses against Anthropic's published OAuth endpoints —
 * it does not inspect any CLI implementation.
 */
export class ClaudeSubscriptionAuth {
  readonly #opts: Required<Pick<ClaudeSubscriptionOptions, 'authorizeBaseUrl' | 'tokenBaseUrl'>> &
    ClaudeSubscriptionOptions
  readonly #store: TokenStore

  constructor(opts: ClaudeSubscriptionOptions) {
    if (!opts.clientId) {
      throw new AuthFlowError('claude', 'invalid_options', 'clientId is required for Claude OAuth')
    }
    this.#opts = {
      authorizeBaseUrl: DEFAULT_AUTHORIZE,
      tokenBaseUrl: DEFAULT_TOKEN,
      ...opts,
    }
    this.#store = opts.store ?? new FileTokenVault()
  }

  tokens(): OAuthTokens | null {
    return this.#store.load('claude')
  }

  async login(): Promise<OAuthTokens> {
    const exchange = async (code: string, redirectUri: string): Promise<unknown> => {
      return postForm('claude', 'invalid_token_response', this.#opts.tokenBaseUrl, {
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: this.#opts.clientId,
      })
    }

    const { tokens } = await runBrowserOAuthFlow({
      provider: 'claude',
      state: randomUUID(),
      authorizeUrl: (redirectUri, state) => {
        const params = new URLSearchParams({
          client_id: this.#opts.clientId,
          redirect_uri: redirectUri,
          response_type: 'code',
          scope: (this.#opts.scopes ?? ['model.read', 'user.read']).join(' '),
          state,
        })
        return `${this.#opts.authorizeBaseUrl}?${params.toString()}`
      },
      exchange,
      parseTokens: (payload) => this.#parseTokenPayload(payload),
      port: this.#opts.loopbackPort,
      timeoutMs: this.#opts.timeoutMs,
      onListening: this.#opts.onListening,
      openBrowserFn: this.#opts.openBrowserFn,
    })

    const saved = this.#storeTokens(tokens)
    return saved
  }

  /** Returns a fresh bearer token, refreshing from the store if expired. */
  async bearer(): Promise<string> {
    const tokens = validateTokens('claude', this.tokens())
    if (isExpired(tokens)) {
      if (!tokens.refreshToken)
        throw new AuthFlowError(
          'claude',
          'token_expired',
          'Claude token expired and no refresh_token is stored',
        )
      await this.refresh()
    }
    return validateTokens('claude', this.tokens()).accessToken
  }

  /** Explicitly refresh and persist the new tokens. */
  async refresh(): Promise<OAuthTokens> {
    const tokens = validateTokens('claude', this.tokens())
    if (!tokens.refreshToken) {
      throw new AuthFlowError(
        'claude',
        'refresh_failed',
        'No refresh_token available for claude.ai',
      )
    }
    const fresh = await refreshAndStore({
      provider: 'claude',
      refreshToken: tokens.refreshToken,
      requestRefresh: (refreshToken) =>
        postForm('claude', 'invalid_token_response', this.#opts.tokenBaseUrl, {
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: this.#opts.clientId,
        }),
      parseTokens: (payload) => this.#parseTokenPayload(payload),
      save: (parsed) => this.#storeTokens(parsed),
    })
    return this.#storeTokens(fresh)
  }

  logout(): void {
    this.#store.clear('claude')
  }

  #parseTokenPayload(payload: unknown): ExchangeResult {
    const raw = payload as RawTokenPayload
    if (typeof raw?.access_token !== 'string' || !raw.access_token) {
      throw new AuthFlowError(
        'claude',
        'invalid_token_response',
        'Claude token response contained no access_token',
      )
    }
    return {
      accessToken: raw.access_token,
      refreshToken: raw.refresh_token,
      expiresAt:
        typeof raw.expires_in === 'number' ? Date.now() + raw.expires_in * 1000 : undefined,
      scopes: raw.scope?.split(' ').filter(Boolean),
      account: idTokenAccount(raw.id_token),
    }
  }

  #storeTokens(parsed: ExchangeResult): OAuthTokens {
    const tokens: OAuthTokens = {
      provider: 'claude',
      ...parsed,
    }
    this.#store.save(tokens)
    return tokens
  }
}
