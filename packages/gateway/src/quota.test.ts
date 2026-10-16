import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MemoryKillSwitch } from './killswitch'
import { relayChatCompletion } from './proxy'
import { SqliteQuotaEngine, todayKey } from './quota'
import { SlidingWindowLimiter } from './ratelimit'
import { PrefixRouter } from './router'
import { createApp } from './server'

const originalFetch = globalThis.fetch

describe('SlidingWindowLimiter', () => {
  it('allows up to maxRequests within the window', () => {
    const limiter = new SlidingWindowLimiter(10_000, 2)
    const now = 1_000_000
    expect(limiter.check('ip:a', now).allowed).toBe(true)
    expect(limiter.check('ip:a', now + 100).allowed).toBe(true)
    expect(limiter.check('ip:a', now + 200).allowed).toBe(false)
  })

  it('reports a positive retry-after when denied', () => {
    const limiter = new SlidingWindowLimiter(10_000, 1)
    const now = 1_000_000
    limiter.check('ip:a', now)
    const decision = limiter.check('ip:a', now + 100)
    expect(decision.allowed).toBe(false)
    expect(decision.retryAfterMs).toBeGreaterThan(0)
  })

  it('keys are independent', () => {
    const limiter = new SlidingWindowLimiter(10_000, 1)
    expect(limiter.check('ip:a', 0).allowed).toBe(true)
    expect(limiter.check('ip:b', 0).allowed).toBe(true)
    expect(limiter.check('ip:a', 0).allowed).toBe(false)
  })

  it('evicts hits that fall outside the window', () => {
    const limiter = new SlidingWindowLimiter(10_000, 2)
    const now = 1_000_000
    limiter.check('ip:a', now)
    limiter.check('ip:a', now + 100)
    expect(limiter.check('ip:a', now + 20_000).allowed).toBe(true)
  })
})

describe('SqliteQuotaEngine', () => {
  it('accumulates usage per key and date', () => {
    const engine = new SqliteQuotaEngine()
    engine.addUsage('ip:1', { tokens: 500 })
    engine.addUsage('ip:1', { tokens: 250 })
    expect(engine.getUsage('ip:1').tokens).toBe(750)
    const yesterday = '2000-01-01'
    expect(engine.getUsage('ip:1', yesterday).tokens).toBe(0)
    engine.close()
  })

  it('flags over-quota when the token cap is reached', () => {
    const engine = new SqliteQuotaEngine({ dailyTokenCap: 100 })
    engine.addUsage('ip:1', { tokens: 99 })
    expect(engine.isOverQuota('ip:1')).toBe(false)
    engine.addUsage('ip:1', { tokens: 1 })
    expect(engine.isOverQuota('ip:1')).toBe(true)
    engine.close()
  })

  it('flags over-quota when the cost cap is reached', () => {
    const engine = new SqliteQuotaEngine({ dailyCostCapUsd: 0.5 })
    engine.addUsage('ip:1', { tokens: 0, costUsd: 0.49 })
    expect(engine.isOverQuota('ip:1')).toBe(false)
    engine.addUsage('ip:1', { tokens: 0, costUsd: 0.01 })
    expect(engine.isOverQuota('ip:1')).toBe(true)
    engine.close()
  })

  it('is not over-quota when no caps are configured', () => {
    const engine = new SqliteQuotaEngine()
    engine.addUsage('ip:1', { tokens: 10_000_000 })
    expect(engine.isOverQuota('ip:1')).toBe(false)
    engine.close()
  })

  it('persists usage data across instances on disk', () => {
    const dir = mkdtempSync(join(tmpdir(), 'forge-quota-'))
    const dbPath = join(dir, 'quota.sqlite')
    const engine = new SqliteQuotaEngine({ dbPath, dailyTokenCap: 5 })
    engine.addUsage('ip:1', { tokens: 4 })
    engine.close()

    const reopened = new SqliteQuotaEngine({ dbPath, dailyTokenCap: 5 })
    expect(reopened.getUsage('ip:1').tokens).toBe(4)
    expect(reopened.isOverQuota('ip:1')).toBe(false)
    reopened.close()
  })

  it('kills and revives upstreams', () => {
    const engine = new SqliteQuotaEngine()
    engine.disable('https://api.groq.com/openai/v1')
    expect(engine.isDisabled('https://api.groq.com/openai/v1')).toBe(true)
    expect(engine.list()).toEqual(['https://api.groq.com/openai/v1'])
    engine.enable('https://api.groq.com/openai/v1')
    expect(engine.isDisabled('https://api.groq.com/openai/v1')).toBe(false)
    engine.close()
  })

  it('uses the expected ISO date key', () => {
    expect(todayKey(new Date('2026-08-27T12:00:00Z'))).toBe('2026-08-27')
    expect(todayKey(new Date('2026-08-27T23:59:59Z'))).toBe('2026-08-27')
  })
})

