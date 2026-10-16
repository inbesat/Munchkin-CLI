/**
 * MCP connection manager (Phase 123): the live registry the `/mcp`
 * dashboard reads. Tracks every connected server's status, tool count
 * (schemas stay lazy per Phase 120), and last error; disconnecting closes
 * the child process and drops the tool index to free context.
 * No-throw convention throughout.
 */

import type { ResolvedServerSpec } from '../presets'
import { LazyToolIndex } from './lazy'
import { type McpConnectResult, type McpServerInfo, McpToolClient } from './tools'

export type McpConnectionState = 'connected' | 'error' | 'disconnected'

export interface McpConnectionStatus {
  id: string
  state: McpConnectionState
  serverName?: string
  toolCount: number
  lastError?: string
  connectedAt?: number
}

export type McpConnectOutcome =
  | { ok: true; status: McpConnectionStatus }
  | { ok: false; error: string; status: McpConnectionStatus }

interface LiveConnection {
  client: McpToolClient
  lazy: LazyToolIndex
  serverName?: string
  toolCount: number
  lastError?: string
  connectedAt: number
}

export class McpConnectionManager {
  private readonly connections = new Map<string, LiveConnection>()

  /** Connect (or reconnect) a server from a resolved spec. */
  async connect(
    id: string,
    spec: ResolvedServerSpec,
    timeoutMs?: number,
  ): Promise<McpConnectOutcome> {
    // A previous entry is replaced wholesale (fresh child process).
    const previous = this.connections.get(id)
    if (previous !== undefined) previous.client.disconnect()

    const client = McpToolClient.spawn({
      command: spec.command,
      args: spec.args,
      env: spec.env,
      requestTimeoutMs: timeoutMs,
    })
    const base: LiveConnection = {
      client,
      lazy: new LazyToolIndex(
        async () =>
          await client
            .listTools()
            .then((r) => (r.ok ? { ok: true, tools: r.tools } : { ok: false, error: r.error })),
      ),
      toolCount: 0,
      connectedAt: Date.now(),
    }
    this.connections.set(id, base)

    const connected: McpConnectResult = await client.connect()
    if (!connected.ok) {
      client.disconnect()
      this.connections.delete(id)
      this.disconnected.set(id, {
        id,
        state: 'error',
        toolCount: 0,
        lastError: connected.error,
      })
      return {
        ok: false,
        error: connected.error,
        status: { id, state: 'error', toolCount: 0, lastError: connected.error },
      }
    }
    const info: McpServerInfo = connected.serverInfo
    base.serverName = info.name
    const ensured = await base.lazy.buildIndex()
    base.toolCount = ensured.ok ? ensured.value.count : 0
    if (!ensured.ok) base.lastError = ensured.error

    return {
      ok: true,
      status: {
        id,
        state: 'connected',
        serverName: base.serverName,
        toolCount: base.toolCount,
        connectedAt: base.connectedAt,
        ...(base.lastError !== undefined ? { lastError: base.lastError } : {}),
      },
    }
  }

  /** Kill the child process and drop the tool index (frees context). */
  disconnect(id: string): { ok: boolean; error?: string } {
    const connection = this.connections.get(id)
    if (connection === undefined) return { ok: false, error: `not connected: ${id}` }
    connection.client.disconnect()
    this.connections.delete(id)
    this.disconnected.set(id, {
      id,
      state: 'disconnected',
      toolCount: 0,
      connectedAt: connection.connectedAt,
    })
    return { ok: true }
  }

  /** Inert disconnect markers kept for the dashboard. */
  private readonly disconnected = new Map<string, McpConnectionStatus>()

  statusOf(id: string): McpConnectionStatus | undefined {
    const live = this.connections.get(id)
    if (live !== undefined) {
      return {
        id,
        state: 'connected',
        serverName: live.serverName,
        toolCount: live.toolCount,
        connectedAt: live.connectedAt,
        ...(live.lastError !== undefined ? { lastError: live.lastError } : {}),
      }
    }
    return this.disconnected.get(id)
  }

  /** Dashboard rows, sorted by server id. */
  statuses(): McpConnectionStatus[] {
    const rows: McpConnectionStatus[] = []
    for (const id of [...this.connections.keys(), ...this.disconnected.keys()].sort()) {
      const status = this.statusOf(id)
      if (status !== undefined) rows.push(status)
    }
    return rows
  }

  /** Tool schemas for an id, loading them lazily on demand. */
  async loadTools(
    id: string,
    names: readonly string[],
  ): Promise<{ ok: true; tools: unknown[] } | { ok: false; error: string }> {
    const connection = this.connections.get(id)
    if (connection === undefined) return { ok: false, error: `not connected: ${id}` }
    if (connection.lazy.stats().indexSize === 0) {
      const built = await connection.lazy.buildIndex()
      if (!built.ok) return built
    }
    const loaded = await connection.lazy.loadSchemas(names)
    if (!loaded.ok) return loaded
    return { ok: true, tools: loaded.value }
  }
}
