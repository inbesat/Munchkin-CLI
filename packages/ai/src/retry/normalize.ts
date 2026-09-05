import { ErrorCode, ProviderError, isForgeError } from '@forge/core'
import { type AuthFlowError, isAuthFlowError } from '../auth/errors'

/**
 * Phase 25: normalize raw provider failures into the `@forge/core` ForgeError
 * hierarchy so the agent loop can act on meaning instead of string formats:
 * rate limits auto-retry, context overruns trigger compaction, auth failures
 * prompt re-login, and every error carries a recovery hint.
 */

export type ProviderErrorKind =
  | 'auth'
  | 'rate'
  | 'overloaded'
  | 'context'
  | 'model'
  | 'refusal'
  | 'timeout'
  | 'stream'
  | 'request'
  | 'unknown'

/** Structured HTTP failure thrown by provider layers that have a `status`. */
export class ProviderHttpError extends Error {
  readonly provider: string
  readonly status: number
  readonly statusText?: string
  readonly bodyText: string
  readonly retryAfterSeconds?: number

  constructor(opts: {
    provider: string
    status: number
    statusText?: string
    bodyText: string
    retryAfterSeconds?: number
  }) {
    super(
      `${opts.provider} API error ${opts.status}: ${opts.bodyText || opts.statusText || 'no body'}`,
    )
    this.name = 'ProviderHttpError'
    this.provider = opts.provider
    this.status = opts.status
    this.statusText = opts.statusText
    this.bodyText = opts.bodyText
    this.retryAfterSeconds = opts.retryAfterSeconds
  }
}

/** Normalized provider failure — a `ProviderError` subtype with machine-readable kind. */
export class NormalizedProviderError extends ProviderError {
  readonly kind: ProviderErrorKind
  readonly status?: number
  readonly retryAfterSeconds?: number

  constructor(
    code: (typeof ErrorCode)[keyof typeof ErrorCode],
    message: string,
    provider: string,
    opts: {
      kind: ProviderErrorKind
      status?: number
      retryAfterSeconds?: number
      severity?: 'info' | 'warn' | 'error' | 'fatal'
      cause?: unknown
    },
  ) {
    super(code, message, provider, { severity: opts.severity, cause: opts.cause })
    this.name = 'NormalizedProviderError'
    this.kind = opts.kind
    this.status = opts.status
    this.retryAfterSeconds = opts.retryAfterSeconds
  }

  get delayMs(): number | undefined {
    return this.retryAfterSeconds !== undefined ? this.retryAfterSeconds * 1000 : undefined
  }
}

// ─── Heuristics ─────────────────────────────────────────────────────

const CONTEXT_LENGTH_PATTERNS: readonly RegExp[] = [
  /context.?length/i,
  /context length exceeded/i,
  /context_window/i,
  /maximum context/i,
  /max context/i,
  /too many tokens/i,
  /token limit/i,
  /exceed(s|ed)?.*token/i,
  /prompt is too long/i,
  /input is too long/i,
  /reduce the (length|prompt|number of tokens)/i,
  /maximum content length/i,
  /context_length_exceeded/i,
]

const REFUSAL_PATTERNS: readonly RegExp[] = [
  /refus(e|ed|al)/i,
  /content.*policy/i,
  /output.*filtered/i,
  /safety reason/i,
]

const MODEL_NOT_FOUND_PATTERNS: readonly RegExp[] = [
  /model.*not found/i,
  /unknown model/i,
  /model.*does not exist/i,
  /model.*not supported/i,
  /not a model/i,
]

export function isContextLengthError(text: string): boolean {
  return CONTEXT_LENGTH_PATTERNS.some((re) => re.test(text))
}

export function isContentRefusal(text: string): boolean {
  return REFUSAL_PATTERNS.some((re) => re.test(text))
}

export function isModelNotFound(text: string): boolean {
  return MODEL_NOT_FOUND_PATTERNS.some((re) => re.test(text))
}

// ─── Classification ─────────────────────────────────────────────────

export interface HttpClassification {
  code: (typeof ErrorCode)[keyof typeof ErrorCode]
  kind: ProviderErrorKind
  severity: 'info' | 'warn' | 'error' | 'fatal'
}

/**
 * Map an HTTP status + provider error body onto a ForgeError code.
 * 400 is disambiguated by body heuristics (context vs unknown model vs the rest).
 */
