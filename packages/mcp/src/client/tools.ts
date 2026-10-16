/**
 * MCP tool discovery + invocation (Phase 117): the tools layer over
 * `McpStdioTransport` - the MCP lifecycle handshake, `tools/list`
 * discovery, `tools/call` execution, and a structural adapter into the
 * Phase-34 core tool registry (no @forge import; the host wires results in).
 */

import { type McpSpawnOptions, McpStdioTransport } from './stdio'

export const MCP_PROTOCOL_VERSION = '2024-11-05'

export interface McpToolDescriptor {
  name: string
  description?: string
  /** JSON Schema for the tool's arguments. */
  inputSchema?: Record<string, unknown>
}

export interface McpToolContent {
  type: string
  text?: string
  [key: string]: unknown
}

export interface McpToolResult {
  content: McpToolContent[]
  isError: boolean
}

export interface McpServerInfo {
  name: string
  version?: string
  [key: string]: unknown
}

export type McpCallResult = { ok: true; result: McpToolResult } | { ok: false; error: string }

export type McpConnectResult =
  | { ok: true; serverInfo: McpServerInfo }
  | { ok: false; error: string }

export type McpListResult = { ok: true; tools: McpToolDescriptor[] } | { ok: false; error: string }

/** Minimal structural view of the Phase-34 core tool registry. */
export interface CoreToolRegistryLike {
  register(
    definition: {
      name: string
      description: string
      parameters: Record<string, unknown>
    },
    handler: (input: unknown) => Promise<unknown>,
  ): { ok: boolean; error?: string }
}

export class McpToolClient {
  private readonly transport: McpStdioTransport
  private serverInfo: McpServerInfo | null = null

  constructor(transport: McpStdioTransport) {
    this.transport = transport
  }

  static spawn(options: McpSpawnOptions): McpToolClient {
    const client = new McpToolClient(new McpStdioTransport(options))
    return client
  }

  get transportShared(): McpStdioTransport {
    return this.transport
  }

  /** Spawn + `initialize` handshake + `notifications/initialized`. */
  async connect(): Promise<McpConnectResult> {
    const spawned = this.transport.spawn()
    if (!spawned.ok) return { ok: false, error: spawned.error ?? 'spawn failed' }

    const initialized = await this.transport.request('initialize', {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: { tools: {} },
      clientInfo: { name: 'forge', version: '0.1.0' },
    })
    if (!initialized.ok) {
      this.transport.close()
      return { ok: false, error: `initialize failed: ${initialized.error}` }
    }
    const info = initialized.result as { serverInfo?: McpServerInfo }
    if (info.serverInfo === undefined || typeof info.serverInfo.name !== 'string') {
      this.transport.close()
      return { ok: false, error: 'server returned no serverInfo' }
    }
    this.serverInfo = info.serverInfo

    const notified = this.transport.notify('notifications/initialized')
    if (!notified.ok) {
      this.transport.close()
      return { ok: false, error: notified.error ?? 'initialized notification failed' }
    }
    return { ok: true, serverInfo: this.serverInfo }
  }

  async listTools(): Promise<McpListResult> {
    const response = await this.transport.request('tools/list')
    if (!response.ok) return { ok: false, error: response.error }
    const result = response.result as { tools?: McpToolDescriptor[] }
    if (!Array.isArray(result.tools))
      return { ok: false, error: 'tools/list returned no tools array' }
    return {
      ok: true,
      tools: result.tools.filter(
        (tool): tool is McpToolDescriptor => typeof tool?.name === 'string',
      ),
    }
  }

  async callTool(
    name: string,
    args: Record<string, unknown> = {},
    timeoutMs?: number,
  ): Promise<McpCallResult> {
    const response = await this.transport.request(
      'tools/call',
      { name, arguments: args },
      timeoutMs,
    )
    if (!response.ok) return { ok: false, error: response.error }
    const result = response.result as { content?: McpToolContent[]; isError?: boolean }
    return {
      ok: true,
      result: {
        content: Array.isArray(result.content) ? result.content : [],
        isError: result.isError === true,
      },
    }
  }

  /**
   * Adapt discovered MCP tools into Phase-34 core tool definitions and
   * register them. Callers own the registry; handlers proxy to callTool.
   */
  async registerToolsInto(
    registry: CoreToolRegistryLike,
    options: { prefix?: string; callTimeoutMs?: number } = {},
  ): Promise<{ registered: string[]; errors: string[] }> {
    const listed = await this.listTools()
    if (!listed.ok) return { registered: [], errors: [listed.error] }
    const registered: string[] = []
    const errors: string[] = []
    for (const tool of listed.tools) {
      const name = `${options.prefix ?? ''}${tool.name}`
      const outcome = registry.register(
        {
          name,
          description: tool.description ?? `MCP tool ${tool.name}`,
          parameters: tool.inputSchema ?? { type: 'object', properties: {} },
        },
        async (input) => {
          const call = await this.callTool(
            tool.name,
            typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {},
          )
          if (!call.ok) throw new Error(call.error)
          return call.result
        },
      )
      if (outcome.ok) registered.push(name)
      else errors.push(`${name}: ${outcome.error ?? 'registration refused'}`)
    }
    return { registered, errors }
  }

  disconnect(): void {
    this.transport.close()
    this.serverInfo = null
  }
}
