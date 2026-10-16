import { describe, expect, it } from 'bun:test'
import type { AgentChunk, AgentModel } from '@forge/core'
import type { AcpTool } from './server'
import { AcpServer } from './server'

/** Scripted model: each stream() call yields the next scripted turn. */
function scriptedModel(turns: readonly (readonly AgentChunk[])[]): {
  model: AgentModel
  prompts: string[]
} {
  const prompts: string[] = []
  let call = 0
  const model: AgentModel = {
    id: 'scripted-acp',
    provider: 'scripted',
    config: { capabilities: { contextWindow: 100_000, maxTokens: 4_096 } },
    async *stream(options) {
      const last = options.messages[options.messages.length - 1]
      prompts.push(last?.content ?? '')
      const turn = turns[Math.min(call, turns.length - 1)] ?? []
      call += 1
      for (const chunk of turn) yield chunk
    },
  }
  return { model, prompts }
}

const textTurn = (text: string): AgentChunk[] => [
  { type: 'text-delta', delta: text },
  { type: 'finish', reason: 'stop' },
]

const toolTurn = (toolCallId: string, name: string): AgentChunk[] => [
  { type: 'tool-call', toolCall: { id: toolCallId, name, args: {} } },
  { type: 'finish', reason: 'tool-call' },
]

/** Fake readable stream: tests inject 'data' events directly. */
class FakeInputStream {
  private readonly handlers = new Map<string, Array<(arg: unknown) => void>>()

  on(event: string, handler: (arg: unknown) => void): this {
    const list = this.handlers.get(event) ?? []
    list.push(handler)
    this.handlers.set(event, list)
    return this
  }

  emit(event: string, chunk: string): void {
    for (const handler of this.handlers.get(event) ?? []) handler(chunk)
  }

  asStream(): NodeJS.ReadableStream {
    return this as unknown as NodeJS.ReadableStream
  }
}

/**
 * Capturing AcpServer double: 'output' writes go into a parsed line buffer
 * that tests poll; input is only wired when a FakeInputStream is passed.
 */
class CapturingAcp {
  readonly parsed: Record<string, unknown>[] = []
  readonly server: AcpServer

  constructor(modelFactory: () => AgentModel, tools?: readonly AcpTool[], input?: FakeInputStream) {
    this.server = new AcpServer({
      input: input?.asStream() ?? ({ on: () => undefined } as unknown as NodeJS.ReadableStream),
      output: {
        write: (data: string) => void this.capture(data),
      } as unknown as NodeJS.WritableStream,
      modelFactory,
      tools,
    })
  }

  private capture(data: string): void {
    for (const line of data.split('\n')) {
      if (line.length > 0) this.parsed.push(JSON.parse(line) as Record<string, unknown>)
    }
  }

  /** Dispatch one JSON-RPC line (auto-assigns incremental client ids). */
  request(method: string, params: Record<string, unknown> = {}): string {
    const id = `c-${this.parsed.length}`
    this.line(JSON.stringify({ jsonrpc: '2.0', id, method, params }))
    return id
  }

  line(msg: string): void {
    this.server.dispatchLine(msg)
  }

  /** Create a session and return its id. */
  async newSession(): Promise<string> {
    const id = this.request('session/new', {})
    const created = await this.waitFor((parsed) => parsed.id === id)
    return (created.result as { sessionId: string }).sessionId
  }

  waitFor(
    predicate: (parsed: Record<string, unknown>) => boolean,
    timeoutMs = 2_000,
  ): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const started = Date.now()
      const poll = (): void => {
        for (const parsed of this.parsed) {
          if (predicate(parsed)) {
            resolve(parsed)
            return
          }
        }
        if (Date.now() - started > timeoutMs) reject(new Error('waitFor timeout'))
        else setTimeout(poll, 20)
      }
      poll()
    })
  }
}

