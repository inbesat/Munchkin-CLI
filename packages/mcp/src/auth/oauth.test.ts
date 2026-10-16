import { afterAll, describe, expect, it } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { McpOAuthFlow, TokenStore, buildPkcePair, fetchOAuthMetadata } from './oauth'

describe('OAuth flow for remote MCP servers (Phase 119)', () => {
  const servers: ReturnType<typeof Bun.serve>[] = []
  const tempDirs: string[] = []
  afterAll(() => {
    for (const server of servers) server.stop(true)
    for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true })
  })

  function tempStore(): TokenStore {
    const dir = mkdtempSync(join(tmpdir(), 'forge-oauth-'))
    tempDirs.push(dir)
    return new TokenStore({ directory: dir })
  }

  let issuedAccessTokens = 0

  /** Mock IdP: RFC 8414 metadata, authorize 302, token + refresh POSTs. */
  function startMockIdp(options: { tamperState?: boolean } = {}): { port: number } {
    const server = Bun.serve({
      port: 0,
      async fetch(request) {
        const url = new URL(request.url)
        if (url.pathname === '/.well-known/oauth-authorization-server') {
          return new Response(
            JSON.stringify({
              authorization_endpoint: `http://localhost:${server.port}/authorize`,
              token_endpoint: `http://localhost:${server.port}/token`,
            }),
            { headers: { 'content-type': 'application/json' } },
          )
        }
        if (url.pathname === '/authorize') {
          const redirect = url.searchParams.get('redirect_uri') ?? ''
          const state =
            options.tamperState === true ? 'tampered' : (url.searchParams.get('state') ?? '')
          return new Response(null, {
            status: 302,
            headers: { location: `${redirect}?code=auth-code-123&state=${state}` },
          })
        }
        if (url.pathname === '/token' && request.method === 'POST') {
          const form = new URLSearchParams(await request.text())
          if (
            form.get('code_verifier') === null &&
            form.get('grant_type') === 'authorization_code'
          ) {
            return new Response(JSON.stringify({ error: 'invalid_request' }), { status: 400 })
          }
          issuedAccessTokens += 1
          const isRefresh = form.get('grant_type') === 'refresh_token'
          return new Response(
            JSON.stringify({
              access_token: isRefresh
                ? `refreshed-access-${issuedAccessTokens}`
                : `access-${issuedAccessTokens}`,
              ...(isRefresh ? {} : { refresh_token: `refresh-${issuedAccessTokens}` }),
              token_type: 'Bearer',
              expires_in: 3600,
            }),
            { headers: { 'content-type': 'application/json' } },
          )
        }
        return new Response('not found', { status: 404 })
      },
    })
    servers.push(server)
    return { port: server.port }
  }

  it('discovers endpoints via RFC 8414 metadata', async () => {
    const idp = startMockIdp()
    const discovered = await fetchOAuthMetadata(`http://localhost:${idp.port}/mcp`)
    expect(discovered.ok).toBe(true)
    if (discovered.ok) {
      expect(discovered.endpoints.authorizationUrl).toContain('/authorize')
      expect(discovered.endpoints.tokenUrl).toContain('/token')
    }
  })

  it('builds a PKCE S256 pair', () => {
    const { verifier, challenge } = buildPkcePair()
    expect(verifier.length).toBeGreaterThanOrEqual(43)
    expect(challenge).not.toBe(verifier)
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('runs the browser flow end-to-end: state validation, exchange, storage', async () => {
    const idp = startMockIdp()
    const store = tempStore()
    let openedUrl = ''
    const flow = new McpOAuthFlow(store, (url) => {
      openedUrl = url
    })

    const authorizePromise = flow.authorize('github', {
      authorizationUrl: `http://localhost:${idp.port}/authorize`,
      tokenUrl: `http://localhost:${idp.port}/token`,
      clientId: 'forge-client',
      scope: 'repo',
      callbackTimeoutMs: 5_000,
    })

    // Simulate the browser landing on the provider, which 302s back to our
    // loopback callback server (fetch follows the redirect automatically).
    await new Promise((r) => setTimeout(r, 100))
    expect(openedUrl).toContain('/authorize')
    expect(new URL(openedUrl).searchParams.get('response_type')).toBe('code')
    expect(new URL(openedUrl).searchParams.get('code_challenge_method')).toBe('S256')
    expect(new URL(openedUrl).searchParams.get('redirect_uri')).toContain('http://127.0.0.1:')
    // The redirect lands on the loopback callback server, which shuts down
    // as soon as the code arrives - a reset connection is expected noise.
    const providerResponse = await fetch(openedUrl).catch(() => null)
    expect(providerResponse === null || providerResponse.status === 200).toBe(true)

    const result = await authorizePromise
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.token.access_token).toMatch(/^access-/)
    expect(result.token.refresh_token).toMatch(/^refresh-/)

    // Persisted with expiry derived from expires_in.
    const storeDir = tempDirs[0] ?? ''
    const raw = JSON.parse(readFileSync(join(storeDir, 'mcp-tokens.json'), 'utf-8')) as {
      github: { access_token: string; expiresAt: number }
    }
    expect(raw.github.access_token).toBe(result.token.access_token)
    expect(raw.github.expiresAt).toBeGreaterThan(Date.now())

    // Bearer header shape for the Phase-118 transports.
    const headers = flow.authHeaders(result.token)
    expect(headers.authorization).toBe(`Bearer ${result.token.access_token}`)
  })

  it('a provider that tampers with state fails the flow', async () => {
    const idp = startMockIdp({ tamperState: true })
    const store = tempStore()
    let openedUrl = ''
    const flow = new McpOAuthFlow(store, (url) => {
      openedUrl = url
    })

    const authorizePromise = flow.authorize('github', {
      authorizationUrl: `http://localhost:${idp.port}/authorize`,
      tokenUrl: `http://localhost:${idp.port}/token`,
      clientId: 'forge-client',
      callbackTimeoutMs: 5_000,
    })
    await new Promise((r) => setTimeout(r, 100))
    // Simulate the browser hop-by-hop with manual redirects - the provider
    // 302s to our loopback callback carrying the tampered state.
    const provider302 = await fetch(openedUrl, { redirect: 'manual' })
    expect(provider302.status).toBe(302)
    const location = provider302.headers.get('location') ?? ''
    expect(location).toContain('state=tampered')
    // The callback server may already have shut down (the flow resolved on
    // the tampered state) - a refused reset connection is expected here.
    await fetch(location).catch(() => null)

    const result = await authorizePromise
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('state mismatch')
    expect(store.get('github')).toBeUndefined()
  })

  it('auto-refreshes expired tokens via the refresh grant', async () => {
    const idp = startMockIdp()
    const store = tempStore()
    const flow = new McpOAuthFlow(store, () => {})

    // Seed an expired token set with a refresh token.
    store.save('supabase', {
      access_token: 'expired-access',
      refresh_token: 'refresh-1',
      expires_in: -1,
    })

    const valid = await flow.getValidToken('supabase', {
      tokenUrl: `http://localhost:${idp.port}/token`,
      clientId: 'forge-client',
    })
    expect(valid.ok).toBe(true)
    if (!valid.ok) return
    expect(valid.token.access_token).toContain('refreshed-access')
    expect(valid.token.refresh_token).toBe('refresh-1')

    // Unexpired tokens pass through untouched.
    store.save('other', { access_token: 'fresh', expires_in: 3600 })
    const stillValid = await flow.getValidToken('other', {
      tokenUrl: `http://localhost:${idp.port}/token`,
      clientId: 'forge-client',
    })
    expect(stillValid.ok).toBe(true)
    if (stillValid.ok) expect(stillValid.token.access_token).toBe('fresh')
  })
})
