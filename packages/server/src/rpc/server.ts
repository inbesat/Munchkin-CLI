import * as readline from 'node:readline'
import { Writable, Readable } from 'node:stream'
import {
  RpcErrorCodes,
  decodeMessage,
  encodeMessage,
  isRequest,
  makeError,
  makeSuccess,
  type RpcId,
  type RpcMessage,
  type RpcNotification,
  type RpcRequest,
} from './protocol'

/**
 * In-process dispatch request: the wire-level `RpcRequest` plus a per-request
 * `AbortSignal` that the server fires when `$/cancelRequest` arrives. Kept
 * separate from `RpcRequest` so the wire format stays simple.
 */
export interface RpcDispatchRequest extends RpcRequest {
  signal: AbortSignal
}

/** A JSON-RPC method handler. Return a result or throw an error. */
export type RpcMethod = (params: unknown, req: RpcDispatchRequest) => Promise<unknown> | unknown

/**
 * Server→client notifier. Bindings use this to push live prompt events
 * (`text_delta`, `tool_call`, `usage`, ...) without sharing a single event sink.
 */
export type RpcNotifier = (method: string, params: unknown) => void

export interface RpcServerOptions {
  input: Readable
  output: Writable
  log?: (line: string) => void
  signal?: AbortSignal
}

/**
 * In-process JSON-RPC 2.0 server over a newline-delimited byte stream.
 *
 * Phase 79: core read/write loop, error mapping, notifications, dup-method
 * guard. Phase 80: cancel registry (`$/cancelRequest`) and a `notifier`
 * accessor so bindings can stream live events.
 */
export class RpcServer {
  private methods = new Map<string, RpcMethod>()
  private log: (line: string) => void
  private closed = false
  private input: Readable
  private output: Writable
  private signal?: AbortSignal
  /** AbortControllers keyed by request id, indexed when a request starts. */
  private cancellable = new Map<RpcId, AbortController>()

  constructor(options: RpcServerOptions) {
    this.input = options.input
    this.output = options.output
    this.log = options.log ?? ((s) => process.stderr.write(`[rpc] ${s}\n`))
    this.signal = options.signal
  }

  register(method: string, handler: RpcMethod): void {
    if (this.methods.has(method)) {
      throw new Error(`Method already registered: ${method}`)
    }
    this.methods.set(method, handler)
  }

  /**
   * Send a notification to the client. Returns false if the stream is closed.
   * Phase 80: this is the primary way bindings push live prompt events.
   */
  notify(method: string, params?: unknown): boolean {
    if (this.closed) return false
    const msg: RpcNotification = { jsonrpc: '2.0', method, params }
    this.writeRaw(encodeMessage(msg))
    return true
  }

  get notifier(): RpcNotifier {
    return (method, params) => this.notify(method, params)
  }

  /** Mark a request id as cancelled; future `req.signal` listeners fire. */
  cancel(id: RpcId): boolean {
    const c = this.cancellable.get(id)
    if (!c) return false
    c.abort()
    this.cancellable.delete(id)
    return true
  }

  /** Drive the read loop until EOF, an abort signal, or close().
   *
   * Lines are dispatched concurrently: a slow handler does not block
   * subsequent requests (so $/cancelRequest can interleave).
   */
  async serve(): Promise<void> {
    if (this.signal?.aborted) {
      this.log('serve: signal already aborted')
      return
    }

    const rl = readline.createInterface({ input: this.input, crlfDelay: Infinity })
    const abortHandler = () => rl.close()
    this.signal?.addEventListener('abort', abortHandler)

    const inflight = new Set<Promise<void>>()
    const onLine = (line: string) => {
      if (line.trim().length === 0) return
      const task = this.handleLine(line)
        .catch((err) => this.log(`handleLine error: ${(err as Error).message}`))
      inflight.add(task)
      task.finally(() => inflight.delete(task))
    }
    rl.on('line', onLine)

    return new Promise<void>((resolve) => {
      const done = () => {
        rl.off('line', onLine)
        rl.close()
        Promise.allSettled(Array.from(inflight)).then(() => {
          this.signal?.removeEventListener('abort', abortHandler)
          for (const c of this.cancellable.values()) c.abort()
          this.cancellable.clear()
          this.closed = true
          resolve()
        })
      }
      rl.once('close', done)
      this.signal?.addEventListener('abort', done, { once: true })
    })
  }

  close(): void {
    this.closed = true
  }

  private async handleLine(line: string): Promise<void> {
    let msg: RpcMessage
    try {
      msg = decodeMessage(line)
    } catch (err) {
      const e = err as { error?: { code: number; message: string; data?: unknown } }
      const body = e.error ?? { code: RpcErrorCodes.ParseError, message: (err as Error).message }
      const id = (err as { id?: RpcId | null }).id ?? null
      this.writeRaw(encodeMessage(makeError(id, body.code, body.message, body.data)))
      return
    }

    if (isRequest(msg)) {
      await this.handleRequest(msg)
      return
    }
    // Notifications from the client are silently accepted.
  }

  private async handleRequest(req: RpcRequest): Promise<void> {
    const { id, method, params } = req

    if (method === '$/cancelRequest') {
      const p = (params ?? {}) as { id?: RpcId }
      if (p.id === undefined) {
        this.writeRaw(encodeMessage(makeError(id, RpcErrorCodes.InvalidParams, 'Missing id')))
        return
      }
      const ok = this.cancel(p.id)
      this.writeRaw(encodeMessage(makeSuccess(id, { cancelled: ok })))
      return
    }

    const handler = this.methods.get(method)
    if (!handler) {
      this.writeRaw(
        encodeMessage(makeError(id, RpcErrorCodes.MethodNotFound, `Method not found: ${method}`)),
      )
      return
    }

    const controller = new AbortController()
    this.cancellable.set(id, controller)
    try {
      const result = await handler(params, { ...req, signal: controller.signal })
      this.writeRaw(encodeMessage(makeSuccess(id, result)))
    } catch (err) {
      const e = err as { code?: number; message?: string; data?: unknown }
      const code = typeof e?.code === 'number' ? e.code : RpcErrorCodes.InternalError
      const message = e?.message ?? (err instanceof Error ? err.message : 'Internal error')
      const data = e?.data
      this.writeRaw(encodeMessage(makeError(id, code, message, data)))
    } finally {
      this.cancellable.delete(id)
    }
  }

  private writeRaw(line: string): void {
    if (this.closed) return
    try {
      this.output.write(line)
    } catch (err) {
      this.log(`write error: ${(err as Error).message}`)
    }
  }
}