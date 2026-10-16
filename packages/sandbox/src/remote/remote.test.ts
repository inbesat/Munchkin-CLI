import { afterAll, describe, expect, it } from 'bun:test'
import { DaytonaSandboxProvider } from './daytona'
import { E2BSandboxProvider } from './e2b'

type Recorded = { path: string; method: string; auth: string | null; body: unknown }

const e2bCalls: Recorded[] = []
const daytonaCalls: Recorded[] = []

const servers: ReturnType<typeof Bun.serve>[] = []
afterAll(() => {
  for (const server of servers) server.stop(true)
})

function e2bMock(): number {
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      const url = new URL(request.url)
      const body = request.method === 'POST' ? await request.json().catch(() => ({})) : {}
      e2bCalls.push({
        path: url.pathname,
        method: request.method,
        auth: request.headers.get('x-api-key'),
        body,
      })
      if (request.method === 'POST' && url.pathname === '/sandboxes') {
        return new Response(JSON.stringify({ sandboxId: 'sbx-123' }), { status: 200 })
      }
      if (request.method === 'POST' && url.pathname.startsWith('/sandboxes/sbx-123/commands')) {
        const payload = body as { cmd?: string }
        if (payload.cmd?.includes('/etc/probe')) {
          return new Response(JSON.stringify({ stdout: 'Permission denied', exitCode: 1 }), {
            status: 200,
          })
        }
        return new Response(JSON.stringify({ stdout: 'ok-remote', exitCode: 0 }), { status: 200 })
      }
      if (request.method === 'DELETE' && url.pathname === '/sandboxes/sbx-123') {
        return new Response(null, { status: 204 })
      }
      return new Response('nf', { status: 404 })
    },
  })
  servers.push(server)
  return server.port
}

function daytonaMock(): number {
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      const url = new URL(request.url)
      const body = request.method === 'POST' ? await request.json().catch(() => ({})) : {}
      daytonaCalls.push({
        path: url.pathname,
        method: request.method,
        auth: request.headers.get('authorization'),
        body,
      })
      if (request.method === 'POST' && url.pathname === '/workspace') {
        return new Response(JSON.stringify({ id: 'ws-777' }), { status: 200 })
      }
      if (request.method === 'POST' && url.pathname === '/workspace/ws-777/exec') {
        const payload = body as { command?: string }
        if (payload.command?.includes('/etc/probe')) {
          return new Response(JSON.stringify({ output: 'Permission denied', exitCode: 1 }), {
            status: 200,
          })
        }
        return new Response(JSON.stringify({ output: 'daytona-ok', exitCode: 0 }), { status: 200 })
      }
      if (request.method === 'DELETE' && url.pathname === '/workspace/ws-777') {
        return new Response(null, { status: 204 })
      }
      return new Response('nf', { status: 404 })
    },
  })
  servers.push(server)
  return server.port
}

describe('remote sandbox providers (Phase 130)', () => {
  it('E2B: creates the sandbox once, executes commands, requires the API key', async () => {
    const port = e2bMock()
    const provider = new E2BSandboxProvider({
      apiKey: 'e2b-test-key',
      baseUrl: `http://localhost:${port}`,
    })
    expect((await provider.isAvailable()) && provider.info().available).toBe(true)

    const result = await provider.execute({ command: 'echo', args: ['hi'] })
    expect(result.error).toBeUndefined()
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toBe('ok-remote')

    // Second execute reuses the sandbox - exactly one create call.
    await provider.execute({ command: 'echo', args: ['again'] })
    expect(e2bCalls.filter((c) => c.path === '/sandboxes' && c.method === 'POST')).toHaveLength(1)
    expect(e2bCalls.every((c) => c.auth === 'e2b-test-key')).toBe(true)

    const dispose = await provider.dispose()
    expect(dispose.ok).toBe(true)
    const e2bAfterDispose = new E2BSandboxProvider({ baseUrl: `http://localhost:${port}` })
    expect(await e2bAfterDispose.isAvailable()).toBe(false)
    const failed = await e2bAfterDispose.execute({ command: 'echo', args: ['x'] })
    expect(failed.ok === undefined).toBe(true)
    expect(failed.exitCode).toBeNull()
    expect(failed.error).toContain('E2B_API_KEY')
  })

  it('E2B isolation probes run remotely and honor denial results', async () => {
    const port = e2bMock()
    const provider = new E2BSandboxProvider({
      apiKey: 'e2b-test-key',
      baseUrl: `http://localhost:${port}`,
    })
    const report = await provider.checkIsolation()
    expect(report.checks.map((c) => c.name)).toEqual(['home-write-allowed', 'denied: /etc write'])
    expect(report.isolated).toBe(true)
    await provider.dispose()
  })

  it('Daytona: creates the workspace, executes, bearer-auths, disposes', async () => {
    const port = daytonaMock()
    const provider = new DaytonaSandboxProvider({
      apiKey: 'daytona-test-key',
      baseUrl: `http://localhost:${port}`,
    })
    expect(await provider.isAvailable()).toBe(true)

    const result = await provider.execute({ command: 'echo', args: ['hi'] })
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toBe('daytona-ok')
    await provider.execute({ command: 'echo', args: ['second'] })
    expect(daytonaCalls.filter((c) => c.path === '/workspace' && c.method === 'POST')).toHaveLength(
      1,
    )
    expect(daytonaCalls.every((c) => c.auth === 'Bearer daytona-test-key')).toBe(true)

    const dispose = await provider.dispose()
    expect(dispose.ok).toBe(true)
    expect(daytonaCalls.some((c) => c.method === 'DELETE' && c.path === '/workspace/ws-777')).toBe(
      true,
    )
  })

  it('missing API keys keep both providers inert without throwing', async () => {
    const e2b = new E2BSandboxProvider({ baseUrl: 'http://localhost:1' })
    const daytona = new DaytonaSandboxProvider({ baseUrl: 'http://localhost:1' })
    expect(await e2b.isAvailable()).toBe(false)
    expect(await daytona.isAvailable()).toBe(false)
    expect(e2b.info().unsupportedReason).toContain('E2B_API_KEY')
    expect(daytona.info().unsupportedReason).toContain('DAYTONA_API_KEY')

    const e2bExecute = await e2b.execute({ command: 'echo', args: ['x'] })
    expect(e2bExecute.error).toContain('E2B_API_KEY')
    const daytonaExecute = await daytona.execute({ command: 'echo', args: ['x'] })
    expect(daytonaExecute.error).toContain('DAYTONA_API_KEY')
  })
})