describe('ACP server (Phase 140)', () => {
  it('answers initialize with protocolVersion + serverInfo', async () => {
    const client = new CapturingAcp(() => scriptedModel([textTurn('x')]).model)
    const id = client.request('initialize', {})
    const response = await client.waitFor((parsed) => parsed.id === id)
    const result = response.result as { protocolVersion: number; serverInfo: { name: string } }
    expect(result.protocolVersion).toBe(1)
    expect(result.serverInfo.name).toBe('forge')
  })

  it('session/new creates a session; unknown session id errors cleanly', async () => {
    const client = new CapturingAcp(() => scriptedModel([textTurn('x')]).model)
    const sessionId = await client.newSession()
    expect(sessionId).toBe('session-1')

    const errorId = client.request('session/prompt', { sessionId: 'nope', prompt: 'x' })
    const error = await client.waitFor((parsed) => parsed.id === errorId)
    expect((error.error as { code: number }).code).toBe(-32602)
    expect((error.error as { message: string }).message).toContain('unknown session')
  })

  it('session/prompt streams agent_message_chunk updates and replies end_turn', async () => {
    const { model, prompts } = scriptedModel([textTurn('the answer')])
    const client = new CapturingAcp(() => model)
    const sessionId = await client.newSession()

    const promptId = client.request('session/prompt', { sessionId, prompt: 'what is 2+2' })
    const chunk = await client.waitFor((parsed) => parsed.method === 'session/update')
    const chunkParams = chunk.params as {
      sessionId: string
      update: { sessionUpdate: string; content: { text: string } }
    }
    expect(chunkParams.sessionId).toBe(sessionId)
    expect(chunkParams.update.sessionUpdate).toBe('agent_message_chunk')
    expect(chunkParams.update.content.text).toBe('the answer')

    const done = await client.waitFor((parsed) => parsed.id === promptId)
    expect((done.result as { stopReason: string }).stopReason).toBe('end_turn')
    expect(prompts).toEqual(['what is 2+2'])
  })

  it('session/cancel aborts a running prompt with stopReason cancelled', async () => {
    const { model } = scriptedModel([textTurn('late')])
    const client = new CapturingAcp(() => model)
    const sessionId = await client.newSession()

    const promptId = client.request('session/prompt', { sessionId, prompt: 'slow work' })
    client.line(JSON.stringify({ jsonrpc: '2.0', method: 'session/cancel', params: { sessionId } }))

    const done = await client.waitFor((parsed) => parsed.id === promptId)
    expect((done.result as { stopReason: string }).stopReason).toBe('cancelled')
  })

  it('permission round-trip: request goes out, selected executes the tool', async () => {
    const executed: string[] = []
    const tools: AcpTool[] = [
      {
        name: 'guarded',
        description: 'test tool',
        parameters: {},
        execute: async () => {
          executed.push('guarded')
          return 'tool output'
        },
      },
    ]
    const { model } = scriptedModel([toolTurn('tc1', 'guarded'), textTurn('done')])
    const client = new CapturingAcp(() => model, tools)
    const sessionId = await client.newSession()

    const promptId = client.request('session/prompt', { sessionId, prompt: 'use the tool' })
    const permission = await client.waitFor(
      (parsed) => parsed.method === 'session/request_permission',
    )
    const toolCallUpdate = await client.waitFor(
      (parsed) =>
        (parsed.params as { update?: { sessionUpdate?: string } } | undefined)?.update
          ?.sessionUpdate === 'tool_call',
    )
    expect(toolCallUpdate).toBeDefined()

    client.line(
      JSON.stringify({
        jsonrpc: '2.0',
        id: permission.id,
        result: { outcome: { outcome: 'selected' } },
      }),
    )

    const done = await client.waitFor((parsed) => parsed.id === promptId)
    expect((done.result as { stopReason: string }).stopReason).toBe('end_turn')
    expect(executed).toEqual(['guarded'])
  })

  it('denied permission withholds the tool but the prompt still completes', async () => {
    const executed: string[] = []
    const tools: AcpTool[] = [
      {
        name: 'guarded',
        description: 'test tool',
        parameters: {},
        execute: async () => {
          executed.push('guarded')
          return 'tool output'
        },
      },
    ]
    const { model } = scriptedModel([toolTurn('tc1', 'guarded'), textTurn('done')])
    const client = new CapturingAcp(() => model, tools)
    const sessionId = await client.newSession()

    const promptId = client.request('session/prompt', { sessionId, prompt: 'use the tool' })
    const permission = await client.waitFor(
      (parsed) => parsed.method === 'session/request_permission',
    )
    client.line(
      JSON.stringify({
        jsonrpc: '2.0',
        id: permission.id,
        result: { outcome: { outcome: 'rejected' } },
      }),
    )

    const done = await client.waitFor((parsed) => parsed.id === promptId)
    expect((done.result as { stopReason: string }).stopReason).toBe('end_turn')
    expect(executed).toEqual([])
  })

  it('unknown methods return -32601; malformed lines are diagnostics, never throws', async () => {
    const client = new CapturingAcp(() => scriptedModel([textTurn('x')]).model)
    const id = client.request('nope/method', {})
    const error = await client.waitFor((parsed) => parsed.id === id)
    expect((error.error as { code: number }).code).toBe(-32601)

    client.line('{not json')
    expect(client.server.stderrTail().some((message) => message.includes('unparseable'))).toBe(true)
  })

  it('serve() frames split chunks over the input stream', async () => {
    const input = new FakeInputStream()
    const client = new CapturingAcp(() => scriptedModel([textTurn('x')]).model, undefined, input)
    client.server.serve()

    input.emit('data', '{"jsonrpc":"2.0","id":"s1","met')
    input.emit('data', 'hod":"initialize","params":{}}\n')

    const response = await client.waitFor((parsed) => parsed.id === 's1')
    expect((response.result as { protocolVersion: number }).protocolVersion).toBe(1)
  })
})
