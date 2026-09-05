import { describe, expect, it } from 'bun:test'
import { AuthFlowError } from './errors'
import { runBrowserOAuthFlow } from './oauth'

describe('runBrowserOAuthFlow', () => {
  it('trades a callback code for tokens and reports the redirect URI', async () => {
    let openedUrl = ''
    let capturedUri = ''
    const result = await runBrowserOAuthFlow({
      provider: 'claude',
      state: 'state-123',
      authorizeUrl: (uri, state) => {
        capturedUri = uri
        openedUrl = `${uri}?state=${state}`
        return openedUrl
      },
      exchange: async (code, redirectUri) => ({
        access_token: `tok:${code}`,
        redirect_uri: redirectUri,
      }),
      parseTokens: (p) => {
        const raw = p as { access_token: string }
        return { accessToken: raw.access_token }
      },
      openBrowserFn: async () => {},
      onListening: (uri) => {
        // simulate the browser hitting the callback
        void fetch(`${uri}?code=abc&state=state-123`)
      },
      timeoutMs: 10_000,
    })

    expect(capturedUri).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/callback$/)
    expect(openedUrl).toBe(`${capturedUri}?state=state-123`)
    expect(result.tokens.accessToken).toBe('tok:abc')
    expect(result.redirectUri).toBe(capturedUri)
  })

  it('rejects a callback whose state does not match', async () => {
    await expect(
      runBrowserOAuthFlow({
        provider: 'claude',
        state: 'expected',
        authorizeUrl: () => 'http://auth.test/authorize',
        exchange: async () => ({ access_token: 'x' }),
        parseTokens: () => ({ accessToken: 'x' }),
        openBrowserFn: async () => {},
        onListening: (uri) => void fetch(`${uri}?code=abc&state=WRONG`),
        timeoutMs: 10_000,
      }),
    ).rejects.toThrow(/state mismatch/)
  })

  it('times out when no callback arrives', async () => {
    await expect(
      runBrowserOAuthFlow({
        provider: 'claude',
        state: 'state-t',
        authorizeUrl: () => 'http://auth.test/authorize',
        exchange: async () => ({ access_token: 'x' }),
        parseTokens: () => ({ accessToken: 'x' }),
        openBrowserFn: async () => {},
        timeoutMs: 50,
      }),
    ).rejects.toThrow(AuthFlowError)
  })

  it('surfaces authorization denied pages as a typed error', async () => {
    await expect(
      runBrowserOAuthFlow({
        provider: 'claude',
        state: 'state-d',
        authorizeUrl: () => 'http://auth.test/authorize',
        exchange: async () => ({ access_token: 'x' }),
        parseTokens: () => ({ accessToken: 'x' }),
        openBrowserFn: async () => {},
        onListening: (uri) => void fetch(`${uri}?error=access_denied`),
        timeoutMs: 10_000,
      }),
    ).rejects.toThrow(AuthFlowError)
  })
})
