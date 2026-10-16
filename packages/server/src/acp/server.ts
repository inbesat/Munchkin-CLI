/**
 * ACP server (Phase 140): Agent Client Protocol over stdio - JSON-RPC 2.0
 * with newline framing - for editors (Zed, Neovim, JetBrains).
 *
 * Methods:
 *   initialize        -> { protocolVersion, serverInfo }
 *   session/new       -> { sessionId }
 *   session/prompt    -> runs the agent loop, streaming session/update
 *                        notifications (agent_message_chunk / tool_call),
 *                        replies { stopReason }
 *   session/cancel    -> aborts the session's running prompt
 *
 * Outbound requests (session/request_permission) are JSON-RPC requests to
 * the client; inbound responses (bare ids) resolve those pending waits.
 * No-throw: malformed lines and handler failures route to JSON-RPC errors
 * or are skipped with stderr diagnostics.
 */

import { type AgentModel, type AgentTool, type LoopStopReason, runAgentLoop } from '@forge/core'

export type AcpTool = AgentTool

export interface AcpServerOptions {
  input: NodeJS.ReadableStream
  output: NodeJS.WritableStream
  /** Per-prompt model factory (typically resolves the configured provider model). */
  modelFactory: () => AgentModel
  tools?: readonly AcpTool[]
  system?: string
}

interface JsonObject {
  [key: string]: unknown
}

interface AcpSession {
  id: string
  abort: AbortController
}

/** ACP stop reasons (subset of the protocol's enum). */
type StopReason = 'end_turn' | 'max_tokens' | 'max_turn_requests' | 'refusal' | 'cancelled'

const STOP_REASONS: Record<LoopStopReason, StopReason> = {
  complete: 'end_turn',
  'max-iterations': 'max_turn_requests',
  cancelled: 'cancelled',
  'context-overflow': 'max_tokens',
  error: 'refusal',
}

type PendingResponse = (result: { allowed: boolean }) => void

export class AcpServer {
  private readonly options: AcpServerOptions
  private nextSession = 1
  private nextRequestId = 1000
  private readonly sessions = new Map<string, AcpSession>()
  private readonly pendingResponses = new Map<number | string, PendingResponse>()
  private serving = false
  private readonly diagnostics: string[] = []

  constructor(options: AcpServerOptions) {
    this.options = options
  }

  stderrTail(): string[] {
    return [...this.diagnostics]
  }

