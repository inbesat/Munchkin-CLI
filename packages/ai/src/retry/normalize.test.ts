import { describe, expect, it } from 'bun:test'
import { ErrorCode, ProviderError } from '@forge/core'
import { AuthFlowError } from '../auth/errors'
import {
  NormalizedProviderError,
  ProviderHttpError,
  classifyHttpStatus,
  isContentRefusal,
  isContextLengthError,
  isModelNotFound,
  isRetryable,
  normalizeProviderError,
  retryAfterSecondsFromHeader,
} from './normalize'

describe('classifyHttpStatus', () => {
  it('maps auth failures', () => {
    for (const status of [401, 403]) {
      const cls = classifyHttpStatus(status)
      expect(cls.code).toBe(ErrorCode.PROVIDER_AUTH_FAILED)
      expect(cls.kind).toBe('auth')
    }
  })

  it('maps rate limits and overload', () => {
    expect(classifyHttpStatus(429).code).toBe(ErrorCode.PROVIDER_RATE_LIMITED)
    expect(classifyHttpStatus(503).code).toBe(ErrorCode.PROVIDER_OVERLOADED)
    expect(classifyHttpStatus(500).code).toBe(ErrorCode.PROVIDER_REQUEST_FAILED)
  })

  it('maps timeouts', () => {
    for (const status of [408, 502, 504]) {
      expect(classifyHttpStatus(status).code).toBe(ErrorCode.PROVIDER_TIMEOUT)
    }
  })

  it('detects context length on 400', () => {
    const cls = classifyHttpStatus(400, "This model's maximum context length is 128000 tokens")
    expect(cls.code).toBe(ErrorCode.CONTEXT_OVERFLOW)
    expect(cls.kind).toBe('context')
  })

  it('detects unknown model on 400/404', () => {
    expect(classifyHttpStatus(400, 'The model foobar does not exist').code).toBe(
      ErrorCode.PROVIDER_INVALID_MODEL,
    )
    expect(classifyHttpStatus(404, 'Unknown model').code).toBe(ErrorCode.PROVIDER_INVALID_MODEL)
  })

  it('falls back to a generic request failure', () => {
    expect(classifyHttpStatus(400, 'something else').code).toBe(ErrorCode.PROVIDER_REQUEST_FAILED)
    expect(classifyHttpStatus(418).code).toBe(ErrorCode.PROVIDER_REQUEST_FAILED)
  })
})

describe('heuristics', () => {
  it('recognizes context overflow phrasing', () => {
    for (const text of [
      'prompt is too long: 200000 tokens',
      'maximum context length is 128000 tokens',
      'context_length_exceeded',
      'the request exceeds the maximum allowed tokens',
      'reduce the prompt',
    ]) {
      expect(isContextLengthError(text)).toBe(true)
    }
  })

  it('recognizes refusals', () => {
    expect(isContentRefusal('The model refused to answer')).toBe(true)
    expect(isContentRefusal('content policy')).toBe(true)
  })

  it('recognizes unknown models', () => {
    expect(isModelNotFound('model does not exist')).toBe(true)
    expect(isModelNotFound('The model gpt-9 is not supported')).toBe(true)
  })
})

describe('ProviderHttpError', () => {
  it('carries status, body, and retry-after', () => {
    const err = new ProviderHttpError({
      provider: 'anthropic',
      status: 429,
      bodyText: 'rate limit hit',
      retryAfterSeconds: 30,
    })
    expect(err.message).toContain('429')
    expect(err.retryAfterSeconds).toBe(30)
  })
})

describe('retryAfterSecondsFromHeader', () => {
  it('parses delta-seconds', () => {
    expect(retryAfterSecondsFromHeader(new Headers({ 'retry-after': '120' }))).toBe(120)
  })

  it('returns undefined when absent or malformed', () => {
    expect(retryAfterSecondsFromHeader(new Headers())).toBeUndefined()
    expect(retryAfterSecondsFromHeader(new Headers({ 'retry-after': 'later' }))).toBeUndefined()
  })
})

