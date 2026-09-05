import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AuthFlowError } from './errors'
import { ChatGptSubscriptionAuth } from './openai-subscription'
import { FileTokenVault } from './tokens'

describe('ChatGptSubscriptionAuth', () => {
  let deviceCodeCalls = 0
  let tokenCalls = 0
  let lastDeviceBody = ''
  const originalFetch = globalThis.fetch

  afterEach(() => {
    deviceCodeCalls = 0
    tokenCalls = 0
    lastDeviceBody = ''
    globalThis.fetch = originalFetch
  })

  function stubFetch(): void {
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      const body = String(init?.body ?? '')
      if (url === 'https://auth.openai.com/device/code') {
        deviceCodeCalls++
        lastDeviceBody = body
        return new Response(
          JSON.stringify({
            device_code: 'dc',
            user_code: 'OP-CODE',
            verification_url: 'https://auth.openai.com/device',
            verification_uri: 'https://auth.openai.com/device',
            expires_in: 1800,
            interval: 1,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      }
      if (url === 'https://auth.openai.com/device/token') {
        tokenCalls++
        if (body.includes('grant_type=refresh_token')) {
          return new Response(
            JSON.stringify({
              access_token: 'fresh-token',
              refresh_token: 'rt-2',
              expires_in: 3600,
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          )
        }
        return new Response(
          JSON.stringify({ access_token: 'device-token', refresh_token: 'rt-1', expires_in: 3600 }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      }
      throw new Error(`unexpected URL ${url} (${body})`)
    }) as typeof fetch
  }

  it('logs in via device flow with audience + scopes', async () => {
    const store = new FileTokenVault(join(mkdtempSync(join(tmpdir(), 'forge-gpt-')), 'creds.json'))
    stubFetch()
    const auth = new ChatGptSubscriptionAuth({
      clientId: 'openai-client',
      audience: 'https://api.openai.com/v1',
      store,
      openBrowserFn: async () => {},
      pollIntervalMs: 50,
    })

    const tokens = await auth.login()
    expect(tokens.accessToken).toBe('device-token')
    expect(tokens.provider).toBe('chatgpt')
    expect(lastDeviceBody).toContain('client_id=openai-client')
    expect(lastDeviceBody).toContain('audience=https%3A%2F%2Fapi.openai.com%2Fv1')
    expect(deviceCodeCalls).toBe(1)
    expect(tokenCalls).toBe(1)
  })

  it('refreshes an expired bearer and persists the fresh tokens', async () => {
    const store = new FileTokenVault(join(mkdtempSync(join(tmpdir(), 'forge-gpt-')), 'creds.json'))
    store.save({
      provider: 'chatgpt',
      accessToken: 'expired-token',
      refreshToken: 'rt-1',
      expiresAt: Date.now() - 1000,
    })
    stubFetch()
    const auth = new ChatGptSubscriptionAuth({ clientId: 'openai-client', store })

    expect(await auth.bearer()).toBe('fresh-token')
    expect(store.load('chatgpt')?.accessToken).toBe('fresh-token')
    expect(store.load('chatgpt')?.refreshToken).toBe('rt-2')
  })

  it('throws not_authenticated when nothing is stored', async () => {
    const store = new FileTokenVault(join(mkdtempSync(join(tmpdir(), 'forge-gpt-')), 'creds.json'))
    const auth = new ChatGptSubscriptionAuth({ clientId: 'openai-client', store })
    await expect(auth.bearer()).rejects.toThrow(AuthFlowError)
  })
})