  /** Start the newline-framed read loop over the input stream. */
  serve(): void {
    if (this.serving) return
    this.serving = true
    const decoder = new TextDecoder()
    let buffer = ''
    const input = this.options.input
    input.on('data', (chunk: Uint8Array | string) => {
      buffer += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true })
      let newlineAt = buffer.indexOf('\n')
      while (newlineAt !== -1) {
        const line = buffer.slice(0, newlineAt).trim()
        buffer = buffer.slice(newlineAt + 1)
        if (line.length > 0) this.dispatchLine(line)
        newlineAt = buffer.indexOf('\n')
      }
    })
    input.on('error', (error: Error) => {
      this.pushDiagnostic(`input stream: ${error.message}`)
    })
  }

  /** Send a notification to the client. */
  notify(method: string, params: JsonObject): void {
    this.writeLine(JSON.stringify({ jsonrpc: '2.0', method, params }))
  }

  /**
   * Send a request to the client and await its response id - used for the
   * session/request_permission round-trip.
   */
  request(method: string, params: JsonObject, timeoutMs = 120_000): Promise<{ allowed: boolean }> {
    const id = this.nextRequestId++
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pendingResponses.delete(id)
        resolve({ allowed: false })
      }, timeoutMs)
      this.pendingResponses.set(id, (result) => {
        clearTimeout(timer)
        resolve(result)
      })
      this.writeLine(JSON.stringify({ jsonrpc: '2.0', id, method, params }))
    })
  }

  private respond(id: number | string, result: JsonObject): void {
    this.writeLine(JSON.stringify({ jsonrpc: '2.0', id, result }))
  }

  private respondError(id: number | string | undefined, code: number, message: string): void {
    if (id === undefined) return
    this.writeLine(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }))
  }

  private writeLine(line: string): void {
    this.options.output.write(`${line}\n`)
  }

  private pushDiagnostic(message: string): void {
    this.diagnostics.push(message)
    if (this.diagnostics.length > 50) this.diagnostics.shift()
  }

  /** Handle one newline-delimited JSON-RPC message (public for tests). */
  dispatchLine(line: string): void {
    let message: JsonObject
    try {
      message = JSON.parse(line) as JsonObject
    } catch (error) {
      this.pushDiagnostic(
        `unparseable message: ${error instanceof Error ? error.message : String(error)}`,
      )
      return
    }

    if (message.method === undefined) {
      // A response to one of our outbound requests (e.g. permission).
      const id = message.id
      const pending =
        typeof id === 'number' || typeof id === 'string' ? this.pendingResponses.get(id) : undefined
      if (pending === undefined) return
      this.pendingResponses.delete(id as number | string)
      const result = message.result as { outcome?: { outcome?: string } } | undefined
      pending({ allowed: result?.outcome?.outcome === 'selected' })
      return
    }

    const method = String(message.method)
    const rawId = message.id
    const id = typeof rawId === 'number' || typeof rawId === 'string' ? rawId : undefined

    switch (method) {
      case 'initialize':
        if (id !== undefined) {
          this.respond(id, {
            protocolVersion: 1,
            serverCapabilities: { tools: { list: true } },
            serverInfo: { name: 'forge', version: '0.1.0' },
          })
        }
        return
      case 'session/new': {
        if (id === undefined) return
        const sessionId = `session-${this.nextSession++}`
        this.sessions.set(sessionId, { id: sessionId, abort: new AbortController() })
        this.respond(id, { sessionId })
        return
      }
      case 'session/cancel': {
        const cancelParams = message.params as { sessionId?: string } | undefined
        const session =
          cancelParams?.sessionId !== undefined
            ? this.sessions.get(cancelParams.sessionId)
            : undefined
        if (session !== undefined) session.abort.abort()
        return
      }
      case 'session/prompt': {
        const promptParams = message.params as { sessionId?: string; prompt?: string } | undefined
        const sessionId = promptParams?.sessionId
        const session = sessionId !== undefined ? this.sessions.get(sessionId) : undefined
        if (session === undefined) {
          this.respondError(id, -32602, `unknown session: ${sessionId ?? '(none)'}`)
          return
        }
        if (id === undefined) {
          this.pushDiagnostic('session/prompt without an id')
          return
        }
        void this.runPrompt(session, id, promptParams?.prompt ?? '')
        return
      }
      default:
        this.pushDiagnostic(`unknown method: ${method}`)
        if (id !== undefined) this.respondError(id, -32601, `unknown method '${method}'`)
        return
    }
  }

  private async runPrompt(session: AcpSession, id: number | string, prompt: string): Promise<void> {
    session.abort = new AbortController()
    try {
      const result = await runAgentLoop({
        model: this.options.modelFactory(),
        messages: [{ role: 'user', parts: [{ type: 'text', text: prompt }], content: prompt }],
        ...(this.options.system !== undefined ? { system: this.options.system } : {}),
        ...(this.options.tools !== undefined ? { tools: this.options.tools } : {}),
        abortSignal: session.abort.signal,
        permissionCheck: async (name) => {
          const response = await this.request('session/request_permission', {
            sessionId: session.id,
            toolCall: { title: name },
          })
          return response.allowed
        },
        onEvent: (event) => {
          if (event.type === 'text') {
            this.notify('session/update', {
              sessionId: session.id,
              update: {
                sessionUpdate: 'agent_message_chunk',
                content: { type: 'text', text: event.delta },
              },
            })
          } else if (event.type === 'tool-call') {
            this.notify('session/update', {
              sessionId: session.id,
              update: {
                sessionUpdate: 'tool_call',
                toolCallId: event.toolCall.id,
                title: event.toolCall.name,
              },
            })
          }
        },
      })
      const stopReason: StopReason = session.abort.signal.aborted
        ? 'cancelled'
        : STOP_REASONS[result.reason]
      this.respond(id, { stopReason })
    } catch (error) {
      // runAgentLoop surfaces failures as reason 'error'; a throw here is unexpected.
      if (session.abort.signal.aborted) {
        this.respond(id, { stopReason: 'cancelled' })
        return
      }
      const message = error instanceof Error ? error.message : String(error)
      this.pushDiagnostic(`prompt failed: ${message}`)
      this.respondError(id, -32603, `agent loop failed: ${message}`)
    }
  }
}
