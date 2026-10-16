import { afterAll, describe, expect, it } from 'bun:test'
import { join } from 'node:path'
import type { ResolvedServerSpec } from '../presets'
import { McpConnectionManager } from './manager'

const MOCK_SERVER = join(import.meta.dir, 'mock-server.ts')

function mockSpec(): ResolvedServerSpec {
  return { command: process.execPath, args: ['run', MOCK_SERVER], env: {} }
}

describe('MCP server health dashboard registry (Phase 123)', () => {
  const managers: McpConnectionManager[] = []
  afterAll(() => {
    for (const manager of managers) {
      for (const id of manager.statuses().map((row) => row.id)) manager.disconnect(id)
    }
  })

  it('connects to multiple servers and shows status, tools, and errors', async () => {
    const manager = new McpConnectionManager()
    managers.push(manager)

    const first = await manager.connect('mock-a', mockSpec())
    expect(first.ok).toBe(true)
    if (first.ok) {
      expect(first.status.state).toBe('connected')
      expect(first.status.serverName).toBe('forge-mock-mcp')
      expect(first.status.toolCount).toBe(4)
    }

    const second = await manager.connect('mock-b', mockSpec())
    expect(second.ok).toBe(true)

    const dead = await manager.connect('dead', {
      command: 'definitely-not-a-real-server-xyz',
      args: [],
      env: {},
    })
    expect(dead.ok).toBe(false)
    if (!dead.ok) expect(dead.error.length).toBeGreaterThan(0)

    const rows = manager.statuses()
    expect(rows.map((r) => `${r.id}:${r.state}:${r.toolCount}`)).toEqual([
      'dead:error:0',
      'mock-a:connected:4',
      'mock-b:connected:4',
    ])
    const deadRow = rows.find((r) => r.id === 'dead')
    expect(deadRow?.lastError).toBeDefined()
    expect(deadRow?.serverName).toBeUndefined()
  })

  it('disconnecting frees the tool index and marks the server down', async () => {
    const manager = new McpConnectionManager()
    managers.push(manager)
    const connected = await manager.connect('mock-a', mockSpec())
    expect(connected.ok).toBe(true)

    const gone = manager.disconnect('mock-a')
    expect(gone.ok).toBe(true)

    const status = manager.statusOf('mock-a')
    expect(status?.state).toBe('disconnected')
    expect(status?.toolCount).toBe(0)
    expect(manager.statuses().filter((r) => r.state === 'connected')).toHaveLength(0)

    expect(manager.disconnect('mock-a').ok).toBe(false)
    expect(manager.disconnect('never-connected').ok).toBe(false)
  })

  it('reconnect repairs a disconnected server', async () => {
    const manager = new McpConnectionManager()
    managers.push(manager)
    await manager.connect('mock-a', mockSpec())
    manager.disconnect('mock-a')

    const repaired = await manager.connect('mock-a', mockSpec())
    expect(repaired.ok).toBe(true)
    const status = manager.statusOf('mock-a')
    expect(status?.state).toBe('connected')
    expect(status?.toolCount).toBe(4)
  })

  it('lazy tool loading works through the manager and fails cleanly when down', async () => {
    const manager = new McpConnectionManager()
    managers.push(manager)
    await manager.connect('mock-a', mockSpec())
    const loaded = await manager.loadTools('mock-a', ['echo'])
    expect(loaded.ok).toBe(true)

    manager.disconnect('mock-a')
    const down = await manager.loadTools('mock-a', ['echo'])
    expect(down.ok).toBe(false)
    if (!down.ok) expect(down.error).toContain('not connected')
  })
})
