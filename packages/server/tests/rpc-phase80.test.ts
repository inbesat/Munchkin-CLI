import { describe, expect, it, beforeEach } from 'bun:test'
import { Readable, Writable } from 'node:stream'
import { RpcServer } from '../src/rpc/server'
import { registerRpcMethods, type RpcBindingsContext } from '../src/rpc/bindings'
import { FORGE_PROTOCOL_VERSION } from '../src/rpc/capabilities'
import {
  RPC_VERSION,
  decodeMessage,
  type RpcMessage,
  type RpcRequest,
} from '../src/rpc/protocol'

class TestStreams {
  input: Readable
  output: Writable
  outputChunks: string[] = []

  constructor() {
    this.output = new Writable({
      write: (chunk: Buffer | string, _enc, cb) => {
        this.outputChunks.push(typeof chunk === 'string' ? chunk : chunk.toString('utf-8'))
        cb()
      },
    })
    this.input = new Readable({ read: () => {} })
  }

  pushLine(line: string): void {
    this.input.push(line.endsWith('\n') ? line : `${line}\n`)
  }

  endInput(): void {
    this.input.push(null)
  }

  parseWritten(): RpcMessage[] {
    return this.outputChunks
      .join('')
      .split('\n')
      .filter((l) => l.trim().length > 0)
      .map((l) => decodeMessage(l))
  }
}

function makeNoopExecutor() {
  return {
    executePrompt: async (_sid: string, _p: string) => ({
      reason: 'complete' as const,
      response: '',
      messages: [],
      turns: 0,
      usage: { input: 0, output: 0, total: 0 },
      error: undefined,
    }),
  }
}

function makeNoopSessionManager() {
  return {
    getSession: async () => null,
    listSessions: async () => [],
    searchSessions: async () => [],
    createSession: async () => ({}),
    deleteSession: async () => false,
    getEvents: async () => [],
  }
}

function setup(streams: TestStreams) {
  const server = new RpcServer({ input: streams.input, output: streams.output })
  const ctx: RpcBindingsContext = registerRpcMethods(server, {
    sessionManager: makeNoopSessionManager() as never,
    agentExecutor: makeNoopExecutor() as never,
  })
  return { server, ctx }
}

describe('Phase 80 — capability handshake (initialize)', () => {
  let streams: TestStreams
  beforeEach(() => {
    streams = new TestStreams()
  })

  it('returns serverInfo and negotiated capabilities', async () => {
    const { server } = setup(streams)
    const p = server.serve()
    streams.pushLine(
      JSON.stringify({
        jsonrpc: RPC_VERSION,
        id: 1,
        method: 'initialize',
        params: {
          clientInfo: { name: 'ts-sdk-test', version: '0.1' },
          capabilities: { streaming: true, cancellation: true, structuredErrors: false },
        },
      }),
    )
    await new Promise((r) => setTimeout(r, 10))
    streams.endInput()
    await p
    const out = streams.parseWritten() as Array<{ result: { protocolVersion: string; serverInfo: { name: string; version: string }; capabilities: { streaming: boolean; methods: string[] } } }>
    expect(out[0]?.result.protocolVersion).toBe(FORGE_PROTOCOL_VERSION)
    expect(out[0]?.result.serverInfo.name).toBe('forge')
    expect(out[0]?.result.capabilities.streaming).toBe(true)
    expect(out[0]?.result.capabilities.cancellation).toBe(true)
    expect(out[0]?.result.capabilities.structuredErrors).toBe(false)
    expect(out[0]?.result.capabilities.methods).toContain('prompts.submit')
    expect(out[0]?.result.capabilities.methods).toContain('$/cancelRequest')
  })

  it('with no client capabilities, all features are off', async () => {
    const { server } = setup(streams)
    const p = server.serve()
    streams.pushLine(JSON.stringify({ jsonrpc: RPC_VERSION, id: 2, method: 'initialize' }))
    await new Promise((r) => setTimeout(r, 10))
    streams.endInput()
    await p
    const out = streams.parseWritten() as Array<{ result: { capabilities: { streaming: boolean; cancellation: boolean } } }>
    expect(out[0]?.result.capabilities.streaming).toBe(false)
    expect(out[0]?.result.capabilities.cancellation).toBe(false)
  })

  it('accepts `initialized` notification silently (no response)', async () => {
    const { server } = setup(streams)
    const p = server.serve()
    streams.pushLine(JSON.stringify({ jsonrpc: RPC_VERSION, method: 'initialized' }))
    await new Promise((r) => setTimeout(r, 10))
    streams.endInput()
    await p
    expect(streams.parseWritten()).toEqual([])
  })
})

