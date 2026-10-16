import { describe, expect, it } from 'bun:test'
import { ErrorCode } from '@forge/core'
import type {
  GenerateOptions,
  GenerateResult,
  Model,
  ModelConfig,
  StreamChunk,
} from '../model/types'
import { withFallback } from './fallback'

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

function mkModel(provider: string, name: string, impl: Partial<Model> = {}): Model {
  return {
    id: `${provider}/${name}`,
    provider,
    name,
    config: config(provider, name),
    generate: impl.generate ?? (async () => ok(provider, name)),
    stream: impl.stream ?? async function* () {},
    supportsFeature: () => true,
    getCapabilities: () => config(provider, name).capabilities,
  }
}

function ok(provider: string, name: string): GenerateResult {
  return {
    content: `${provider}:${name}`,
    toolCalls: [],
    usage: { input: 1, output: 1, total: 2 },
    finishReason: 'stop',
    model: name,
    provider,
  }
}

const options: GenerateOptions = { messages: [{ role: 'user', content: 'hi' }] }

describe('withFallback', () => {
  it('does not call another provider after request cancellation', async () => {
    const controller = new AbortController()
    const reason = new Error('cancelled')
    let secondaryCalls = 0
    const routed = withFallback([
      mkModel('first', 'a', {
        generate: async () => {
          controller.abort(reason)
          throw new Error('503 unavailable')
        },
      }),
      mkModel('second', 'b', {
        generate: async () => {
          secondaryCalls++
          return ok('second', 'b')
        },
      }),
    ])

    await expect(routed.generate({ ...options, abortSignal: controller.signal })).rejects.toBe(
      reason,
    )
    expect(secondaryCalls).toBe(0)
  })

  it('attempts duplicate model references only once per chain entry', async () => {
    let calls = 0
    const model = mkModel('first', 'a', {
      generate: async () => {
        calls++
        if (calls <= 2) throw new Error('503 unavailable')
        return ok('first', 'a')
      },
    })

    await expect(withFallback([model, model]).generate(options)).rejects.toThrow()
    expect(calls).toBe(2)
  })

  it('does not start a provider stream after wrapper cancellation', async () => {
    let calls = 0
    const controller = new AbortController()
    const reason = new Error('already cancelled')
    controller.abort(reason)
    const routed = withFallback(
      [
        mkModel('first', 'a', {
          stream: async function* () {
            calls++
            yield { type: 'text-delta', delta: 'unexpected' }
          },
        }),
      ],
      { abortSignal: controller.signal },
    )

    await expect(routed.stream(options)[Symbol.asyncIterator]().next()).rejects.toBe(reason)
    expect(calls).toBe(0)
  })

  it('falls through to the next provider on a 429 and stays transparent', async () => {
    const falls: Array<{ from: string; to: string; kind: string }> = []
    const primary = mkModel('anthropic', 'claude-sonnet-4-6', {
      generate: async () => {
        throw new Error('Anthropic API error 429: rate limited')
      },
    })
    const secondary = mkModel('openai', 'gpt-4o')

    const routed = withFallback([primary, secondary], {
      onFallback: (from, to, error) => {
        falls.push({
          from: from.provider,
          to: to.provider,
          kind: (error as { kind?: string }).kind ?? '?',
        })
      },
    })

    const result = await routed.generate(options)
    expect(result.content).toBe('openai:gpt-4o')
    expect(result.provider).toBe('openai')
    expect(falls).toEqual([{ from: 'anthropic', to: 'openai', kind: 'rate' }])
  })

  it('throws the normalized last error when every model fails', async () => {
    const routed = withFallback([
      mkModel('anthropic', 'a', {
        generate: async () => {
          throw new Error('A err 429')
        },
      }),
      mkModel('openai', 'b', {
        generate: async () => {
          throw new Error('B err 429')
        },
      }),
    ])
    await expect(routed.generate(options)).rejects.toMatchObject({
      name: 'NormalizedProviderError',
      code: ErrorCode.PROVIDER_RATE_LIMITED,
      provider: 'openai',
    })
  })

  it('respects shouldFallback=false and never leaves the primary', async () => {
    let calls = 0
    const routed = withFallback(
      [
        mkModel('anthropic', 'a', {
          generate: async () => {
            calls++
            throw new Error('A error 400: bad request')
          },
        }),
        mkModel('openai', 'b'),
      ],
      { shouldFallback: () => false },
    )
    await expect(routed.generate(options)).rejects.toMatchObject({
      code: ErrorCode.PROVIDER_REQUEST_FAILED,
      provider: 'anthropic',
    })
    expect(calls).toBe(1)
  })

  it('supports a custom shouldFallback predicate', async () => {
    let calls = 0
    const routed = withFallback(
      [
        mkModel('anthropic', 'a', {
          generate: async () => {
            calls++
            throw new Error('a error 429 boom')
          },
        }),
        mkModel('openai', 'b'),
      ],
      { shouldFallback: (error) => (error as { kind?: string }).kind === 'auth' },
    )
    await expect(routed.generate(options)).rejects.toMatchObject({
      code: ErrorCode.PROVIDER_RATE_LIMITED,
    })
    expect(calls).toBe(1)
  })

  it('falls back for streams when the failure precedes the first chunk', async () => {
    let attempts = 0
    const primary = mkModel('anthropic', 'a', {
      stream: async function* () {
        attempts++
        if (attempts === 1) throw new Error('OpenAI API error: 429 slow down')
        yield { type: 'text-delta', delta: 'never' } as StreamChunk
      },
    })
    const secondary = mkModel('openai', 'b', {
      stream: async function* () {
        yield { type: 'text-delta', delta: 'from-b' } as StreamChunk
      },
    })

    const routed = withFallback([primary, secondary])
    const chunks: string[] = []
    for await (const chunk of routed.stream(options)) {
      if (chunk.type === 'text-delta') chunks.push(chunk.delta)
    }
    expect(chunks).toEqual(['from-b'])
  })

  it('does not fall back in the middle of a stream', async () => {
    const routed = withFallback([
      mkModel('anthropic', 'a', {
        stream: async function* () {
          yield { type: 'text-delta', delta: 'partial' } as StreamChunk
          throw new Error('OpenAI API error: 500 boom')
        },
      }),
      mkModel('openai', 'b'),
    ])
    const chunks: string[] = []
    let failure: unknown
    try {
      for await (const chunk of routed.stream(options)) {
        if (chunk.type === 'text-delta') chunks.push(chunk.delta)
      }
    } catch (error) {
      failure = error
    }
    expect(chunks).toEqual(['partial'])
    expect(failure).toMatchObject({ provider: 'anthropic' })
  })

  it('requires at least one model', () => {
    expect(() => withFallback([])).toThrow(/at least one model/)
  })

  it('delegates capabilities to the primary model', () => {
    const routed = withFallback([mkModel('anthropic', 'a'), mkModel('openai', 'b')])
    expect(routed.id).toBe('anthropic/a')
    expect(routed.provider).toBe('anthropic')
    expect(routed.supportsFeature('text')).toBe(true)
  })
})
