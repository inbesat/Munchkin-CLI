/**
 * OAuth for remote MCP servers (Phase 119): RFC 6749 authorization-code
 * flow with RFC 7636 PKCE (S256), RFC 8414 metadata discovery, a local
 * loopback callback server for the browser rendezvous, a file-backed
 * token store, and refresh handling. All steps return result objects.
 */

import { createHash, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export interface OAuthTokenSet {
  access_token: string
  refresh_token?: string
  token_type?: string
  scope?: string
  obtainedAt: number
  /** Absolute epoch ms; derived from `expires_in` at save time. */
  expiresAt?: number
}

export interface TokenStoreOptions {
  /** Where `mcp-tokens.json` lives (default ~/.forge). */
  directory?: string
}

export class TokenStore {
  private readonly directory: string

  constructor(options: TokenStoreOptions = {}) {
    this.directory = options.directory ?? join(homedir(), '.forge')
  }

  private get filePath(): string {
    return join(this.directory, 'mcp-tokens.json')
  }

  private readAll(): Record<string, OAuthTokenSet> {
    if (!existsSync(this.filePath)) return {}
    try {
      const parsed = JSON.parse(readFileSync(this.filePath, 'utf-8')) as Record<
        string,
        OAuthTokenSet
      >
      return parsed !== null && typeof parsed === 'object' ? parsed : {}
    } catch {
      return {}
    }
  }

  get(serverKey: string): OAuthTokenSet | undefined {
    return this.readAll()[serverKey]
  }

  save(
    serverKey: string,
    token: Omit<OAuthTokenSet, 'obtainedAt' | 'expiresAt'> & { expires_in?: number },
  ): OAuthTokenSet {
    const stored: OAuthTokenSet = {
      ...token,
      obtainedAt: Date.now(),
      ...(token.expires_in !== undefined
        ? { expiresAt: Date.now() + token.expires_in * 1000 }
        : {}),
    }
    mkdirSync(this.directory, { recursive: true })
    const all = this.readAll()
    all[serverKey] = stored
    writeFileSync(this.filePath, JSON.stringify(all, null, 2), 'utf-8')
    return stored
  }

  clear(serverKey: string): boolean {
    const all = this.readAll()
    if (all[serverKey] === undefined) return false
    delete all[serverKey]
    mkdirSync(this.directory, { recursive: true })
    writeFileSync(this.filePath, JSON.stringify(all, null, 2), 'utf-8')
    return true
  }
}

function isExpired(token: OAuthTokenSet): boolean {
  return token.expiresAt !== undefined && Date.now() >= token.expiresAt
}

/** PKCE S256 pair (RFC 7636). */
export function buildPkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  return { verifier, challenge }
}

export interface OAuthEndpoints {
  authorizationUrl: string
  tokenUrl: string
}

export interface AuthorizeOptions extends OAuthEndpoints {
  clientId: string
  clientSecret?: string
  scope?: string
  /** Override the loopback redirect (supports a `{port}` placeholder). */
  redirectUri?: string
  /** How long to wait for the browser callback (default 5 min). */
  callbackTimeoutMs?: number
  /** Browser opener (injectable; default prints the URL). */
  openBrowser?: (url: string) => void
}

export type AuthorizeResult = { ok: true; token: OAuthTokenSet } | { ok: false; error: string }

interface CallbackServer {
  port: number
  waitForCode: () => Promise<
    { ok: true; code: string; state: string } | { ok: false; error: string }
  >
  close: () => void
}

/** Local loopback listener for the OAuth redirect. */
function startCallbackServer(timeoutMs: number): CallbackServer {
  let resolveWait: (
    r: { ok: true; code: string; state: string } | { ok: false; error: string },
  ) => void
  const waitForCode = new Promise<
    { ok: true; code: string; state: string } | { ok: false; error: string }
  >((resolve) => {
    resolveWait = resolve
  })
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      const url = new URL(request.url)
      const code = url.searchParams.get('code')
      if (code === null) {
        return new Response('forge: waiting for OAuth code', { status: 200 })
      }
      resolveWait({
        ok: true,
        code,
        state: url.searchParams.get('state') ?? '',
      })
      return new Response('forge: authorization received, you can close this tab.', { status: 200 })
    },
  })
  const timer = setTimeout(() => {
    resolveWait({
      ok: false,
      error: `timed out waiting for the OAuth callback after ${timeoutMs}ms`,
    })
  }, timeoutMs)
  return {
    port: server.port as number,
    waitForCode: () => waitForCode,
    close: () => {
      clearTimeout(timer)
      server.stop(true)
    },
  }
}

