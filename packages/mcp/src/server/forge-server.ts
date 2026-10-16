/**
 * forge MCP server (Phase 124): exposes forge agent capabilities over the
 * MCP stdio transport (newline-delimited JSON-RPC 2.0 - the mirror image of
 * the Phase-117 client framing) so Claude Code, Codex, Cursor, and other
 * agents can delegate work to forge.
 *
 * Run directly:  bun run packages/mcp/src/server/forge-server.ts [cwd]
 * Default tools live in forge-tools.ts; extra tools can be registered via
 * `registerTool` before `serve`.
 * No-throw: handler rejections become MCP error results; malformed lines
 * are skipped.
 */

import type { ForgeTool, ForgeToolContext } from './forge-tools'
import { defaultForgeTools } from './forge-tools'

interface IncomingMessage {
  jsonrpc?: string
  id?: number | string
  method?: string
  params?: {
    name?: string
    arguments?: Record<string, unknown>
    [key: string]: unknown
  }
}

const SERVER_INFO = { name: 'forge', version: '0.1.0' }

export class ForgeMcpServer {
  private readonly tools = new Map<string, ForgeTool>()
  private readonly cwd: string
  private serving = false

  constructor(cwd: string = process.cwd()) {
    this.cwd = cwd
    for (const tool of defaultForgeTools()) {
      this.tools.set(tool.definition.name, tool)
    }
  }

  registerTool(tool: ForgeTool): void {
    this.tools.set(tool.definition.name, tool)
  }

  toolNames(): string[] {
    return [...this.tools.keys()]
  }

  /** Handle a single JSON-RPC message; returns the response line (or null for notifications). */
  handleMessage(line: string): string | null {
    let message: IncomingMessage
    try {
      message = JSON.parse(line) as IncomingMessage
    } catch {
      return null
    }
    if (message.method === undefined) return null
    const isNotification = message.id === undefined

    if (message.method === 'initialize') {
      return this.respond(message, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      })
    }
    if (message.method === 'tools/list') {
      return this.respond(message, {
        tools: [...this.tools.values()].map((tool) => tool.definition),
      })
    }
    if (message.method === 'tools/call') {
      const name = message.params?.name ?? ''
      const tool = this.tools.get(name)
      if (tool === undefined) {
        // Unknown tools surface as tool-error results (isError), matching
        // how the MCP spec expects servers to report per-call failures.
        return isNotification
          ? null
          : this.respond(message, {
              content: [{ type: 'text', text: `unknown tool '${name}'` }],
              isError: true,
            })
      }
      const context: ForgeToolContext = { cwd: this.cwd }
      void tool
        .handler(message.params?.arguments ?? {}, context)
        .then((result) => {
          if (!isNotification) {
            process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: message.id, result })}\n`)
          }
        })
        .catch((error: unknown) => {
          if (!isNotification) {
            process.stdout.write(
              `${JSON.stringify({
                jsonrpc: '2.0',
                id: message.id,
                result: {
                  content: [
                    { type: 'text', text: error instanceof Error ? error.message : String(error) },
                  ],
                  isError: true,
                },
              })}\n`,
            )
          }
        })
      return null
    }
    if (message.method === 'ping') {
      return this.respond(message, {})
    }

    return isNotification
      ? null
      : this.errorResponse(message, -32601, `unknown method '${message.method}'`)
  }

  private respond(message: IncomingMessage, result: unknown): string {
    return `${JSON.stringify({ jsonrpc: '2.0', id: message.id, result })}\n`
  }

  private errorResponse(message: IncomingMessage, code: number, message_: string): string {
    return `${JSON.stringify({
      jsonrpc: '2.0',
      id: message.id,
      error: { code, message: message_ },
    })}\n`
  }

  /**
   * Serve over stdio until stdin closes. The initialize/tools/list/ping
   * methods answer synchronously; tools/call answers asynchronously in
   * dispatch order.
   */
  serve(): void {
    if (this.serving) return
    this.serving = true
    const decoder = new TextDecoder()
    let buffer = ''
    void (async () => {
      for await (const chunk of Bun.stdin.stream()) {
        buffer += decoder.decode(chunk, { stream: true })
        let newlineAt = buffer.indexOf('\n')
        while (newlineAt !== -1) {
          const line = buffer.slice(0, newlineAt).trim()
          buffer = buffer.slice(newlineAt + 1)
          if (line.length > 0) {
            const response = this.handleMessage(line)
            if (response !== null) process.stdout.write(response)
          }
          newlineAt = buffer.indexOf('\n')
        }
      }
      this.serving = false
    })()
  }
}

const invokedDirectly = process.argv[1] !== undefined && import.meta.path === process.argv[1]

if (invokedDirectly) {
  const cwd = process.argv[2] ?? process.cwd()
  new ForgeMcpServer(cwd).serve()
}
