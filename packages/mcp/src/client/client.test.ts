import { afterAll, describe, expect, it } from 'bun:test'
import { join } from 'node:path'
import { McpToolClient } from './tools'

const MOCK_SERVER = join(import.meta.dir, 'mock-server.ts')

describe('MCP client, stdio transport (Phase 117)', () => {
  const clients: McpToolClient[] = []

  afterAll(() => {
    for (const client of clients) client.disconnect()
  })

  function spawnClient(): McpToolClient {
    const client = McpToolClient.spawn({
      command: process.execPath,
      args: ['run', MOCK_SERVER],
    })
    clients.push(client)
    return client
  }

  it('connects to a local MCP server and completes the initialize handshake', async () => {
    const client = spawnClient()
    const connected = await client.connect()
    expect(connected.ok).toBe(true)
    if (connected.ok) {
      expect(connected.serverInfo.name).toBe('forge-mock-mcp')
      expect(connected.serverInfo.version).toBe('1.0.0')
    }
  })

  it('discovers available tools from the server', async () => {
    const client = spawnClient()
    await client.connect()
    const listed = await client.listTools()
    expect(listed.ok).toBe(true)
    if (listed.ok) {
      expect(listed.tools.map((t) => t.name)).toEqual(['echo', 'add', 'slow', 'fail'])
      expect(listed.tools.find((t) => t.name === 'echo')?.description).toBe(
        'Echoes the message back',
      )
      expect(listed.tools.find((t) => t.name === 'echo')?.inputSchema).toBeDefined()
    }
  })

  it('executes a tool and surfaces error results as isError', async () => {
    const client = spawnClient()
    await client.connect()

    const echo = await client.callTool('echo', { message: 'hello forge' })
    expect(echo.ok).toBe(true)
    if (echo.ok) {
      expect(echo.result.isError).toBe(false)
      expect(echo.result.content[0]?.text).toBe('hello forge')
    }

    const add = await client.callTool('add', { a: 2, b: 40 })
    expect(add.ok).toBe(true)
    if (add.ok) expect(add.result.content[0]?.text).toBe('42')

    const failing = await client.callTool('fail', { message: 'boom' })
    expect(failing.ok).toBe(true)
    if (failing.ok) expect(failing.result.isError).toBe(true)
  })

  it('times out instead of hanging when the server never answers', async () => {
    const client = spawnClient(150)
    await client.connect()
    const slow = await client.callTool('slow', { delay: 5_000 }, 150)
    expect(slow.ok).toBe(false)
    if (!slow.ok) expect(slow.error).toContain('timed out')
    client.disconnect()
  })

  it('adapts discovered tools into core-registry definitions', async () => {
    const client = spawnClient()
    await client.connect()
    const registeredDefs: { name: string; parameters: unknown }[] = []
    const handlerPromises: Promise<unknown>[] = []
    const results: unknown[] = []
    const registry = {
      register: (
        definition: { name: string; parameters: unknown },
        handler: () => Promise<unknown>,
      ) => {
        registeredDefs.push({ name: definition.name, parameters: definition.parameters })
        handlerPromises.push(
          handler({ message: 'ping' }).then((r) => {
            results.push(r)
            return r
          }),
        )
        return { ok: true }
      },
    }
    const outcome = await client.registerToolsInto(registry, { prefix: 'mcp_' })
    await Promise.all(handlerPromises)
    expect(outcome.registered).toEqual(['mcp_echo', 'mcp_add', 'mcp_slow', 'mcp_fail'])
    expect(outcome.errors).toEqual([])
    expect(registeredDefs.length).toBe(4)
    expect(registeredDefs[0]?.parameters).toBeDefined()
    expect(results.length).toBe(4)
    client.disconnect()
  })

  it('spawning a nonexistent server fails without throwing', async () => {
    const client = McpToolClient.spawn({
      command: 'definitely-not-a-real-mcp-server-xyz',
      args: ['--whatever'],
      requestTimeoutMs: 2_000,
    })
    clients.push(client)
    const connected = await client.connect()
    expect(connected.ok).toBe(false)
    if (!connected.ok) expect(connected.error.length).toBeGreaterThan(0)
    client.disconnect()
  })
})