describe('killswitch through the proxy', () => {
  const GROQ = { baseURL: 'https://api.groq.com/openai/v1', apiKey: 'sk-groq' }
  const BACKUP = { baseURL: 'https://backup.test/v1', apiKey: 'sk-backup' }

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('skips a disabled upstream and uses the alternate', async () => {
    const router = new PrefixRouter().add('groq', GROQ, { fallbacks: [BACKUP] })
    const killSwitch = new MemoryKillSwitch()
    killSwitch.disable('https://api.groq.com/openai/v1')

    const calls: string[] = []
    globalThis.fetch = async (input: string | URL | Request) => {
      const url = String(input)
      calls.push(url)
      return new Response(JSON.stringify({ id: 'cmpl', choices: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    const res = await relayChatCompletion(
      router,
      JSON.stringify({ model: 'groq/m', messages: [] }),
      {
        killSwitch,
      },
    )
    expect(res.status).toBe(200)
    expect(calls).toEqual(['https://backup.test/v1/chat/completions'])
  })

  it('returns upstream_disabled when every candidate is disabled', async () => {
    const router = new PrefixRouter().add('groq', GROQ)
    const killSwitch = new MemoryKillSwitch()
    killSwitch.disable('https://api.groq.com/openai/v1')
    const res = await relayChatCompletion(
      router,
      JSON.stringify({ model: 'groq/m', messages: [] }),
      {
        killSwitch,
      },
    )
    expect(res.status).toBe(502)
    expect((await res.json()).error.type).toBe('upstream_disabled')
  })
})

describe('server enforcement', () => {
  const UPSTREAM = { baseURL: 'https://upstream.test/v1', apiKey: 'sk-test' }
  const IP = '1.2.3.4'

  const okResponse = (tokens: number) =>
    new Response(
      JSON.stringify({
        id: 'cmpl-1',
        choices: [
          { index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' },
        ],
        usage: { prompt_tokens: tokens, completion_tokens: 0, total_tokens: tokens },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )

  function appWith(limits: Parameters<typeof createApp>[0]['limits']) {
    return createApp({
      router: new PrefixRouter().add('test', UPSTREAM),
      limits,
      ipExtractor: () => IP,
    })
  }

  const body = JSON.stringify({ model: 'test/m', messages: [], stream: false })

  beforeEach(() => {
    globalThis.fetch = async () => okResponse(6)
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('rate limits per IP and attaches Retry-After', async () => {
    const app = appWith({ ipRequestsPerMinute: 2 })
    expect((await app.request('/v1/chat/completions', { method: 'POST', body })).status).toBe(200)
    expect((await app.request('/v1/chat/completions', { method: 'POST', body })).status).toBe(200)
    const third = await app.request('/v1/chat/completions', { method: 'POST', body })
    expect(third.status).toBe(429)
    expect(third.headers.get('retry-after')).toBeTruthy()
    expect((await third.json()).error.type).toBe('rate_limit_error')
  })

  it('rejects requests past the daily token quota', async () => {
    const app = appWith({ dailyTokenCap: 10 })
    expect((await app.request('/v1/chat/completions', { method: 'POST', body })).status).toBe(200)
    expect((await app.request('/v1/chat/completions', { method: 'POST', body })).status).toBe(200)
    const third = await app.request('/v1/chat/completions', { method: 'POST', body })
    expect(third.status).toBe(429)
    expect((await third.json()).error.type).toBe('quota_error')
  })

  it('exposes metrics with counters and kill switches', async () => {
    const app = appWith({ dailyTokenCap: 100 })
    await app.request('/v1/chat/completions', { method: 'POST', body })
    await app.request('/v1/chat/completions', { method: 'POST', body })
    const metrics = await (await app.request('/metrics')).json()
    expect(metrics.requests).toBe(2)
    expect(metrics.completions).toBe(2)
    expect(metrics.tokensCharged).toBe(12)
    expect(metrics.rateLimited).toBe(0)
    expect(metrics.quotaRejected).toBe(0)
    expect(metrics.killswitches).toEqual([])
  })
})
