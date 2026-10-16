import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { buildFreeCatalog } from './catalog'
import { FREE_TIER_PRESETS } from './presets'
import { relayChatCompletion } from './proxy'
import { PrefixRouter, RouterError } from './router'
import { createApp } from './server'

const GROQ = { baseURL: 'https://api.groq.com/openai/v1', apiKey: 'sk-groq' }
const BACKUP = { baseURL: 'https://backup.test/v1', apiKey: 'sk-backup' }
const NVIDIA = { baseURL: 'https://integrate.api.nvidia.com/v1', apiKey: 'sk-nvidia' }
const originalFetch = globalThis.fetch

describe('PrefixRouter', () => {
  it('matches by longest prefix', () => {
    const router = new PrefixRouter()
      .add('nvidia', NVIDIA, { modelRewrite: 'identity' })
      .add('nvidia/long', { baseURL: 'https://long.test/v1', apiKey: 'sk-long' })
    const route = router.resolve('nvidia/long/thing')
    expect(route.upstream.baseURL).toBe('https://long.test/v1')
  })

  it('rewrites strip-prefix for groq-style upstreams', () => {
    const router = new PrefixRouter().add('groq', GROQ, { modelRewrite: 'strip-prefix' })
    const route = router.resolve('groq/llama-3.3-70b-versatile')
    expect(route.outboundModel).toBe('llama-3.3-70b-versatile')
    expect(route.upstream.apiKey).toBe('sk-groq')
  })

  it('rewrites append-free for openrouter', () => {
    const router = new PrefixRouter().add('openrouter', GROQ, { modelRewrite: 'append-free' })
    expect(router.resolve('openrouter/deepseek/deepseek-r1').outboundModel).toBe(
      'openrouter/deepseek/deepseek-r1:free',
    )
  })

  it('exposes alternates in deterministic order', () => {
    const router = new PrefixRouter().add('groq', GROQ, {
      fallbacks: [BACKUP, { baseURL: 'https://second.test/v1' }],
    })
    const route = router.resolve('groq/llama-3.3-70b-versatile')
    expect(route.alternates.map((u) => u.baseURL)).toEqual([
      'https://backup.test/v1',
      'https://second.test/v1',
    ])
  })

  it('advertises allowlisted model ids via list()', () => {
    const router = new PrefixRouter().add('groq', GROQ, {
      modelRewrite: 'strip-prefix',
      models: ['groq/llama-3.3-70b-versatile', 'groq/llama-3.1-8b-instant'],
    })
    expect(router.list()).toEqual(['groq/llama-3.1-8b-instant', 'groq/llama-3.3-70b-versatile'])
  })

  it('advertises the prefix when no allowlist is given', () => {
    const router = new PrefixRouter().add('test', GROQ)
    expect(router.list()).toEqual(['test'])
  })

  it('throws RouterError(404) for unknown models', () => {
    const router = new PrefixRouter().add('groq', GROQ)
    expect(() => router.resolve('unknown/x')).toThrow(RouterError)
    try {
      router.resolve('unknown/x')
    } catch (err) {
      expect(err).toBeInstanceOf(RouterError)
      expect((err as RouterError).status).toBe(404)
    }
  })
})

