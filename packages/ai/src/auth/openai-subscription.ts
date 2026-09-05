import { runDeviceFlow } from './device-flow'
import { AuthFlowError } from './errors'
import { postForm } from './http'
import { refreshAndStore } from './refresh'
import {
  FileTokenVault,
  type OAuthTokens,
  type TokenStore,
  isExpired,
  validateTokens,
} from './tokens'

export interface ChatGptSubscriptionOptions {
  /** Registered OpenAI OAuth app client id (device grant) */
  clientId: string
  /** Audience for the token grant (default the chat API) */
  audience?: string
  scopes?: readonly string[]
  store?: TokenStore
  deviceCodeUrl?: string
  tokenUrl?: string
  pollIntervalMs?: number
  timeoutMs?: number
  openBrowserFn?: (url: string, userCode: string) => Promise<void>
  fetchFn?: typeof fetch
}

const DEFAULT_DEVICE_CODE = 'https://auth.openai.com/device/code'
const DEFAULT_TOKEN = 'https://auth.openai.com/device/token'
const DEFAULT_AUDIENCE = 'https://api.openai.com/v1'

interface RawTokenPayload {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  scope?: string
}

/**
 * ChatGPT Plus/Pro subscription auth via OpenAI's documented device flow on
 * auth.openai.com. The resulting access token unlocks the subscription-backed
 * chat endpoints when presented with the partner `X-OpenAI-Source` header
 * downstream (wiring that header lives in the provider layer).
 */
export class ChatGptSubscriptionAuth {
  readonly #opts: ChatGptSubscriptionOptions
  readonly #store: TokenStore

  constructor(opts: ChatGptSubscriptionOptions) {
    if (!opts.clientId) {
      throw new AuthFlowError(
        'chatgpt',
        'invalid_options',
        'clientId is required for OpenAI device flow',
      )
    }
    this.#opts = opts
    this.#store = opts.store ?? new FileTokenVault()
  }

  tokens(): OAuthTokens | null {
    return this.#store.load('chatgpt')
  }

  async login(): Promise<OAuthTokens> {
    const audience = this.#opts.audience ?? DEFAULT_AUDIENCE
    const tokens = await runDeviceFlow({
      provider: 'chatgpt',
      requestDeviceCode: () =>
        postForm(
          'chatgpt',
          'invalid_token_response',
          this.#opts.deviceCodeUrl ?? DEFAULT_DEVICE_CODE,
          {
            client_id: this.#opts.clientId,
            audience,
            scope: (this.#opts.scopes ?? ['model.request', 'all-models', 'openid']).join(' '),
          },
        ),
      requestToken: (deviceCode) =>
        postForm('chatgpt', 'invalid_token_response', this.#opts.tokenUrl ?? DEFAULT_TOKEN, {
          client_id: this.#opts.clientId,
          device_code: deviceCode,
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        }),
      pollIntervalMs: this.#opts.pollIntervalMs,
      timeoutMs: this.#opts.timeoutMs,
      openBrowserFn: this.#opts.openBrowserFn,
    })

    const saved: OAuthTokens = {
      provider: 'chatgpt',
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      scopes: tokens.scopes,
    }
    this.#store.save(saved)
    return saved
  }

  /** Fresh access token, refreshing from the store when near expiry. */
  async bearer(): Promise<string> {
    const tokens = validateTokens('chatgpt', this.tokens())
    if (isExpired(tokens)) {
      if (!tokens.refreshToken) {
        throw new AuthFlowError(
          'chatgpt',
          'token_expired',
          'ChatGPT token expired and no refresh_token is stored',
        )
      }
      await this.refresh()
    }
    return validateTokens('chatgpt', this.tokens()).accessToken
  }

  async refresh(): Promise<OAuthTokens> {
    const tokens = validateTokens('chatgpt', this.tokens())
    if (!tokens.refreshToken) {
      throw new AuthFlowError('chatgpt', 'refresh_failed', 'No refresh_token available for ChatGPT')
    }
    const fresh = await refreshAndStore({
      provider: 'chatgpt',
      refreshToken: tokens.refreshToken,
      requestRefresh: (refreshToken) =>
        postForm('chatgpt', 'invalid_token_response', this.#opts.tokenUrl ?? DEFAULT_TOKEN, {
          client_id: this.#opts.clientId,
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
          audience: this.#opts.audience ?? DEFAULT_AUDIENCE,
        }),
      parseTokens: (payload) => {
        const raw = payload as RawTokenPayload
        if (typeof raw?.access_token !== 'string' || !raw.access_token) {
          throw new AuthFlowError(
            'chatgpt',
            'invalid_token_response',
            'ChatGPT token response contained no access_token',
          )
        }
        return {
          accessToken: raw.access_token,
          refreshToken: raw.refresh_token,
          expiresAt:
            typeof raw.expires_in === 'number' ? Date.now() + raw.expires_in * 1000 : undefined,
          scopes: raw.scope?.split(' ').filter(Boolean),
        }
      },
      save: (parsed) => this.#store.save(parsed),
    })
    return { provider: 'chatgpt', ...fresh }
  }

  logout(): void {
    this.#store.clear('chatgpt')
  }
}

export type { RawTokenPayload }
