import { describe, expect, it } from 'bun:test'
import { runDeviceFlow } from './device-flow'
import { AuthFlowError } from './errors'

describe('runDeviceFlow', () => {
  it('polls until approval and returns tokens', async () => {
    const opened: string[] = []
    let polls = 0
    const tokens = await runDeviceFlow({
      provider: 'copilot',
      requestDeviceCode: async () => ({
        device_code: 'dc-1',
        user_code: 'ABCD-EFGH',
        verification_uri: 'https://github.com/login/device',
        expiration: 900,
        expires_in: 900,
        interval: 1,
      }),
      requestToken: async (deviceCode) => {
        expect(deviceCode).toBe('dc-1')
        polls++
        if (polls === 1) return { error: 'authorization_pending' }
        return {
          access_token: 'gh-token',
          scope: 'read:user copilot',
          expires_in: 3600,
          token_type: 'bearer',
        }
      },
      openBrowserFn: async (uri, userCode) => opened.push(`${uri}#${userCode}`),
      timeoutMs: 5000,
      pollIntervalMs: 50,
    })
    expect(tokens.accessToken).toBe('gh-token')
    expect(tokens.scopes).toEqual(['read:user', 'copilot'])
    expect(opened).toEqual(['https://github.com/login/device#ABCD-EFGH'])
    expect(polls).toBe(2)
  })

  it('respects slow_down backoff', async () => {
    let polls = 0
    const tokens = await runDeviceFlow({
      provider: 'copilot',
      requestDeviceCode: async () => ({
        device_code: 'dc',
        user_code: 'AAAA-BBBB',
        verification_uri: 'https://v',
        expires_in: 900,
        interval: 1,
      }),
      requestToken: async () => {
        polls++
        if (polls === 1) return { error: 'slow_down' }
        return { access_token: 't', expires_in: 60 }
      },
      openBrowserFn: async () => {},
      timeoutMs: 5000,
      pollIntervalMs: 50,
      slowDownBackoffMs: 100,
    })
    expect(tokens.accessToken).toBe('t')
  })

  it('throws when the user denies', async () => {
    await expect(
      runDeviceFlow({
        provider: 'copilot',
        requestDeviceCode: async () => ({
          device_code: 'dc',
          user_code: 'CCCC-DDDD',
          verification_uri: 'https://v',
          expires_in: 900,
          interval: 1,
        }),
        requestToken: async () => ({ error: 'access_denied' }),
        openBrowserFn: async () => {},
        timeoutMs: 5000,
        pollIntervalMs: 50,
      }),
    ).rejects.toThrow(AuthFlowError)
  })

  it('times out', async () => {
    await expect(
      runDeviceFlow({
        provider: 'copilot',
        requestDeviceCode: async () => ({
          device_code: 'dc',
          user_code: 'EEEE-FFFF',
          verification_uri: 'https://v',
          expires_in: 900,
          interval: 1,
        }),
        requestToken: async () => ({ error: 'authorization_pending' }),
        openBrowserFn: async () => {},
        timeoutMs: 80,
        pollIntervalMs: 50,
      }),
    ).rejects.toThrow(/timed out/)
  })
})
