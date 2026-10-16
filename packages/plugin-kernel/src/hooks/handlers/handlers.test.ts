import { describe, expect, it } from 'bun:test'
import { agentHook } from './agent'
import { commandHook } from './command'
import { httpHook } from './http'
import { mcpToolHook } from './mcp-tool'
import { promptHook } from './prompt'

const payload = { toolName: 'write', args: { path: 'x.ts' } }

describe('command handler (Phase 104)', () => {
  it('exit 0: observes without blocking', async () => {
    let received = ''
    const hook = commandHook({
      command: 'echo done',
      runner: (cmd, _cwd, stdin) => {
        received = `${cmd}|${stdin ?? ''}`
        return { status: 0, stdout: 'ok', stderr: '' }
      },
    })
    const outcome = await hook(payload)
    expect(outcome).toBeUndefined()
    expect(received).toContain('echo done')
  })

  it('exit 2 blocks with stderr as the reason (ARCHITECTURE convention)', async () => {
    const hook = commandHook({
      command: 'guard.sh',
      runner: () => ({ status: 2, stdout: '', stderr: 'rm -rf is not allowed' }),
    })
    const outcome = await hook(payload)
    expect(outcome).toEqual({ block: true, reason: 'rm -rf is not allowed' })
  })

  it('runner exceptions block (fail-closed) instead of throwing', async () => {
    const hook = commandHook({
      command: 'boom.sh',
      runner: () => {
        throw new Error('spawn ENOENT')
      },
    })
    const outcome = await hook(payload)
    expect(outcome).toMatchObject({ block: true })
    expect(outcome?.reason).toContain('spawn ENOENT')
  })
})

describe('http handler (Phase 104)', () => {
  it('403 blocks with the response body as reason', async () => {
    const hook = httpHook({
      url: 'https://hooks.example.test/guard',
      fetchImpl: async () => new Response('policy violation', { status: 403 }),
    })
    const outcome = await hook(payload)
    expect(outcome).toEqual({ block: true, reason: 'policy violation' })
  })

  it('2xx observes; network errors block fail-closed with the error message', async () => {
    const okHook = httpHook({
      url: 'https://hooks.example.test/ok',
      fetchImpl: async () => new Response('{"ok":true}', { status: 200 }),
    })
    expect(await okHook(payload)).toBeUndefined()

    const failingHook = httpHook({
      url: 'https://hooks.example.test/fail',
      fetchImpl: async () => {
        throw new Error('dns failure')
      },
    })
    const outcome = await failingHook(payload)
    expect(outcome).toMatchObject({ block: true })
    expect(outcome?.reason).toContain('dns failure')
  })
})

describe('prompt handler (Phase 104)', () => {
  it('BLOCK: prefix blocks with the reason', async () => {
    const hook = promptHook({ generate: async () => 'BLOCK: dangerous change' })
    const outcome = await hook({ prompt: 'do stuff' })
    expect(outcome).toEqual({ block: true, reason: 'dangerous change' })
  })

  it('OK output observes; generator failures block fail-closed', async () => {
    const okHook = promptHook({ generate: async () => 'OK — allowed' })
    expect(await okHook({ prompt: 'hello' })).toBeUndefined()

    const failingHook = promptHook({
      generate: async () => {
        throw new Error('rate limited')
      },
    })
    const outcome = await failingHook({ prompt: 'hello' })
    expect(outcome).toMatchObject({ block: true })
    expect(outcome?.reason).toContain('rate limited')
  })
})

describe('mcp_tool handler (Phase 104)', () => {
  it('propagates a block result from the MCP tool', async () => {
    const hook = mcpToolHook({
      toolName: 'guard',
      invoker: async () => ({ ok: true, output: { block: true, reason: 'denied by mcp' } }),
    })
    const outcome = await hook(payload)
    expect(outcome).toEqual({ block: true, reason: 'denied by mcp' })
  })

  it('tool failure blocks fail-closed with the tool output serialized', async () => {
    const hook = mcpToolHook({
      toolName: 'guard',
      invoker: async () => ({ ok: false, output: 'mcp server unreachable' }),
    })
    const outcome = await hook(payload)
    expect(outcome).toMatchObject({ block: true })
    expect(outcome?.reason).toContain('mcp server unreachable')
  })
})

describe('agent handler (Phase 104)', () => {
  it('summary starting with BLOCK: blocks; agent receives the payload', async () => {
    const seen: string[] = []
    const hook = agentHook({
      spawner: async (task, signal) => {
        seen.push(`${task}|${signal !== undefined}`)
        return 'BLOCK: agent refused'
      },
    })
    const outcome = await hook({ task: 'danger' })
    expect(outcome).toEqual({ block: true, reason: 'agent refused' })
    expect(seen[0]).toContain('danger')
  })

  it('non-blocking summary observes; spawner failures block fail-closed', async () => {
    const okHook = agentHook({
      spawner: async () => 'reviewed, no findings',
      timeoutMs: 1000,
    })
    expect(await okHook({ task: 'safe' })).toBeUndefined()

    const failingHook = agentHook({
      spawner: async () => {
        throw new Error('agent timeout')
      },
    })
    const outcome = await failingHook({ task: 'x' })
    expect(outcome).toMatchObject({ block: true })
    expect(outcome?.reason).toContain('agent timeout')
  })
})
