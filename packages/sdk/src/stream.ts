import { ForgeTransportError } from './errors'
import { SSEParser, parseSSEData } from './sse'
import type { ParsedSSEFrame, SSEEventName, SSEEventPayload } from './types'

/** Callback-style SSE handler. Return `false` to stop the stream. */
export type SSEFrameHandler = (frame: {
  event: SSEEventName
  data: SSEEventPayload
  raw: ParsedSSEFrame
}) => boolean | undefined

export interface StreamOptions {
  sessionIds?: string[]
  headers?: Record<string, string>
  signal?: AbortSignal
  fetchImpl?: typeof fetch
  handler?: SSEFrameHandler
}

/**
 * Open the SSE stream at `/api/sse/events` and drive it.
 *
 * Two consumption modes:
 *  - `for await (const frame of streamSSE(...)) { ... }`  (no handler)
 *  - `streamSSE(..., { handler: (f) => ... })`            (callback-driven)
 *
 * With a handler, returns a completion promise; await it to observe fetch,
 * read, or handler errors. Ignoring it keeps the background-pump behavior.
 * Without a handler, returns an `AsyncGenerator`.
 *
 * Cancel the connection with `AbortSignal` (passed in `opts.signal`) or by
 * returning `false` from the handler.
 */
export function streamSSE(
  baseUrl: string,
  options: StreamOptions & { handler: SSEFrameHandler },
): Promise<void>
export function streamSSE(
  baseUrl: string,
  options?: StreamOptions & { handler?: undefined },
): AsyncGenerator<ParsedSSEFrame, void, undefined>
export function streamSSE(
  baseUrl: string,
  options: StreamOptions,
): AsyncGenerator<ParsedSSEFrame, void, undefined> | Promise<void>
export function streamSSE(
  baseUrl: string,
  options: StreamOptions = {},
): AsyncGenerator<ParsedSSEFrame, void, undefined> | Promise<void> {
  if (options.handler) {
    const completion = pumpStream(baseUrl, options, options.handler)
    // Observe detached pumps without changing the promise callers can await.
    void completion.catch(() => {})
    return completion
  }
  return iteratorStream(baseUrl, options)
}

async function pumpStream(
  baseUrl: string,
  options: StreamOptions,
  handler: SSEFrameHandler,
): Promise<void> {
  for await (const frame of iteratorStream(baseUrl, options)) {
    const stop = handler({
      event: frame.event as SSEEventName,
      data: parseSSEData(String(frame.data)) as SSEEventPayload,
      raw: frame,
    })
    if (stop === false) return
  }
}

async function* iteratorStream(
  baseUrl: string,
  options: StreamOptions,
): AsyncGenerator<ParsedSSEFrame, void, undefined> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch
  if (typeof fetchImpl !== 'function') {
    throw new ForgeTransportError('No fetch implementation available')
  }

  const url = new URL('api/sse/events', ensureTrailingSlash(baseUrl))
  if (options.sessionIds && options.sessionIds.length > 0) {
    url.searchParams.set('sessions', options.sessionIds.join(','))
  }

  const res = await fetchImpl(url.toString(), {
    method: 'GET',
    headers: { Accept: 'text/event-stream', ...(options.headers ?? {}) },
    signal: options.signal,
  })

  if (!res.ok || !res.body) {
    let body: unknown
    try {
      body = await res.json()
    } catch {
      body = { error: { code: 'SSE_OPEN_FAILED', message: res.statusText } }
    }
    throw new ForgeTransportError(`Failed to open SSE stream: ${res.status}`, {
      status: res.status,
      body,
    })
  }

  // Bun's Hono app can return a ReadableStream<string> (server-internal) or
  // a real network ReadableStream<Uint8Array>. Handle both transparently.
  const body = res.body as ReadableStream<Uint8Array | string>
  const reader = body.getReader()
  const decoder = new TextDecoder()
  const parser = new SSEParser()
  let cancelled = false
  let completed = false
  let cancellation: Promise<void> | undefined
  const cancelReader = () => {
    // Cleanup errors must not mask read/handler errors or become unhandled.
    cancellation ??= reader.cancel().catch(() => {})
    return cancellation
  }
  const onAbort = () => {
    cancelled = true
    void cancelReader()
  }
  options.signal?.addEventListener('abort', onAbort, { once: true })
  if (options.signal?.aborted) onAbort()

  try {
    while (!cancelled) {
      const { value, done } = await reader.read()
      if (done) {
        completed = true
        break
      }
      const text = typeof value === 'string' ? value : decoder.decode(value, { stream: true })
      for (const frame of parser.push(text)) {
        if (cancelled) return
        yield frame
      }
    }
    if (!cancelled) {
      for (const frame of [...parser.push(decoder.decode()), ...parser.end()]) {
        if (cancelled) return
        yield frame
      }
    }
  } finally {
    options.signal?.removeEventListener('abort', onAbort)
    if (!completed) await cancelReader()
    else if (cancellation) await cancellation
    try {
      reader.releaseLock()
    } catch {
      // Already released.
    }
  }
}

function ensureTrailingSlash(url: string): string {
  return url.endsWith('/') ? url : `${url}/`
}
