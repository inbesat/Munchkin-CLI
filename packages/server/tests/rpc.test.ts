import { beforeEach, describe, expect, it } from 'bun:test'
import { Readable, Writable } from 'node:stream'
import {
  RPC_VERSION,
  RpcErrorCodes,
  type RpcMessage,
  decodeMessage,
  encodeMessage,
  isNotification,
  isRequest,
  isResponse,
  makeError,
  makeSuccess,
} from '../src/rpc/protocol'
import { RpcServer } from '../src/rpc/server'

/** In-memory stream pair for testing the read/write loop without real pipes. */
class TestStreams {
  input: Readable
  output: Writable
  outputChunks: string[] = []
  inputClosed = false

  constructor() {
    this.output = new Writable({
      write: (chunk: Buffer | string, _enc, cb) => {
        this.outputChunks.push(typeof chunk === 'string' ? chunk : chunk.toString('utf-8'))
        cb()
      },
    })
    this.input = new Readable({
      read: () => {
        // No-op; tests push via pushLine().
      },
    })
  }

  pushLine(line: string): void {
    this.input.push(line.endsWith('\n') ? line : `${line}\n`)
  }

  endInput(): void {
    this.input.push(null)
  }

  stdout(): string {
    return this.outputChunks.join('')
  }

  parseWritten(): RpcMessage[] {
    return this.stdout()
      .split('\n')
      .filter((l) => l.trim().length > 0)
      .map((l) => decodeMessage(l))
  }
}

describe('JSON-RPC protocol codec', () => {
  it('round-trips a success response', () => {
    const msg = makeSuccess(1, { ok: true })
    const line = encodeMessage(msg)
    const back = decodeMessage(line)
    expect(back).toEqual(msg)
  })

  it('round-trips an error response', () => {
    const msg = makeError(1, RpcErrorCodes.MethodNotFound, 'nope', { hint: 'try again' })
    const back = decodeMessage(encodeMessage(msg))
    expect(back).toEqual(msg)
  })

  it('classifies request vs notification vs response', () => {
    const req = { jsonrpc: RPC_VERSION, id: 1, method: 'foo', params: {} } as RpcMessage
    const notif = { jsonrpc: RPC_VERSION, method: 'foo' } as RpcMessage
    const resp = { jsonrpc: RPC_VERSION, id: 1, result: null } as RpcMessage
    expect(isRequest(req)).toBe(true)
    expect(isNotification(notif)).toBe(true)
    expect(isResponse(resp)).toBe(true)
    expect(isResponse(req)).toBe(false)
  })

  it('rejects empty lines, invalid JSON, and wrong version', () => {
    expect(() => decodeMessage('')).toThrow()
    expect(() => decodeMessage('not json')).toThrow()
    expect(() => decodeMessage('{"jsonrpc":"1.0","id":1}')).toThrow()
  })
})

describe('RpcServer (stdio JSON-RPC)', () => {
  let streams: TestStreams
  let server: RpcServer

  beforeEach(() => {
    streams = new TestStreams()
    server = new RpcServer({ input: streams.input, output: streams.output })
  })

  it('handles a request and writes a success response', async () => {
    server.register('echo', (params) => params)
    const promise = server.serve()
    streams.pushLine(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'echo', params: { x: 1 } }))
    await new Promise((r) => setTimeout(r, 10))
    streams.endInput()
    await promise
    const out = streams.parseWritten()
    expect(out).toHaveLength(1)
    const resp = out[0] as { id: number; result: { x: number } }
    expect(resp.id).toBe(1)
    expect(resp.result).toEqual({ x: 1 })
  })

  it('returns MethodNotFound for unknown methods', async () => {
    const promise = server.serve()
    streams.pushLine(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'missing' }))
    await new Promise((r) => setTimeout(r, 10))
    streams.endInput()
    await promise
    const out = streams.parseWritten()
    const resp = out[0] as { error: { code: number; message: string } }
    expect(resp.error.code).toBe(RpcErrorCodes.MethodNotFound)
    expect(resp.error.message).toContain('missing')
  })

  it('returns ParseError for malformed input', async () => {
    const promise = server.serve()
    streams.pushLine('this is not json')
    await new Promise((r) => setTimeout(r, 10))
    streams.endInput()
    await promise
    const out = streams.parseWritten()
    const resp = out[0] as { error: { code: number } }
    expect(resp.error.code).toBe(RpcErrorCodes.ParseError)
  })

  it('handles multiple requests in a single stream', async () => {
    server.register('add', ({ a, b }: { a: number; b: number }) => a + b)
    const promise = server.serve()
    streams.pushLine(
      JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'add', params: { a: 1, b: 2 } }),
    )
    streams.pushLine(
      JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'add', params: { a: 10, b: 20 } }),
    )
    await new Promise((r) => setTimeout(r, 20))
    streams.endInput()
    await promise
    const out = streams.parseWritten() as Array<{ id: number; result: number }>
    const results = out.map((m) => m.result).sort()
    expect(results).toEqual([3, 30])
  })

  it('returns InternalError when the handler throws', async () => {
    server.register('boom', () => {
      throw new Error('handler exploded')
    })
    const promise = server.serve()
    streams.pushLine(JSON.stringify({ jsonrpc: '2.0', id: 9, method: 'boom' }))
    await new Promise((r) => setTimeout(r, 10))
    streams.endInput()
    await promise
    const out = streams.parseWritten() as Array<{ error: { code: number; message: string } }>
    expect(out[0]?.error.code).toBe(RpcErrorCodes.InternalError)
    expect(out[0]?.error.message).toContain('handler exploded')
  })

  it('passes through a handler-thrown { code, message } as-is', async () => {
    server.register('typed', () => {
      throw { code: -32042, message: 'custom' }
    })
    const promise = server.serve()
    streams.pushLine(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'typed' }))
    await new Promise((r) => setTimeout(r, 10))
    streams.endInput()
    await promise
    const out = streams.parseWritten() as Array<{ error: { code: number; message: string } }>
    expect(out[0]?.error.code).toBe(-32042)
    expect(out[0]?.error.message).toBe('custom')
  })

  it('notify() writes a notification frame', () => {
    const ok = server.notify('event', { delta: 'hi' })
    expect(ok).toBe(true)
    const out = streams.parseWritten() as Array<{ method: string; params: { delta: string } }>
    expect(out[0]?.method).toBe('event')
    expect(out[0]?.params).toEqual({ delta: 'hi' })
  })

  it('ignores notifications from the client (no response)', async () => {
    server.register('ping', () => 'pong')
    const promise = server.serve()
    streams.pushLine(JSON.stringify({ jsonrpc: '2.0', method: 'ping', params: {} }))
    await new Promise((r) => setTimeout(r, 10))
    streams.endInput()
    await promise
    expect(streams.stdout()).toBe('')
  })

  it('refuses duplicate method registration', () => {
    server.register('dup', () => null)
    expect(() => server.register('dup', () => null)).toThrow()
  })
})
