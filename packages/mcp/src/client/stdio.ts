/**
 * MCP stdio transport (Phase 117): spawns a local MCP server as a child
 * process and speaks JSON-RPC 2.0 over stdin/stdout (newline-delimited
 * JSON, one message per line per the MCP stdio transport).
 *
 * No-throw convention: `request()` resolves `{ok:false, error}` on timeout,
 * malformed responses, or child death instead of rejecting. Notifications
 * are dispatched to handlers and never disturb request/response matching.
 */

export interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: number
  method: string
  params?: unknown
}

export interface JsonRpcNotification {
  jsonrpc: '2.0'
  method: string
  params?: unknown
}

export interface JsonRpcError {
  code: number
  message: string
  data?: unknown
}

export interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: number | string | null
  result?: unknown
  error?: JsonRpcError
}

export type JsonRpcMessage = JsonRpcRequest | JsonRpcNotification | JsonRpcResponse

export interface McpSpawnOptions {
  command: string
  args?: readonly string[]
  env?: Record<string, string>
  cwd?: string
  /** Per-request timeout (default 30s). */
  requestTimeoutMs?: number
}

interface PendingRequest {
  resolve: (result: { ok: true; result: unknown } | { ok: false; error: string }) => void
  timer: ReturnType<typeof setTimeout>
}

const MAX_STDERR_LINES = 50

export class McpStdioTransport {
  private readonly options: McpSpawnOptions
  private child: ReturnType<typeof Bun.spawn> | null = null
  private nextId = 1
  private readonly pending = new Map<number, PendingRequest>()
  private readonly notificationHandlers = new Set<(notification: JsonRpcNotification) => void>()
  private stderrLines: string[] = []

  constructor(options: McpSpawnOptions) {
    this.options = options
  }

  get running(): boolean {
    return this.child !== null
  }

  /** Recent stderr lines from the server (diagnostics when things fail). */
  stderrTail(): string[] {
    return [...this.stderrLines]
  }

  onNotification(handler: (notification: JsonRpcNotification) => void): () => void {
    this.notificationHandlers.add(handler)
    return () => this.notificationHandlers.delete(handler)
  }

  /** Spawn the server process and start the stdout reader loop. */
  spawn(): { ok: boolean; error?: string } {
    if (this.child !== null) return { ok: true }
    try {
      this.child = Bun.spawn([this.options.command, ...(this.options.args ?? [])], {
        stdin: 'pipe',
        stdout: 'pipe',
        stderr: 'pipe',
        env: { ...process.env, ...(this.options.env ?? {}) },
        cwd: this.options.cwd,
      })
    } catch (error) {
      return {
        ok: false,
        error: `failed to spawn '${this.options.command}': ${error instanceof Error ? error.message : String(error)}`,
      }
    }
    void this.readLoop()
    return { ok: true }
  }

  private async readLoop(): Promise<void> {
    const child = this.child
    if (child === null) return
    const decoder = new TextDecoder()
    let buffer = ''
    try {
      const stdout = child.stdout as unknown as AsyncIterable<Uint8Array>
      for await (const chunk of stdout) {
        buffer += decoder.decode(chunk, { stream: true })
        let newlineAt = buffer.indexOf('\n')
        while (newlineAt !== -1) {
          const line = buffer.slice(0, newlineAt).trim()
          buffer = buffer.slice(newlineAt + 1)
          if (line.length > 0) this.handleLine(line)
          newlineAt = buffer.indexOf('\n')
        }
      }
    } catch (error) {
      this.stderrLines.push(
        `stdout reader: ${error instanceof Error ? error.message : String(error)}`,
      )
      if (this.stderrLines.length > MAX_STDERR_LINES) this.stderrLines.shift()
    }
    // Child stdout closed: fail the pending requests so callers never hang.
    this.failAllPending(this.child?.exitCode === null ? 'server closed stdout' : 'server exited')
    this.child = null
  }

  private handleLine(line: string): void {
    let message: JsonRpcMessage
    try {
      message = JSON.parse(line) as JsonRpcMessage
    } catch (error) {
      this.stderrLines.push(
        `unparseable message: ${error instanceof Error ? error.message : String(error)}`,
      )
      if (this.stderrLines.length > MAX_STDERR_LINES) this.stderrLines.shift()
      return
    }

    if ('id' in message && (typeof message.id === 'number' || typeof message.id === 'string')) {
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
      return
    }

    if ('method' in message) {
      for (const handler of this.notificationHandlers) {
        handler(message as JsonRpcNotification)
      }
    }
  }

  private writeLine(message: object): { ok: boolean; error?: string } {
    const child = this.child
    if (child === null) return { ok: false, error: 'transport is not running' }
    try {
      const stdin = child.stdin as unknown as { write: (data: string) => unknown }
      stdin.write(`${JSON.stringify(message)}\n`)
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  /** Send a JSON-RPC request and await its (id-matched) response. */
  request(
    method: string,
    params?: unknown,
    timeoutMs?: number,
  ): Promise<{ ok: true; result: unknown } | { ok: false; error: string }> {
    const child = this.child
    if (child === null) {
      return Promise.resolve({ ok: false, error: 'transport is not running' })
    }
    const id = this.nextId++
    const timeout = timeoutMs ?? this.options.requestTimeoutMs ?? 30_000
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        resolve({ ok: false, error: `request '${method}' timed out after ${timeout}ms` })
      }, timeout)
      this.pending.set(id, { resolve, timer })
      const sent = this.writeLine({
        jsonrpc: '2.0',
        id,
        method,
        ...(params !== undefined ? { params } : {}),
      })
      if (!sent.ok) {
        clearTimeout(timer)
        this.pending.delete(id)
        resolve({ ok: false, error: sent.error ?? 'send failed' })
      }
    })
  }

  /** Fire-and-forget JSON-RPC notification. */
  notify(method: string, params?: unknown): { ok: boolean; error?: string } {
    return this.writeLine(
      params !== undefined ? { jsonrpc: '2.0', method, params } : { jsonrpc: '2.0', method },
    )
  }

  /** Kill the server process and fail every pending request. */
  close(): void {
    const child = this.child
    if (child === null) return
    try {
      child.kill()
    } catch {
      // already dead
    }
    this.failAllPending('transport closed')
    this.child = null
  }

  private failAllPending(reason: string): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer)
      pending.resolve({ ok: false, error: reason })
      this.pending.delete(id)
    }
  }
}
