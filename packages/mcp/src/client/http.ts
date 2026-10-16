/**
 * Streamable-HTTP transport (Phase 118): every JSON-RPC message is a POST
 * with `Accept: application/json, text/event-stream`; the server answers
 * either with a direct JSON body or an SSE body carrying the response.
 * The `Mcp-Session-Id` response header (initialize) is echoed on later
 * requests. No-throw: transport failures resolve {ok:false, error}.
 */

import { parseSseEvents } from './sse'
import type { JsonRpcNotification, JsonRpcResponse } from './stdio'

export interface McpStreamableHttpOptions {
  /** The server's single JSON-RPC endpoint. */
  url: string
  headers?: Record<string, string>
  requestTimeoutMs?: number
}

export class McpStreamableHttpTransport {
  private readonly options: McpStreamableHttpOptions
  private nextId = 1
  private sessionId: string | null = null
  private readonly notificationHandlers = new Set<(n: JsonRpcNotification) => void>()
  private lastError: string | null = null

  constructor(options: McpStreamableHttpOptions) {
    this.options = options
  }

  stderrTail(): string[] {
    return this.lastError !== null ? [this.lastError] : []
  }

  onNotification(handler: (n: JsonRpcNotification) => void): () => void {
    this.notificationHandlers.add(handler)
    return () => this.notificationHandlers.delete(handler)
  }

  /** Open = verify the endpoint answers (no separate handshake stream). */
  async open(): Promise<{ ok: boolean; error?: string }> {
    // Streamable HTTP is stateless per request; nothing to pre-negotiate.
    return { ok: true }
  }

  private async readSseBody(
    body: ReadableStream<Uint8Array>,
    id: number,
    method: string,
  ): Promise<{ ok: true; result: unknown } | { ok: false; error: string }> {
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
        for (const event of parsed.events) {
          let message: JsonRpcResponse | JsonRpcNotification
          try {
            message = JSON.parse(event.data) as JsonRpcResponse | JsonRpcNotification
          } catch {
            continue
          }
          if ('id' in message && message.id === id) {
            const response = message as JsonRpcResponse
            if (response.error !== undefined) {
              return { ok: false, error: `${response.error.code}: ${response.error.message}` }
            }
            return { ok: true, result: response.result }
          }
          if ('method' in message) {
            for (const handler of this.notificationHandlers) {
              handler(message as JsonRpcNotification)
            }
          }
        }
      }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
    return { ok: false, error: `stream ended before the '${method}' response arrived` }
  }

  async request(
    method: string,
    params?: unknown,
    timeoutMs?: number,
  ): Promise<{ ok: true; result: unknown } | { ok: false; error: string }> {
    const id = this.nextId++
    const timeout = timeoutMs ?? this.options.requestTimeoutMs ?? 30_000
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeout)
    try {
      const headers: Record<string, string> = {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        ...this.options.headers,
      }
      if (this.sessionId !== null) headers['mcp-session-id'] = this.sessionId
      const response = await fetch(this.options.url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id,
          method,
          ...(params !== undefined ? { params } : {}),
        }),
        signal: controller.signal,
      })

      const session = response.headers.get('mcp-session-id')
      if (session !== null) this.sessionId = session

      if (response.status === 202) return { ok: true, result: undefined }
      if (!response.ok) {
        return { ok: false, error: `HTTP ${response.status} for '${method}'` }
      }

      const contentType = response.headers.get('content-type') ?? ''
      if (contentType.includes('text/event-stream') && response.body !== null) {
        // The per-request timeout bounds stream waiting too.
        const timeoutPromise = new Promise<{ ok: false; error: string }>((resolve) => {
          timer.refresh()
          setTimeout(
            () => resolve({ ok: false, error: `request '${method}' timed out after ${timeout}ms` }),
            timeout,
          )
        })
        return await Promise.race([this.readSseBody(response.body, id, method), timeoutPromise])
      }

      const body = (await response.json()) as JsonRpcResponse
      if (body.error !== undefined) {
        return { ok: false, error: `${body.error.code}: ${body.error.message}` }
      }
      return { ok: true, result: body.result }
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error)
      if (this.lastError.includes('abort')) {
        return { ok: false, error: `request '${method}' timed out after ${timeout}ms` }
      }
      return { ok: false, error: this.lastError }
    } finally {
      clearTimeout(timer)
    }
  }

  notify(method: string, params?: unknown): { ok: boolean; error?: string } {
    this.request(method, params).then((r) => {
      if (!r.ok && r.error.includes('HTTP')) this.lastError = r.error
    })
    return { ok: true }
  }

  /** Drop the session so the next request re-initializes. */
  resetSession(): void {
    this.sessionId = null
  }

  close(): void {
    this.resetSession()
  }
}
