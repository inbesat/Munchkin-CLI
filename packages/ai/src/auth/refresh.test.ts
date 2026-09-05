import { describe, expect, it } from 'bun:test'
import { refreshAndStore, refreshTokens } from './refresh'

describe('refreshTokens', () => {
  it('dedupes concurrent refreshes for the same token', async () => {
    let upstreamCalls = 0
    let release: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })

    const opts = {
      provider: 'chatgpt' as const,
      refreshToken: 'rt-same',
      requestRefresh: async () => {
        upstreamCalls++
        if (upstreamCalls === 1) release?.()
        await gate
        return { access_token: 'tok-1', expires_in: 600 }
      },
      parseTokens: (payload: unknown) => {
        const raw = payload as { access_token: string }
        return { accessToken: raw.access_token }
      },
    }

    const [a, b] = await Promise.all([refreshTokens(opts), refreshTokens(opts)])
    expect(await a).toBe(await b)
    expect(await (await a).accessToken).toBe('tok-1')
    expect(upstreamCalls).toBe(1)
  })

  it('refreshAndStore persists the fresh tokens', async () => {
    let saved: unknown
    const tokens = await refreshAndStore({
      provider: 'claude',
      refreshToken: 'rt-x',
      requestRefresh: async () => ({
        access_token: 'new',
        refresh_token: 'rt-x2',
        expires_in: 300,
      }),
      parseTokens: (payload: unknown) => {
        const raw = payload as { access_token: string; refresh_token?: string }
        return { accessToken: raw.access_token, refreshToken: raw.refresh_token }
      },
      save: (parsed) => {
        saved = parsed
      },
    })
    expect(tokens.accessToken).toBe('new')
    expect(saved).toEqual({ provider: 'claude', accessToken: 'new', refreshToken: 'rt-x2' })
  })

  it('wraps upstream failures in an AuthFlowError', async () => {
    await expect(
      refreshTokens({
        provider: 'copilot',
        refreshToken: 'rt',
        requestRefresh: async () => {
          throw new Error('network down')
        },
        parseTokens: () => ({ accessToken: 'x' }),
      }),
    ).rejects.toThrow(/Token refresh failed/)
  })
})
