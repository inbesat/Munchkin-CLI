import { describe, expect, it } from 'bun:test'
import { ErrorCode } from '@forge/core'
import type { GenerateOptions, GenerateResult, Model, StreamChunk } from '../model/types'
import { withModelRetry } from './model'
import { NormalizedProviderError, isRetryable, normalizeProviderError } from './normalize'

function fakeModel(overrides: {
  generate?: (options: GenerateOptions) => Promise<GenerateResult>
  stream?: (options: GenerateOptions) => AsyncIterable<StreamChunk>
}): Model {
  return {
    id: 'test/m',
    provider: 'test',
    name: 'm',
    config: {
      id: 'm',
      provider: 'test',
      name: 'm',
      displayName: 'm',
      capabilities: { text: true, maxTokens: 1000, contextWindow: 10000 },
    },
    generate:
      overrides.generate ??
      (async () => ({
        content: 'ok',
        toolCalls: [],
        usage: { input: 1, output: 1, total: 2 },
        finishReason: 'stop' as const,
        model: 'm',
        provider: 'test',
      })),
    stream:
      overrides.stream ??
      (async function* () {
        yield { type: 'text-delta', delta: 'hi' }
      })(),
    supportsFeature: () => true,
    getCapabilities: () => ({ text: true, maxTokens: 1000, contextWindow: 10000 }),
  }
}

const options: GenerateOptions = { messages: [{ role: 'user', content: 'hi' }] }

describe('withModelRetry', () => {
  it('does not invoke a provider for an already aborted request', async () => {
    let calls = 0
    const controller = new AbortController()
    const reason = new Error('cancelled by caller')
    controller.abort(reason)
    const wrapped = withModelRetry(
      fakeModel({
        generate: async () => {
          calls++
          throw new Error('provider must not run')
        },
      }),
      { baseMs: 0 },
    )

    await expect(wrapped.generate({ ...options, abortSignal: controller.signal })).rejects.toBe(
      reason,
    )
    expect(calls).toBe(0)
  })

  it('does not retry when the request signal aborts during generation', async () => {
    let calls = 0
    const controller = new AbortController()
    const reason = new Error('cancelled during generation')
    const wrapped = withModelRetry(
      fakeModel({
        generate: async () => {
          calls++
          controller.abort(reason)
          throw new Error('provider error 503')
        },
      }),
      { baseMs: 0, maxAttempts: 3 },
    )

    await expect(wrapped.generate({ ...options, abortSignal: controller.signal })).rejects.toBe(
      reason,
    )
    expect(calls).toBe(1)
  })

  it('forwards wrapper cancellation to the underlying stream', async () => {
    const controller = new AbortController()
    let received: AbortSignal | undefined
    const wrapped = withModelRetry(
      fakeModel({
        stream: async function* (request) {
          received = request.abortSignal
          yield { type: 'text-delta', delta: 'first' }
        },
      }),
      { abortSignal: controller.signal },
    )

    const iterator = wrapped.stream(options)[Symbol.asyncIterator]()
    await iterator.next()
    controller.abort()
    expect(received?.aborted).toBe(true)
    await iterator.return?.()
  })

  it('retries a 429 then succeeds', async () => {
    let calls = 0
    const wrapped = withModelRetry(
      fakeModel({
        generate: async () => {
          calls++
          if (calls === 1) throw new Error('OpenAI API error: 429 rate limit')
          return {
            content: 'finally',
            toolCalls: [],
            usage: { input: 1, output: 1, total: 2 },
            finishReason: 'stop' as const,
            model: 'm',
            provider: 'test',
          }
        },
      }),
      { baseMs: 1, maxAttempts: 3 },
    )
    const result = await wrapped.generate(options)
    expect(result.content).toBe('finally')
    expect(calls).toBe(2)
  })

  it('normalizes the final error after exhausting attempts', async () => {
    const wrapped = withModelRetry(
      fakeModel({
        generate: async () => {
          throw new Error('Vertex AI error: 401 unauthorized')
        },
      }),
      { baseMs: 1, maxAttempts: 2 },
    )
    await expect(wrapped.generate(options)).rejects.toThrow(NormalizedProviderError)
    await expect(wrapped.generate(options)).rejects.toMatchObject({
      code: ErrorCode.PROVIDER_AUTH_FAILED,
      kind: 'auth',
    })
  })

  it('does not retry non-retryable failures', async () => {
    let calls = 0
    const wrapped = withModelRetry(
      fakeModel({
        generate: async () => {
          calls++
          throw new Error('Anthropic API error 400: prompt is too long: 200000 tokens')
        },
      }),
      { baseMs: 1, maxAttempts: 5 },
    )
    await expect(wrapped.generate(options)).rejects.toMatchObject({
      code: ErrorCode.CONTEXT_OVERFLOW,
    })
    expect(calls).toBe(1)
  })

  it('retries a stream that fails before the first chunk', async () => {
    let calls = 0
    const wrapped = withModelRetry(
      fakeModel({
        stream: async function* () {
          calls++
          if (calls === 1) throw new Error('OpenAI API error: 429 slow down')
          yield { type: 'text-delta', delta: 'recovered' } as StreamChunk
        },
      }),
      { baseMs: 1, maxAttempts: 3 },
    )
    const chunks: string[] = []
    for await (const chunk of wrapped.stream(options)) {
      if (chunk.type === 'text-delta') chunks.push(chunk.delta)
    }
    expect(chunks).toEqual(['recovered'])
    expect(calls).toBe(2)
  })

  it('does not restart a stream after mid-stream failure', async () => {
    let calls = 0
    const wrapped = withModelRetry(
      fakeModel({
        stream: async function* () {
          calls++
          yield { type: 'text-delta', delta: 'partial' } as StreamChunk
          throw new Error('OpenAI API error: 500 internal')
        },
      }),
      { baseMs: 1, maxAttempts: 3 },
    )
    const chunks: string[] = []
    let failure: unknown
    try {
      for await (const chunk of wrapped.stream(options)) {
        if (chunk.type === 'text-delta') chunks.push(chunk.delta)
      }
    } catch (error) {
      failure = error
    }
    expect(chunks).toEqual(['partial'])
    expect(failure).toBeInstanceOf(NormalizedProviderError)
    expect(calls).toBe(1)
  })

  it('respects a custom retryOn predicate', async () => {
    let calls = 0
    const wrapped = withModelRetry(
      fakeModel({
        generate: async () => {
          calls++
          throw new Error('boom')
        },
      }),
      {
        baseMs: 1,
        maxAttempts: 3,
        retryOn: () => calls < 2,
      },
    )
    await expect(wrapped.generate(options)).rejects.toThrow()
    expect(calls).toBe(2)
  })

  it('advertises the underlying capabilities', () => {
    const wrapped = withModelRetry(fakeModel({}))
    expect(wrapped.provider).toBe('test')
    expect(wrapped.supportsFeature('text')).toBe(true)
    expect(wrapped.getCapabilities().maxTokens).toBe(1000)
  })

  it('normalized errors pass the retry predicate used by withModelRetry', () => {
    const normalized = normalizeProviderError(new Error('X error: 503 unavailable'), 'x')
    expect(isRetryable(normalized)).toBe(true)
  })
})