export function classifyHttpStatus(status: number, bodyText = ''): HttpClassification {
  switch (status) {
    case 400:
    case 422:
      if (isContextLengthError(bodyText)) {
        return { code: ErrorCode.CONTEXT_OVERFLOW, kind: 'context', severity: 'warn' }
      }
      if (isModelNotFound(bodyText)) {
        return { code: ErrorCode.PROVIDER_INVALID_MODEL, kind: 'model', severity: 'error' }
      }
      return { code: ErrorCode.PROVIDER_REQUEST_FAILED, kind: 'request', severity: 'error' }
    case 401:
    case 403:
      return { code: ErrorCode.PROVIDER_AUTH_FAILED, kind: 'auth', severity: 'warn' }
    case 404:
      if (isModelNotFound(bodyText)) {
        return { code: ErrorCode.PROVIDER_INVALID_MODEL, kind: 'model', severity: 'error' }
      }
      return { code: ErrorCode.PROVIDER_REQUEST_FAILED, kind: 'request', severity: 'error' }
    case 408:
      return { code: ErrorCode.PROVIDER_TIMEOUT, kind: 'timeout', severity: 'error' }
    case 429:
      return { code: ErrorCode.PROVIDER_RATE_LIMITED, kind: 'rate', severity: 'warn' }
    case 503:
      return { code: ErrorCode.PROVIDER_OVERLOADED, kind: 'overloaded', severity: 'warn' }
    case 502:
    case 504:
      return { code: ErrorCode.PROVIDER_TIMEOUT, kind: 'timeout', severity: 'error' }
    default:
      if (status >= 500) {
        return { code: ErrorCode.PROVIDER_REQUEST_FAILED, kind: 'request', severity: 'error' }
      }
      return { code: ErrorCode.PROVIDER_REQUEST_FAILED, kind: 'request', severity: 'error' }
  }
}

const RETRYABLE_CODES = new Set<(typeof ErrorCode)[keyof typeof ErrorCode]>([
  ErrorCode.PROVIDER_RATE_LIMITED,
  ErrorCode.PROVIDER_OVERLOADED,
  ErrorCode.PROVIDER_TIMEOUT,
])

/** True when a normalized error is worth retrying with backoff. */
export function isRetryable(error: unknown): boolean {
  if (!(error instanceof NormalizedProviderError)) return false
  if (RETRYABLE_CODES.has(error.code)) return true
  if (error.kind === 'timeout') return true
  return error.status !== undefined && error.status >= 500 && error.status !== 501
}

/**
 * Parse a `Retry-After` header: either delta-seconds or an HTTP-date.
 * Returns `undefined` when absent/unparseable.
 */
export function retryAfterSecondsFromHeader(headers: Headers): number | undefined {
  const raw = headers.get('retry-after')
  if (!raw) return undefined
  const trimmed = raw.trim()
  if (/^\d+$/.test(trimmed)) {
    return Math.max(0, Number(trimmed))
  }
  const then = Date.parse(trimmed)
  if (Number.isNaN(then)) return undefined
  return Math.max(0, Math.round((then - Date.now()) / 1000))
}

function kindForCode(code: (typeof ErrorCode)[keyof typeof ErrorCode]): ProviderErrorKind {
  switch (code) {
    case ErrorCode.PROVIDER_AUTH_FAILED:
      return 'auth'
    case ErrorCode.PROVIDER_RATE_LIMITED:
      return 'rate'
    case ErrorCode.PROVIDER_OVERLOADED:
      return 'overloaded'
    case ErrorCode.PROVIDER_INVALID_MODEL:
      return 'model'
    case ErrorCode.PROVIDER_TIMEOUT:
      return 'timeout'
    case ErrorCode.CONTEXT_OVERFLOW:
    case ErrorCode.CONTEXT_TOKEN_LIMIT:
      return 'context'
    case ErrorCode.CANCELLED:
      return 'request'
    case ErrorCode.PROVIDER_STREAM_ERROR:
      return 'stream'
    default:
      return 'request'
  }
}

// ─── Auth cleanup (Phase 24 -> 25 bridge) ───────────────────────────

function classifyAuthError(error: AuthFlowError): HttpClassification {
  switch (error.code) {
    case 'not_authenticated':
    case 'token_expired':
    case 'refresh_failed':
    case 'authorization_denied':
      return { code: ErrorCode.PROVIDER_AUTH_FAILED, kind: 'auth', severity: 'warn' }
    case 'callback_timeout':
    case 'device_flow_timeout':
      return { code: ErrorCode.PROVIDER_TIMEOUT, kind: 'timeout', severity: 'error' }
    default:
      return { code: ErrorCode.PROVIDER_REQUEST_FAILED, kind: 'request', severity: 'error' }
  }
}