describe('relayChatCompletion routing', () => {
  let captured: { url: string; body: string; headers: Record<string, string> }[] = []

  beforeEach(() => {
    captured = []
  })

  afterEach(() => {
    captured = []
    globalThis.fetch = originalFetch
  })

  it('forwards the rewritten outbound model id', async () => {
    const router = new PrefixRouter().add('groq', GROQ, { modelRewrite: 'strip-prefix' })
    globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
      captured.push({
        url: String(input),
        body: String(init?.body ?? ''),
        headers: (init?.headers as Record<string, string>) ?? {},
      })
      return new Response(JSON.stringify({ id: 'cmpl-1', choices: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    const res = await relayChatCompletion(
      router,
      JSON.stringify({ model: 'groq/llama-3.3-70b-versatile', messages: [] }),
    )
    expect(res.status).toBe(200)
    expect(captured[0].url).toBe('https://api.groq.com/openai/v1/chat/completions')
    expect(JSON.parse(captured[0].body).model).toBe('llama-3.3-70b-versatile')
    expect(captured[0].headers.authorization).toBe('Bearer sk-groq')
  })

  it('fails over to the alternate upstream on 5xx', async () => {
    const router = new PrefixRouter().add('groq', GROQ, {
      fallbacks: [BACKUP],
    })
    const calls: string[] = []
    globalThis.fetch = async (input: string | URL | Request) => {
      const url = String(input)
      calls.push(url)
      if (url.includes('groq')) {
        return new Response('boom', {
          status: 503,
          headers: { 'content-type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ id: 'cmpl-backup', choices: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    const res = await relayChatCompletion(router, JSON.stringify({ model: 'groq/m', messages: [] }))
    expect(res.status).toBe(200)
    expect((await res.json()).id).toBe('cmpl-backup')
    expect(calls).toEqual([
      'https://api.groq.com/openai/v1/chat/completions',
      'https://backup.test/v1/chat/completions',
    ])
  })

  it('returns 502 when every upstream fails', async () => {
    const router = new PrefixRouter().add('groq', GROQ)
    globalThis.fetch = async () =>
      new Response('down', { status: 503, headers: { 'content-type': 'application/json' } })
    const res = await relayChatCompletion(router, JSON.stringify({ model: 'groq/m', messages: [] }))
    expect(res.status).toBe(502)
  })
})

describe('free tier presets', () => {
  it('each preset advertises >= 1 curated model', () => {
    for (const preset of FREE_TIER_PRESETS) {
      expect(preset.models.length).toBeGreaterThan(0)
      expect(preset.upstream.baseURL).toMatch(/^https:\/\//)
    }
  })

  it('assemble into a working app via usePresets', async () => {
    const app = createApp({ usePresets: true })
    const res = await app.request('/v1/models')
    expect(res.status).toBe(200)
    const body = await res.json()
    const ids = body.data.map((m: { id: string }) => m.id)
    expect(ids).toContain('groq/llama-3.3-70b-versatile')
    expect(ids).toContain('openrouter/deepseek/deepseek-r1')
  })
})

describe('buildFreeCatalog', () => {
  const FIXTURE = {
    nvidia: {
      id: 'nvidia',
      name: 'NVIDIA',
      models: {
        'nvidia/llama-3.1-nemotron-70b-instruct': {
          id: 'nvidia/llama-3.1-nemotron-70b-instruct',
          name: 'Llama 3.1 Nemotron 70B',
          cost: { input: 0, output: 0 },
          limit: { context: 131072, output: 4096 },
          tool_call: true,
        },
        'nvidia/paid-model': {
          id: 'nvidia/paid-model',
          name: 'Paid',
          cost: { input: 1.5, output: 0.5 },
          limit: { context: 128000, output: 4096 },
        },
      },
    },
    openai: {
      id: 'openai',
      name: 'OpenAI',
      models: {
        'gpt-4o-mini': {
          id: 'gpt-4o-mini',
          name: 'GPT-4o mini',
          cost: { input: 0.15, output: 0.6 },
          limit: { context: 128000, output: 16384 },
        },
      },
    },
  }

  beforeEach(() => {
    globalThis.fetch = async () =>
      new Response(JSON.stringify(FIXTURE), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('returns only $0 models from free providers', async () => {
    const models = await buildFreeCatalog()
    const ids = models.map((m) => m.id)
    expect(ids).toContain('nvidia/nvidia/llama-3.1-nemotron-70b-instruct')
    expect(ids).not.toContain('nvidia/nvidia/paid-model')
    expect(ids).not.toContain('openai/gpt-4o-mini')
  })

  it('records capabilities', async () => {
    const models = await buildFreeCatalog()
    const model = models.find((m) => m.id.includes('nemotron'))
    expect(model?.toolCalls).toBe(true)
    expect(model?.contextWindow).toBe(131072)
  })
})
