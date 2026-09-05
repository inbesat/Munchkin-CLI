import { describe, expect, it } from 'bun:test'
import type { GenerateResult, Model, ModelConfig } from '../model/types'
import { createRouter, matchModelRef, resolveChain, resolveModelRefs } from './router'

function config(provider: string, name: string): ModelConfig {
  return {
    id: `${provider}/${name}`,
    provider,
    name,
    displayName: name,
    capabilities: { text: true, maxTokens: 1000, contextWindow: 16000 },
    cost: { inputPerToken: 0, outputPerToken: 0 },
  }
}

function mkModel(provider: string, name: string): Model {
  return {
    id: `${provider}/${name}`,
    provider,
    name,
    config: config(provider, name),
    generate: async (): Promise<GenerateResult> => ({
      content: `${provider}:${name}`,
      toolCalls: [],
      usage: { input: 1, output: 1, total: 2 },
      finishReason: 'stop',
      model: name,
      provider,
    }),
    stream: async function* () {},
    supportsFeature: () => true,
    getCapabilities: () => config(provider, name).capabilities,
  }
}

function catalog(): Model[] {
  return [
    mkModel('anthropic', 'claude-sonnet-4-6'),
    mkModel('openai', 'gpt-4o'),
    mkModel('openai-compatible', 'qwen2.5-coder'),
    mkModel('ollama', 'qwen2.5-coder'),
  ]
}

describe('matchModelRef', () => {
  const models = catalog()

  it('matches exact provider/name refs', () => {
    expect(matchModelRef('anthropic/claude-sonnet-4-6', models[0])).toBe(true)
    expect(matchModelRef('anthropic/claude-sonnet-4-6', models[1])).toBe(false)
  })

  it('matches bare provider tokens', () => {
    expect(matchModelRef('ollama', models[3])).toBe(true)
    expect(matchModelRef('ollama', models[2])).toBe(false)
  })

  it('matches id or name substrings', () => {
    expect(matchModelRef('claude', models[0])).toBe(true)
    expect(matchModelRef('gpt-4o', models[1])).toBe(true)
    expect(matchModelRef('qwen2.5', models[2])).toBe(true)
    expect(matchModelRef('qwen2.5', models[3])).toBe(true)
  })

  it('is case-insensitive and rejects empty refs', () => {
    expect(matchModelRef('CLAUDE', models[0])).toBe(true)
    expect(matchModelRef('', models[0])).toBe(false)
    expect(matchModelRef('  ', models[0])).toBe(false)
  })
})

describe('resolveModelRefs', () => {
  it('returns matching models in catalog order', () => {
    const matches = resolveModelRefs(catalog(), 'qwen2.5')
    expect(matches.map((m) => m.provider)).toEqual(['openai-compatible', 'ollama'])
  })
})

describe('resolveChain', () => {
  it('puts preferred models first in declared order', () => {
    const chain = resolveChain(catalog(), { preferred: ['openai/gpt-4o', 'claude'] })
    expect(chain.map((m) => m.provider)).toEqual([
      'openai',
      'anthropic',
      'openai-compatible',
      'ollama',
    ])
  })

  it('resolves claude-sonnet-4-6 to anthropic, then openai-compatible, then ollama', () => {
    const chain = resolveChain(catalog(), {
      preferred: ['claude-sonnet-4-6'],
      providerOrder: ['openai-compatible', 'ollama'],
    })
    expect(chain.map((m) => `${m.provider}/${m.name}`)).toEqual([
      'anthropic/claude-sonnet-4-6',
      'openai-compatible/qwen2.5-coder',
      'ollama/qwen2.5-coder',
      'openai/gpt-4o',
    ])
  })

  it('dedupes models matched by multiple refs', () => {
    const chain = resolveChain(catalog(), {
      preferred: ['qwen2.5', 'openai-compatible', 'openai/qwen2.5-coder'],
    })
    const ids = chain.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('returns every catalog model when nothing is configured', () => {
    expect(resolveChain(catalog()).map((m) => m.provider)).toEqual([
      'anthropic',
      'openai',
      'openai-compatible',
      'ollama',
    ])
  })
})

describe('createRouter', () => {
  it('builds a working fallback model over the resolved chain', async () => {
    const primary = catalog()[0]
    const primaryThrows = {
      ...primary,
      generate: async () => {
        throw new Error('Anthropic API error 429: rate limited')
      },
    }
    const chain = [primaryThrows, ...catalog().slice(1)]

    const router = createRouter(chain, {
      preferred: ['claude-sonnet-4-6'],
      providerOrder: ['openai-compatible', 'ollama'],
    })
    expect(router.chain.length).toBe(4)

    const result = await router.model.generate({ messages: [{ role: 'user', content: 'hi' }] })
    expect(result.content).toBe('openai-compatible:qwen2.5-coder')
  })

  it('exposes resolve() for individual refs', () => {
    const router = createRouter(catalog())
    const matches = router.resolve('ollama')
    expect(matches.map((m) => m.provider)).toEqual(['ollama'])
  })

  it('requires at least one model', () => {
    expect(() => createRouter([])).toThrow(/at least one model/)
  })
})
