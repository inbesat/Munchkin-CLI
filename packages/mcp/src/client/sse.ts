/**
 * SSE transport (Phase 118, legacy MCP HTTP + SSE): the server→client
 * downlink is a `text/event-stream` (an `endpoint` event carries the POST
 * path, `message` events carry JSON-RPC); client→server messages are POSTs.
 * Same request(id)/notification semantics as the Phase-117 stdio transport.
 * No-throw: aborted streams and non-2xx posts resolve {ok:false, error}.
 */

import type { JsonRpcNotification, JsonRpcResponse } from './stdio'

export interface McpSseOptions {
  /** Base URL of the remote MCP server (the SSE endpoint). */
  url: string
  headers?: Record<string, string>
  /** Per-request timeout (default 30s). */
  requestTimeoutMs?: number
}

export interface SseEvent {
  event: string
  data: string
}

/** Parse a buffered SSE stream chunk into complete events. */
export function parseSseEvents(buffer: string): { events: SseEvent[]; rest: string } {
  const events: SseEvent[] = []
  let rest = buffer
  let blockEnd = rest.indexOf('\n\n')
  while (blockEnd !== -1) {
    const block = rest.slice(0, blockEnd)
    rest = rest.slice(blockEnd + 2)
    let event = 'message'
    const dataLines: string[] = []
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) event = line.slice('event:'.length).trim()
      else if (line.startsWith('data:')) dataLines.push(line.slice('data:'.length).trimStart())
    }
    if (dataLines.length > 0) events.push({ event, data: dataLines.join('\n') })
    blockEnd = rest.indexOf('\n\n')
  }
  return { events, rest }
}

export class McpSseTransport {
  private readonly options: McpSseOptions
  private postUrl: string | null = null
  private nextId = 1
  private readonly pending = new Map<
    number,
    {
      resolve: (r: { ok: true; result: unknown } | { ok: false; error: string }) => void
      timer: ReturnType<typeof setTimeout>
    }
  >()
  private readonly notificationHandlers = new Set<(n: JsonRpcNotification) => void>()
  private abort: AbortController | null = null
  private streamError: string | null = null

  constructor(options: McpSseOptions) {
    this.options = options
  }

  get connected(): boolean {
    return this.postUrl !== null && this.abort !== null
  }

  stderrTail(): string[] {
    return this.streamError !== null ? [this.streamError] : []
  }

  onNotification(handler: (n: JsonRpcNotification) => void): () => void {
    this.notificationHandlers.add(handler)
    return () => this.notificationHandlers.delete(handler)
  }

  /** Open the SSE downlink; resolves once the `endpoint` event arrives. */
  async open(): Promise<{ ok: boolean; error?: string }> {
    if (this.connected) return { ok: true }
    this.abort = new AbortController()
    const signal = this.abort.signal
    try {
      const response = await fetch(this.options.url, {
        headers: { accept: 'text/event-stream', ...this.options.headers },
        signal,
      })
      if (!response.ok || response.body === null) {
        this.abort = null
        return { ok: false, error: `SSE connect failed: ${response.status}` }
      }
      void this.readStream(response.body, signal)
      // Wait until the endpoint event arrives or the stream dies.
      const deadline = Date.now() + (this.options.requestTimeoutMs ?? 30_000)
      while (this.postUrl === null && this.streamError === null && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 25))
        if (signal.aborted) return { ok: false, error: 'SSE connect aborted' }
      }
      if (this.streamError !== null) return { ok: false, error: this.streamError }
      if (this.postUrl === null) {
        this.close()
        return { ok: false, error: 'server never sent the endpoint event' }
      }
      return { ok: true }
    } catch (error) {
      this.streamError = error instanceof Error ? error.message : String(error)
      return { ok: false, error: this.streamError }
    }
  }

  private async readStream(body: ReadableStream<Uint8Array>, signal: AbortSignal): Promise<void> {
    const decoder = new TextDecoder()
    let buffer = ''
    const reader = body.getReader()
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done === true) break
        buffer += decoder.decode(value, { stream: true })
        const parsed = parseSseEvents(buffer)
        buffer = parsed.rest
        for (const event of parsed.events) this.handleEvent(event)
      }
    } catch (error) {
      if (!signal.aborted) {
        this.streamError = error instanceof Error ? error.message : String(error)
      }
    }
  }

  private handleEvent(event: SseEvent): void {
    if (event.event === 'endpoint') {
      const base = new URL(this.options.url)
      this.postUrl = event.data.startsWith('http')
        ? event.data
        : `${base.origin}${event.data.startsWith('/') ? '' : '/'}${event.data}`
      return
    }
    let message: JsonRpcResponse | JsonRpcNotification
    try {
      message = JSON.parse(event.data) as JsonRpcResponse | JsonRpcNotification
    } catch {
      this.streamError = 'unparseable SSE message'
      return
    }
    if ('id' in message && message.id !== null && message.id !== undefined) {
      const pending = this.pending.get(message.id as number)
      if (pending === undefined) return
      this.pending.delete(message.id as number)
      clearTimeout(pending.timer)
      const response = message as JsonRpcResponse
      if (response.error !== undefined) {
        pending.resolve({ ok: false, error: `${response.error.code}: ${response.error.message}` })
      } else {
        pending.resolve({ ok: true, result: response.result })
      }
    } else if ('method' in message) {
      for (const handler of this.notificationHandlers) handler(message as JsonRpcNotification)
    }
  }

  /** Send a JSON-RPC request; the response arrives on the SSE downlink. */
  async request(
    method: string,
    params?: unknown,
    timeoutMs?: number,
  ): Promise<{ ok: true; result: unknown } | { ok: false; error: string }> {
    if (this.postUrl === null || this.abort === null) {
      return { ok: false, error: 'SSE transport is not connected' }
    }
    const id = this.nextId++
    const timeout = timeoutMs ?? this.options.requestTimeoutMs ?? 30_000
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        resolve({ ok: false, error: `request '${method}' timed out after ${timeout}ms` })
      }, timeout)
      this.pending.set(id, { resolve, timer })
      void this.post({
        jsonrpc: '2.0',
        id,
        method,
        ...(params !== undefined ? { params } : {}),
      }).then((sent) => {
        if (!sent) {
          clearTimeout(timer)
          if (this.pending.delete(id))
            resolve({ ok: false, error: 'POST failed (connection dropped)' })
        }
      })
    })
  }

  async notify(method: string, params?: unknown): Promise<{ ok: boolean; error?: string }> {
    const sent = await this.post(
      params !== undefined ? { jsonrpc: '2.0', method, params } : { jsonrpc: '2.0', method },
    )
    return { ok: sent }
  }

  private async post(body: unknown): Promise<boolean> {
    if (this.postUrl === null) return false
    try {
      const response = await fetch(this.postUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...this.options.headers },
        body: JSON.stringify(body),
        signal: this.abort?.signal,
      })
      // Drain the response so the server's handler completes even when it
      // parses the request body lazily.
      try {
        await response.text()
      } catch {
        // aborted - fine
      }
      return response.status >= 200 && response.status < 500
    } catch {
      return false
    }
  }

  /** Abort the downlink; every pending request fails with the reason. */
  close(reason = 'SSE transport closed'): void {
    const hadPending = this.pending.size > 0
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer)
      pending.resolve({ ok: false, error: reason })
      this.pending.delete(id)
    }
    this.postUrl = null
    if (this.abort !== null) {
      this.abort.abort()
      this.abort = null
    }
    if (!hadPending) this.streamError ??= reason
  }
}
