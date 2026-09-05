import type { ForgeErrorResponse } from './types'

/**
 * Error thrown by {@link ForgeClient} when the server returns a non-2xx
 * response. Mirrors the `ErrorResponse` envelope produced by the Hono
 * middleware (see {@link import('@forge/server').ForgeErrorResponse}).
 */
export class ForgeApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details: unknown

  constructor(
    status: number,
    body: ForgeErrorResponse | { error: { code: string; message: string; details?: unknown } },
  ) {
    const err = body.error
    super(`[${status}] ${err.code}: ${err.message}`)
    this.name = 'ForgeApiError'
    this.status = status
    this.code = err.code
    this.details = err.details
  }
}

/** An unexpected failure (network error, malformed body, etc.). */
export class ForgeTransportError extends Error {
  readonly cause: unknown
  constructor(message: string, cause?: unknown) {
    super(message)
    this.name = 'ForgeTransportError'
    this.cause = cause
  }
}