describe('normalizeProviderError', () => {
  it('keeps already-normalized errors', () => {
    const normalized = new NormalizedProviderError(ErrorCode.PROVIDER_RATE_LIMITED, 'x', 'openai', {
      kind: 'rate',
    })
    expect(normalizeProviderError(normalized, 'openai')).toBe(normalized)
  })

  it('classifies ProviderHttpError', () => {
    const normalized = normalizeProviderError(
      new ProviderHttpError({ provider: 'o', status: 429, bodyText: 'too many' }),
      'o',
    )
    expect(normalized.code).toBe(ErrorCode.PROVIDER_RATE_LIMITED)
    expect(normalized.kind).toBe('rate')
    expect(normalized.recovery).toContain('Rate limited')
  })

  it('classifies plain adapter Errors by status in the message', () => {
    const normalized = normalizeProviderError(
      new Error('OpenAI API error: 401 Invalid API key - check your key'),
      'openai',
    )
    expect(normalized.code).toBe(ErrorCode.PROVIDER_AUTH_FAILED)
    expect(normalized.kind).toBe('auth')
  })

  it('detects context overflow from an Anthropic-style adapter error', () => {
    const normalized = normalizeProviderError(
      new Error('Anthropic API error 400: prompt is too long: 200000 tokens'),
      'anthropic',
    )
    expect(normalized.code).toBe(ErrorCode.CONTEXT_OVERFLOW)
    expect(normalized.kind).toBe('context')
  })

  it('maps AuthFlowError to ForgeError', () => {
    const normalized = normalizeProviderError(
      new AuthFlowError('claude', 'not_authenticated', 'no tokens'),
      'claude',
    )
    expect(normalized).toBeInstanceOf(ProviderError)
    expect(normalized.code).toBe(ErrorCode.PROVIDER_AUTH_FAILED)
    expect(normalized.message).toContain('forge auth login claude')
  })

  it('maps auth timeouts to provider timeouts', () => {
    const normalized = normalizeProviderError(
      new AuthFlowError('chatgpt', 'device_flow_timeout', 'ran out of time'),
      'chatgpt',
    )
    expect(normalized.code).toBe(ErrorCode.PROVIDER_TIMEOUT)
  })

  it('maps aborts to CANCELLED', () => {
    const normalized = normalizeProviderError(
      new DOMException('The operation was aborted.', 'AbortError'),
      'any',
    )
    expect(normalized.code).toBe(ErrorCode.CANCELLED)
  })

  it('wraps bare network failures as retryable timeouts', () => {
    const normalized = normalizeProviderError(
      new Error('fetch failed: getaddrinfo ENOTFOUND api.anthropic.com'),
      'anthropic',
    )
    expect(normalized.kind).toBe('timeout')
    expect(normalized.code).toBe(ErrorCode.PROVIDER_TIMEOUT)
    expect(isRetryable(normalized)).toBe(true)
  })

  it('passes existing ForgeError codes through', () => {
    const forge = new ProviderError(ErrorCode.PROVIDER_OVERLOADED, 'busy', 'vertex')
    const normalized = normalizeProviderError(forge, 'vertex')
    expect(normalized.code).toBe(ErrorCode.PROVIDER_OVERLOADED)
    expect(normalized.cause).toBe(forge)
  })
})

describe('isRetryable', () => {
  it('retries rate limits, overload, timeouts, and remote 5xx', () => {
    const cases: Array<[NormalizedProviderError, boolean]> = [
      [mk(ErrorCode.PROVIDER_RATE_LIMITED, 'rate', 429), true],
      [mk(ErrorCode.PROVIDER_OVERLOADED, 'overloaded', 503), true],
      [mk(ErrorCode.PROVIDER_TIMEOUT, 'timeout', 504), true],
      [mk(ErrorCode.PROVIDER_REQUEST_FAILED, 'request', 500), true],
      [mk(ErrorCode.PROVIDER_REQUEST_FAILED, 'request', 400), false],
      [mk(ErrorCode.PROVIDER_AUTH_FAILED, 'auth', 401), false],
      [mk(ErrorCode.CONTEXT_OVERFLOW, 'context', 400), false],
    ]
    for (const [err, expected] of cases) {
      expect(isRetryable(err)).toBe(expected)
    }
  })

  function mk(
    code: (typeof ErrorCode)[keyof typeof ErrorCode],
    kind: NormalizedProviderError['kind'],
    status: number,
  ): NormalizedProviderError {
    return new NormalizedProviderError(code, 'x', 'prov', { kind, status })
  }
})