describe('Phase 80 — $/cancelRequest', () => {
  let streams: TestStreams
  beforeEach(() => {
    streams = new TestStreams()
  })

  it('returns { cancelled: false } for an unknown id', async () => {
    const { server } = setup(streams)
    const p = server.serve()
    streams.pushLine(
      JSON.stringify({ jsonrpc: RPC_VERSION, id: 5, method: '$/cancelRequest', params: { id: 99999 } }),
    )
    await new Promise((r) => setTimeout(r, 10))
    streams.endInput()
    await p
    const out = streams.parseWritten() as Array<{ result: { cancelled: boolean } }>
    expect(out[0]?.result.cancelled).toBe(false)
  })

  it('returns InvalidParams when `id` is missing', async () => {
    const { server } = setup(streams)
    const p = server.serve()
    streams.pushLine(
      JSON.stringify({ jsonrpc: RPC_VERSION, id: 6, method: '$/cancelRequest', params: {} }),
    )
    await new Promise((r) => setTimeout(r, 10))
    streams.endInput()
    await p
    const out = streams.parseWritten() as Array<{ error: { code: number } }>
    expect(out[0]?.error.code).toBe(-32602)
  })

  it('cancels an in-flight request by aborting its AbortSignal', async () => {
    const { server } = setup(streams)
    // Register a slow handler that watches its signal.
    let observedSignalAborted = false
    server.register('slow.echo', async (params, req) => {
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(resolve, 5000)
        req.signal.addEventListener('abort', () => {
          observedSignalAborted = true
          clearTimeout(t)
          reject({ code: -32000, message: 'cancelled' })
        })
      })
      return params
    })
    const p = server.serve()
    // Start the slow request.
    streams.pushLine(JSON.stringify({ jsonrpc: RPC_VERSION, id: 10, method: 'slow.echo', params: { x: 1 } }))
    await new Promise((r) => setTimeout(r, 20))
    // Cancel it.
    streams.pushLine(JSON.stringify({ jsonrpc: RPC_VERSION, id: 11, method: '$/cancelRequest', params: { id: 10 } }))
    await new Promise((r) => setTimeout(r, 20))
    streams.endInput()
    await p
    expect(observedSignalAborted).toBe(true)
  })
})

describe('Phase 80 — notifications', () => {
  let streams: TestStreams
  beforeEach(() => {
    streams = new TestStreams()
  })

  it('server.notify() writes a notification frame', () => {
    setup(streams)
    // notify() can be called from any handler; here we test directly.
    const out = streams.parseWritten()
    // We need access to the server; pull it from the same call.
    // Re-run setup to grab the server:
    const s = new TestStreams()
    const server = new RpcServer({ input: s.input, output: s.output })
    server.notify('text_delta', { sessionId: 's1', delta: 'hi' })
    expect((s.parseWritten()[0] as { method: string }).method).toBe('text_delta')
    void out
  })

  it('exposes a bound notifier accessor', () => {
    const s = new TestStreams()
    const server = new RpcServer({ input: s.input, output: s.output })
    const n = server.notifier
    n('event', { x: 1 })
    const frame = s.parseWritten()[0] as { method: string; params: { x: number } }
    expect(frame.method).toBe('event')
    expect(frame.params).toEqual({ x: 1 })
  })
})

describe('Phase 80 — prompts.submit notification fan-out', () => {
  let streams: TestStreams
  beforeEach(() => {
    streams = new TestStreams()
  })

  it('sends a $/progress notification per loop event before the final result', async () => {
    const stream: AsyncIterable<unknown> = (async function* () {
      yield { type: 'text', delta: 'hello' }
      yield { type: 'finish', reason: 'complete' }
    })()

    const executor = {
      executePrompt: async (
        _sid: string,
        _p: string,
        _options: unknown,
        onEvent?: (e: unknown) => void,
      ) => {
        for await (const e of stream) onEvent?.(e)
        return { reason: 'complete', response: 'hi', messages: [], turns: 1, usage: { input: 0, output: 0, total: 0 } }
      },
    }

    const session = { id: 's1', cwd: '/tmp' }

    const server = new RpcServer({ input: streams.input, output: streams.output })
    registerRpcMethods(server, {
      sessionManager: {
        getSession: async () => session,
        listSessions: async () => [session],
        searchSessions: async () => [],
        createSession: async () => session,
        deleteSession: async () => true,
        getEvents: async () => [],
      } as never,
      agentExecutor: executor as never,
    })

    const p = server.serve()
    streams.pushLine(
      JSON.stringify({
        jsonrpc: RPC_VERSION,
        id: 100,
        method: 'prompts.submit',
        params: { sessionId: 's1', prompt: 'say hi' },
      }),
    )
    await new Promise((r) => setTimeout(r, 50))
    streams.endInput()
    await p

    const out = streams.parseWritten() as Array<{ method?: string; result?: unknown }>
    const notifications = out.filter((m) => m.method === '$/progress') as Array<{
      params: { requestId: number; method: string; params: { type: string; delta?: string; reason?: string } }
    }>
    const result = out.find((m) => 'result' in m) as { result: { response: string } } | undefined

    expect(notifications.length).toBe(2)
    expect(notifications[0]?.params.requestId).toBe(100)
    expect(notifications[0]?.params.method).toBe('text_delta')
    expect(notifications[1]?.params.method).toBe('agent_done')
    expect(result?.result.response).toBe('hi')
  })
})
