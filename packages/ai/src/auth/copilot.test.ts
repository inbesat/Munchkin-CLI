import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CopilotAuth } from './copilot'
import { FileTokenVault } from './tokens'

describe('CopilotAuth', () => {
  let copilotGets = 0
  const originalFetch = globalThis.fetch

  afterEach(() => {
    copilotGets = 0
    globalThis.fetch = originalFetch
  })

  function stubFetch(respond: (url: string, init?: RequestInit) => unknown): void {
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      const json = respond(url, init)
      return new Response(JSON.stringify(json), {
        status: json && (json as { error?: string }).error ? 200 : 200,
        headers: { 'content-type': 'application/json' },
      })
    }) as typeof fetch
  }

  it('runs the device flow and caches a copilot session token', async () => {
    const store = new FileTokenVault(join(mkdtempSync(join(tmpdir(), 'forge-cop-')), 'creds.json'))
    let tokenRequests = 0
    const opened: string[] = []

    stubFetch((url, init) => {
      if (url === 'https://github.com/login/device/code') {
        return {
          device_code: 'dc',
          user_code: 'GH-CODE',
          verification_uri: 'https://github.com/login/device',
          expires_in: 900,
          interval: 1,
        }
      }
      if (url === 'https://github.com/login/oauth/access_token') {
        tokenRequests++
        if (tokenRequests === 1) return { error: 'authorization_pending' }
        return {
          access_token: 'gh-token',
          scope: 'read:user user:email copilot',
          expires_in: 28800,
        }
      }
      if (url === 'https://api.github.com/copilot_internal/v2/token') {
        copilotGets++
        return {
          token: 'cop-session-1',
          expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
        }
      }
      throw new Error(`unexpected URL ${url} init=${init}`)
    })

    const auth = new CopilotAuth({
      clientId: 'c',
      store,
      openBrowserFn: async (_uri, code) => opened.push(code),
      pollIntervalMs: 50,
    })

    const tokens = await auth.login()
    expect(tokens.accessToken).toBe('gh-token')
    expect(opened).toEqual(['GH-CODE'])

    expect(await auth.sessionToken()).toBe('cop-session-1')
    expect(await auth.sessionToken()).toBe('cop-session-1')
    expect(copilotGets).toBe(1)
    expect(await auth.sessionToken(true)).toBe('cop-session-1')
    expect(copilotGets).toBe(2)
  })

  it('refetches the session token when it is near expiry', async () => {
    const store = new FileTokenVault(join(mkdtempSync(join(tmpdir(), 'forge-cop-')), 'creds.json'))
    store.save({ provider: 'copilot', accessToken: 'gh-token' })
    let count = 0
    stubFetch((url) => {
      if (url === 'https://api.github.com/copilot_internal/v2/token') {
        count++
        return {
          token: `sess-${count}`,
          expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
        }
      }
      throw new Error('unexpected fetch')
    })

    const auth = new CopilotAuth({ clientId: 'c', store, fetchFn: globalThis.fetch })
    // no expiry -> first token returns, subsequent call within expiry reuses cache
    expect(await auth.sessionToken()).toBe('sess-1')
    expect(await auth.sessionToken()).toBe('sess-1')
    expect(count).toBe(1)
  })

  it('expired session token triggers a refetch', async () => {
    const store = new FileTokenVault(join(mkdtempSync(join(tmpdir(), 'forge-cop-')), 'creds.json'))
    store.save({ provider: 'copilot', accessToken: 'gh-token' })

    stubFetch((url) => {
      if (url === 'https://api.github.com/copilot_internal/v2/token') {
        copilotGets++
        return {
          token: 'early-expiry',
          expires_at: new Date(Date.now() - 1000).toISOString(),
        }
      }
      throw new Error('unexpected fetch')
    })

    const auth = new CopilotAuth({ clientId: 'c', store })
    expect(await auth.sessionToken()).toBe('early-expiry')
    expect(await auth.sessionToken()).toBe('early-expiry')
    expect(copilotGets).toBe(2) // expired -> always refetches
  })
})
