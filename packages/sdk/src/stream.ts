import type { ParsedSSEFrame, SSEEventName, SSEEventPayload } from './types'
import { ForgeTransportError } from './errors'
import { parseSSEData, SSEParser } from './sse'

/** Callback-style SSE handler. Return `false` to stop the stream. */
export type SSEFrameHandler = (frame: { event: SSEEventName; data: SSEEventPayload; raw: ParsedSSEFrame }) => boolean | undefined

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
 * With a handler, the function returns `void` after kicking off the
 * background pump. Without a handler, it returns an `AsyncGenerator`.
 *
 * Cancel the connection with `AbortSignal` (passed in `opts.signal`) or by
 * returning `false` from the handler.
 */
export function streamSSE(baseUrl: string, options: StreamOptions = {}): AsyncGenerator<ParsedSSEFrame, void, undefined> | void {
  if (options.handler) {
    void pumpStream(baseUrl, options, options.handler)
    return
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
    throw new ForgeTransportError(`Failed to open SSE stream: ${res.status}`, { status: res.status, body })
  }

  // Bun's Hono app can return a ReadableStream<string> (server-internal) or
  // a real network ReadableStream<Uint8Array>. Handle both transparently.
  const body = res.body as ReadableStream<Uint8Array | string>
  const reader = body.getReader()
  const decoder = new TextDecoder()
  const parser = new SSEParser()
  let cancelled = false
  options.signal?.addEventListener('abort', () => {
    cancelled = true
    try {
      reader.cancel()
    } catch {
      // Ignore — already cancelled.
    }
  })

  try {
    while (!cancelled) {
      const { value, done } = await reader.read()
      if (done) break
      const text = typeof value === 'string' ? value : decoder.decode(value, { stream: true })
      for (const frame of parser.push(text)) yield frame
    }
    for (const frame of parser.end()) yield frame
  } finally {
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