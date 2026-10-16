import { afterAll, describe, expect, it } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { McpToolClient } from '../client/tools'

const SERVER_ENTRY = join(import.meta.dir, 'forge-server.ts')

describe('forge MCP server (Phase 124)', () => {
  const clients: McpToolClient[] = []
  const dirs: string[] = []
  afterAll(() => {
    for (const client of clients) client.disconnect()
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
  })

  function connectServer(cwd?: string): McpToolClient {
    const workDir = cwd ?? process.cwd()
    const client = McpToolClient.spawn({
      command: process.execPath,
      args: ['run', SERVER_ENTRY, workDir],
      requestTimeoutMs: 15_000,
    })
    clients.push(client)
    return client
  }

  it('exposes the default forge capability tools over the MCP protocol', async () => {
    const client = connectServer()
    const connected = await client.connect()
    expect(connected.ok).toBe(true)
    if (connected.ok) expect(connected.serverInfo.name).toBe('forge')

    const listed = await client.listTools()
    expect(listed.ok).toBe(true)
    if (listed.ok) {
      expect(listed.tools.map((t) => t.name)).toEqual([
        'forge_status',
        'run_tests',
        'git_diff',
        'new_task',
        'read_task_queue',
      ])
      expect(listed.tools.find((t) => t.name === 'run_tests')?.inputSchema).toBeDefined()
    }
  })

  it('answers forge_status and git_diff tool calls with real data', async () => {
    const client = connectServer()
    await client.connect()

    const status = await client.callTool('forge_status')
    expect(status.ok).toBe(true)
    if (status.ok) {
      expect(status.result.isError).toBe(false)
      expect(status.result.content[0]?.text).toContain('forge-mcp')
    }

    const diff = await client.callTool('git_diff')
    expect(diff.ok).toBe(true)
    if (diff.ok) expect(typeof diff.result.content[0]?.text).toBe('string')

    const unknown = await client.callTool('no_such_tool')
    expect(unknown.ok).toBe(true)
    if (unknown.ok) expect(unknown.result.isError).toBe(true)
  })

  it('run_tests executes the suite with a scope in the target workspace', async () => {
    const client = connectServer()
    await client.connect()
    const result = await client.callTool('run_tests', { scope: 'src/client/lazy' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.result.content[0]?.text).toContain('PASS')
      expect(result.result.isError).toBe(false)
    }
  }, 60_000)

  it('new_task queues delegation work the queue outbox exposes', async () => {
    const workDir = mkdtempSync(join(tmpdir(), 'forge-mcp-delegate-'))
    dirs.push(workDir)
    const client = connectServer(workDir)
    await client.connect()

    const queued = await client.callTool('new_task', { task: 'summarize the audit ledger' })
    expect(queued.ok).toBe(true)
    if (queued.ok) expect(queued.result.isError).toBe(false)

    const queuePath = join(workDir, '.forge', 'mcp-tasks.jsonl')
    expect(existsSync(queuePath)).toBe(true)
    const raw = readFileSync(queuePath, 'utf-8')
    expect(raw).toContain('summarize the audit ledger')

    const queue = await client.callTool('read_task_queue')
    expect(queue.ok).toBe(true)
    if (queue.ok) {
      expect(queue.result.content[0]?.text).toContain('summarize the audit ledger')
    }

    const empty = await client.callTool('new_task', { task: '   ' })
    expect(empty.ok).toBe(true)
    if (empty.ok) expect(empty.result.isError).toBe(true)
  })
})
