import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ClaudeSubscriptionAuth } from './claude'
import { AuthFlowError } from './errors'
import { FileTokenVault } from './tokens'

const clientId = 'test-client-id'

function idToken(email: string): string {
  const header = btoa(JSON.stringify({ alg: 'none' }))
  const payload = btoa(JSON.stringify({ email }))
  return `${header}.${payload}.sig`
}

describe('ClaudeSubscriptionAuth', () => {
  let tokenPosts = 0
  let lastTokenBody = ''
  const originalFetch = globalThis.fetch

  afterEach(() => {
    tokenPosts = 0
    lastTokenBody = ''
    globalThis.fetch = originalFetch
  })

  function stubTokenEndpoint(respond: (body: string) => unknown): void {
    const realFetch = globalThis.fetch
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      if (url === 'https://claude.ai/oauth/token') {
        tokenPosts++
        lastTokenBody = String(init?.body ?? '')
        const json = respond(lastTokenBody)
        return new Response(JSON.stringify(json), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      return realFetch(input, init)
    }) as typeof fetch
  }

  it('logs in through the browser flow and persists tokens', async () => {
    const store = new FileTokenVault(
      join(mkdtempSync(join(tmpdir(), 'forge-claude-')), 'creds.json'),
    )
    stubTokenEndpoint(() => ({
      access_token: 'sk-ant-exchanged',
      refresh_token: 'sk-refresh',
      expires_in: 3600,
      scope: 'model.read user.read',
      id_token: idToken('me@example.com'),
    }))

    const realFetch = globalThis.fetch
    const auth = new ClaudeSubscriptionAuth({
      clientId,
      store,
      openBrowserFn: async () => {},
      onListening: (uri, state) => void realFetch(`${uri}?code=CAPCODE&state=${state}`),
    })

    const tokens = await auth.login()
    expect(tokens.accessToken).toBe('sk-ant-exchanged')
    expect(tokens.provider).toBe('claude')
    expect(tokens.account).toBe('me@example.com')
    expect(lastTokenBody).toContain('grant_type=authorization_code')
    expect(lastTokenBody).toContain('code=CAPCODE')
    expect(lastTokenBody).toContain(`client_id=${clientId}`)
    expect(store.load('claude')?.accessToken).toBe('sk-ant-exchanged')
  })

  it('returns a stored bearer and refreshes once near expiry', async () => {
    const store = new FileTokenVault(
      join(mkdtempSync(join(tmpdir(), 'forge-claude-')), 'creds.json'),
    )
    store.save({
      provider: 'claude',
      accessToken: 'stale',
      refreshToken: 'rt-1',
      expiresAt: Date.now() - 1000,
    })
    stubTokenEndpoint((body) => {
      expect(body).toContain('grant_type=refresh_token')
      expect(body).toContain('refresh_token=rt-1')
      return { access_token: 'fresh', expires_in: 3600 }
    })

    const auth = new ClaudeSubscriptionAuth({ clientId, store, openBrowserFn: async () => {} })
    expect(await auth.bearer()).toBe('fresh')
    expect(store.load('claude')?.accessToken).toBe('fresh')
    expect(tokenPosts).toBe(1)
  })

  it('throws not_authenticated before any token exists', async () => {
    const store = new FileTokenVault(
      join(mkdtempSync(join(tmpdir(), 'forge-claude-')), 'creds.json'),
    )
    const auth = new ClaudeSubscriptionAuth({ clientId, store, openBrowserFn: async () => {} })
    await expect(auth.bearer()).rejects.toThrow(AuthFlowError)
  })

  it('logout clears the store', async () => {
    const store = new FileTokenVault(
      join(mkdtempSync(join(tmpdir(), 'forge-claude-')), 'creds.json'),
    )
    store.save({ provider: 'claude', accessToken: 'x' })
    const auth = new ClaudeSubscriptionAuth({ clientId, store })
    auth.logout()
    expect(store.load('claude')).toBeNull()
  })

  it('requires a client id', () => {
    expect(() => new ClaudeSubscriptionAuth({ clientId: '' })).toThrow(/clientId/)
  })
})