/** Discover the server's OAuth endpoints via RFC 8414 metadata (optional helper). */
export async function fetchOAuthMetadata(
  serverUrl: string,
): Promise<{ ok: true; endpoints: OAuthEndpoints } | { ok: false; error: string }> {
  const base = new URL(serverUrl)
  const candidates =
    base.pathname.length > 1
      ? [
          `${base.origin}/.well-known/oauth-authorization-server${base.pathname}`,
          `${base.origin}/.well-known/oauth-authorization-server`,
        ]
      : [`${base.origin}/.well-known/oauth-authorization-server`]

  let lastError = 'metadata endpoints not reachable'
  for (const metadataUrl of candidates) {
    try {
      const response = await fetch(metadataUrl, { headers: { accept: 'application/json' } })
      if (response.status === 404) {
        lastError = `metadata not found at ${metadataUrl}`
        continue
      }
      if (!response.ok)
        return { ok: false, error: `metadata discovery failed: HTTP ${response.status}` }
      const metadata = (await response.json()) as {
        authorization_endpoint?: string
        token_endpoint?: string
      }
      if (
        typeof metadata.authorization_endpoint !== 'string' ||
        typeof metadata.token_endpoint !== 'string'
      ) {
        return { ok: false, error: 'metadata missing authorization/token endpoints' }
      }
      return {
        ok: true,
        endpoints: {
          authorizationUrl: metadata.authorization_endpoint,
          tokenUrl: metadata.token_endpoint,
        },
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
  }
  return { ok: false, error: lastError }
}

export class McpOAuthFlow {
  private readonly store: TokenStore

  constructor(
    store: TokenStore = new TokenStore(),
    private readonly openBrowser: (url: string) => void = (url) => {
      console.log(`Open this URL to authorize forge:\n${url}`)
    },
  ) {
    this.store = store
  }

  /**
   * Full browser authorization: loopback callback server → PKCE + state →
   * exchange → persist. State mismatch or expiry fails the flow.
   */
  async authorize(serverKey: string, options: AuthorizeOptions): Promise<AuthorizeResult> {
    const state = randomBytes(16).toString('base64url')
    const { verifier, challenge } = buildPkcePair()
    const callback = startCallbackServer(options.callbackTimeoutMs ?? 300_000)

    let callbackUrl = `http://127.0.0.1:${callback.port}/callback`
    if (options.redirectUri !== undefined) {
      callbackUrl = options.redirectUri.includes('{port}')
        ? options.redirectUri.replace('{port}', String(callback.port))
        : options.redirectUri
    }
    const authUrl = new URL(options.authorizationUrl)
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('client_id', options.clientId)
    authUrl.searchParams.set('redirect_uri', callbackUrl)
    authUrl.searchParams.set('state', state)
    authUrl.searchParams.set('code_challenge', challenge)
    authUrl.searchParams.set('code_challenge_method', 'S256')
    if (options.scope !== undefined) authUrl.searchParams.set('scope', options.scope)

    this.openBrowser(authUrl.toString())

    try {
      const waited = await callback.waitForCode()
      if (!waited.ok) return { ok: false, error: waited.error }
      if (waited.state !== state) {
        return {
          ok: false,
          error: `OAuth state mismatch: expected '${state}', got '${waited.state}'`,
        }
      }

      const exchanged = await this.exchangeCode({
        tokenUrl: options.tokenUrl,
        code: waited.code,
        verifier,
        redirectUri: callbackUrl,
        clientId: options.clientId,
        clientSecret: options.clientSecret,
      })
      if (!exchanged.ok) return exchanged
      return { ok: true, token: this.store.save(serverKey, exchanged.token) }
    } finally {
      callback.close()
    }
  }

  /** Exchange an authorization code for tokens (POST x-www-form-urlencoded). */
  async exchangeCode(options: {
    tokenUrl: string
    code: string
    verifier: string
    redirectUri: string
    clientId: string
    clientSecret?: string
  }): Promise<
    | { ok: true; token: Omit<OAuthTokenSet, 'obtainedAt' | 'expiresAt'> & { expires_in?: number } }
    | { ok: false; error: string }
  > {
    return this.tokenRequest(
      options.tokenUrl,
      new URLSearchParams({
        grant_type: 'authorization_code',
        code: options.code,
        code_verifier: options.verifier,
        redirect_uri: options.redirectUri,
        client_id: options.clientId,
        ...(options.clientSecret !== undefined ? { client_secret: options.clientSecret } : {}),
      }),
    )
  }

  /** Refresh a token set; persists on success. */
  async refresh(
    serverKey: string,
    options: { tokenUrl: string; clientId: string; clientSecret?: string; refreshToken?: string },
  ): Promise<AuthorizeResult> {
    const existing = this.store.get(serverKey)
    const refreshToken = options.refreshToken ?? existing?.refresh_token
    if (refreshToken === undefined) {
      return { ok: false, error: `no refresh token stored for '${serverKey}'` }
    }
    const result = await this.tokenRequest(
      options.tokenUrl,
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: options.clientId,
        ...(options.clientSecret !== undefined ? { client_secret: options.clientSecret } : {}),
      }),
    )
    if (!result.ok) return result
    return {
      ok: true,
      token: this.store.save(serverKey, {
        ...result.token,
        refresh_token: result.token.refresh_token ?? refreshToken,
      }),
    }
  }

  /**
   * Return a stored token, auto-refreshing through the given endpoints when
   * it is expired (falls back to the stored token when no refresh works).
   */
  async getValidToken(
    serverKey: string,
    options: { tokenUrl: string; clientId: string; clientSecret?: string },
  ): Promise<{ ok: true; token: OAuthTokenSet } | { ok: false; error: string }> {
    const stored = this.store.get(serverKey)
    if (stored === undefined) return { ok: false, error: `no token stored for '${serverKey}'` }
    if (!isExpired(stored)) return { ok: true, token: stored }
    const refreshed = await this.refresh(serverKey, options)
    if (refreshed.ok) return { ok: true, token: refreshed.token }
    if (!isExpired(stored)) return { ok: true, token: stored }
    return { ok: false, error: `token expired and refresh failed: ${refreshed.error}` }
  }

  /** Bearer header for the Phase-118 transports' `headers` option. */
  authHeaders(token: OAuthTokenSet): Record<string, string> {
    return { authorization: `Bearer ${token.access_token}` }
  }

  private async tokenRequest(
    tokenUrl: string,
    body: URLSearchParams,
  ): Promise<
    | { ok: true; token: Omit<OAuthTokenSet, 'obtainedAt' | 'expiresAt'> & { expires_in?: number } }
    | { ok: false; error: string }
  > {
    try {
      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          accept: 'application/json',
        },
        body: body.toString(),
      })
      if (!response.ok) {
        const detail = await response.text().catch(() => '')
        return {
          ok: false,
          error: `token request failed: HTTP ${response.status} ${detail.slice(0, 200)}`,
        }
      }
      const parsed = (await response.json()) as {
        access_token?: string
        refresh_token?: string
        token_type?: string
        scope?: string
        expires_in?: number
      }
      if (typeof parsed.access_token !== 'string') {
        return { ok: false, error: 'token response missing access_token' }
      }
      return {
        ok: true,
        token: {
          access_token: parsed.access_token,
          ...(parsed.refresh_token !== undefined ? { refresh_token: parsed.refresh_token } : {}),
          ...(parsed.token_type !== undefined ? { token_type: parsed.token_type } : {}),
          ...(parsed.scope !== undefined ? { scope: parsed.scope } : {}),
          ...(parsed.expires_in !== undefined ? { expires_in: parsed.expires_in } : {}),
        },
      }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  }
}