function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') return true
  const raw = error as { name?: unknown; code?: unknown; type?: unknown } | null
  return raw?.name === 'AbortError' || raw?.code === 'ABORT_ERR' || raw?.type === 'aborted'
}

const NETWORK_PATTERNS: readonly RegExp[] = [
  /fetch failed/i,
  /ECONNREFUSED/i,
  /ENOTFOUND/i,
  /EAI_AGAIN/i,
  /network.*unreachable/i,
  /socket hang up/i,
  /UND_ERR/i,
  /connection (reset|closed|refused)/i,
]

function parseStatusFromMessage(message: string): number | undefined {
  const match = /\b([45]\d{2})\b/.exec(message)
  return match ? Number(match[1]) : undefined
}

/**
 * Normalize an arbitrary thrown value into a `NormalizedProviderError`.
 * Handles: ProviderHttpError, AuthFlowError, any ForgeError, aborts, plain
 * adapter Errors (status parsed from the message), and network failures.
 */
export function normalizeProviderError(error: unknown, provider: string): NormalizedProviderError {
  if (error instanceof NormalizedProviderError) return error

  if (error instanceof ProviderHttpError) {
    const cls = classifyHttpStatus(error.status, error.bodyText)
    return new NormalizedProviderError(cls.code, error.message, provider, {
      kind: cls.kind,
      severity: cls.severity,
      status: error.status,
      retryAfterSeconds: error.retryAfterSeconds,
      cause: error,
    })
  }

  if (isAuthFlowError(error)) {
    const cls = classifyAuthError(error)
    const message =
      error.code === 'not_authenticated'
        ? `${provider} is not authenticated. Run: forge auth login ${provider}`
        : error.message
    return new NormalizedProviderError(cls.code, message, provider, {
      kind: cls.kind,
      severity: cls.severity,
      cause: error,
    })
  }

  if (isAbortError(error)) {
    return new NormalizedProviderError(
      ErrorCode.CANCELLED,
      'The provider request was aborted',
      provider,
      {
        kind: 'request',
        severity: 'info',
        cause: error,
      },
    )
  }

  if (isForgeError(error)) {
    return new NormalizedProviderError(error.code, error.message, provider, {
      kind: kindForCode(error.code),
      severity: error.severity,
      cause: error,
    })
  }

  const message = error instanceof Error ? error.message : String(error)
  const status = parseStatusFromMessage(message)

  if (status !== undefined) {
    const cls = classifyHttpStatus(status, message)
    if (
      cls.code === ErrorCode.PROVIDER_REQUEST_FAILED &&
      status >= 400 &&
      status < 500 &&
      isContentRefusal(message)
    ) {
      return new NormalizedProviderError(cls.code, message, provider, {
        kind: 'refusal',
        severity: 'error',
        status,
        cause: error,
      })
    }
    return new NormalizedProviderError(cls.code, message, provider, {
      kind: cls.kind,
      severity: cls.severity,
      status,
      cause: error,
    })
  }

  if (isContextLengthError(message)) {
    return new NormalizedProviderError(ErrorCode.CONTEXT_OVERFLOW, message, provider, {
      kind: 'context',
      severity: 'warn',
      cause: error,
    })
  }

  if (isContentRefusal(message)) {
    return new NormalizedProviderError(ErrorCode.PROVIDER_REQUEST_FAILED, message, provider, {
      kind: 'refusal',
      severity: 'error',
      cause: error,
    })
  }

  if (NETWORK_PATTERNS.some((re) => re.test(message))) {
    return new NormalizedProviderError(ErrorCode.PROVIDER_TIMEOUT, message, provider, {
      kind: 'timeout',
      severity: 'error',
      cause: error,
    })
  }

  if (message.startsWith('TimeoutError') || /timed? ?out|timed out/i.test(message)) {
    return new NormalizedProviderError(ErrorCode.PROVIDER_TIMEOUT, message, provider, {
      kind: 'timeout',
      severity: 'error',
      cause: error,
    })
  }

  return new NormalizedProviderError(ErrorCode.PROVIDER_REQUEST_FAILED, message, provider, {
    kind: 'unknown',
    severity: 'error',
    cause: error,
  })
}
