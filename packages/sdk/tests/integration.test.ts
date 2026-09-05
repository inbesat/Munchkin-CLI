import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ForgeServer } from '@forge/server'
import type { AgentExecutor, AgentRunResult } from '@forge/server'
import { ForgeApiError, ForgeClient } from '../src'

/**
 * In-process test harness: the SDK talks to `app.request()` directly (no
 * sockets), so we can validate request/response wiring without a running
 * HTTP server.
 */
class AppTransport {
  constructor(private app: ForgeServer['getApp'] extends () => infer A ? () => A : never) {}
  async fetch(url: string, init?: RequestInit): Promise<Response> {
    const path = new URL(url).pathname + new URL(url).search
    return this.app().request(path, init as RequestInit & { headers?: Record<string, string> })
  }
}

const mockExecutor = {
  executePrompt: async (
    _sessionId: string,
    prompt: string,
    _options: unknown,
  ): Promise<AgentRunResult> => ({
    reason: 'complete',
    response: `echo:${prompt}`,
    messages: [],
    turns: 1,
    usage: { input: 1, output: 2, total: 3 },
    error: undefined,
  }),
} as unknown as AgentExecutor

describe('ForgeClient ↔ ForgeServer (in-process)', () => {
  let server: ForgeServer
  let baseDir: string
  let client: ForgeClient

  beforeAll(async () => {
    baseDir = mkdtempSync(join(tmpdir(), 'forge-sdk-int-'))
    server = await (await import('@forge/server')).ForgeServer.create({
      baseDir,
      dbPath: join(baseDir, 'sessions.db'),
      corsOrigins: ['*'],
      agentExecutor: mockExecutor,
    })
    const transport = new AppTransport(() => server.getApp())
    // Cast to a fetch-compatible function; the Hono app.request signature
    // matches what we need (path string + RequestInit).
    ;(transport as unknown as { fetch: typeof fetch }).fetch = transport.fetch.bind(transport)
    client = new ForgeClient({
      baseUrl: 'http://test.local',
      fetchImpl: transport.fetch as unknown as typeof fetch,
    })
  })

  afterAll(() => {
    server.close()
    try {
      rmSync(baseDir, { recursive: true, force: true })
    } catch {
      // best-effort cleanup
    }
  })

  it('health() returns the live health payload', async () => {
    const h = await client.health()
    expect(h.status).toBe('ok')
    expect(typeof h.version).toBe('string')
    expect(typeof h.uptime).toBe('number')
  })

  it('ready() returns ready=true', async () => {
    const r = await client.ready()
    expect(r.ready).toBe(true)
    expect(typeof r.checks).toBe('object')
  })

  it('openAPISpec() returns a 3.1 document with the expected title', async () => {
    const spec = (await client.openAPISpec()) as { openapi: string; info: { title: string } }
    expect(spec.openapi).toBe('3.1.0')
    expect(spec.info.title).toBe('Forge Server API')
  })

  it('list tools and execute a tool', async () => {
    const tools = await client.tools.list()
    expect(tools.find((t) => t.name === 'read')).toBeDefined()

    // Use the `read` tool against a file that exists in the repo so we don't
    // depend on shell semantics on the test host.
    const pkg = join(import.meta.dir, '..', 'package.json').replace(/\\/g, '/')
    const r = await client.tools.execute({ name: 'read', args: { path: pkg } })
    expect(typeof r.durationMs).toBe('number')
    // Either we got the file contents or a permission/IO error — either way,
    // the SDK translated the HTTP round-trip into a typed response.
    expect(r.result.length + (r.error?.length ?? 0)).toBeGreaterThan(0)
  })

  it('config round-trip via the SDK', async () => {
    const key = 'theme.name'
    const before = await client.configConfig.get(key)
    const original = before.value
    try {
      const set = await client.configConfig.set({ key, value: 'light', scope: 'project' })
      expect(set.value).toBe('light')
      const got = await client.configConfig.get(key)
      expect(got.value).toBe('light')
    } finally {
      await client.configConfig.set({ key, value: original, scope: 'project' })
    }
  })

  it('returns CONFIG_NOT_FOUND for an unknown config key', async () => {
    try {
      await client.configConfig.get('definitely.not.set.via.test')
      throw new Error('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(ForgeApiError)
      expect((err as ForgeApiError).status).toBe(404)
      expect((err as ForgeApiError).code).toBe('CONFIG_NOT_FOUND')
    }
  })

  it('creates a session, fetches it, lists it, and deletes it', async () => {
    const created = await client.sessions.create({
      cwd: '/tmp/sdk-test',
      model: 'auto',
      title: 'sdk',
    })
    expect(created.id).toBeDefined()
    expect(created.status).toBe('active')

    const fetched = await client.sessions.get(created.id)
    expect(fetched.id).toBe(created.id)
    expect(fetched.title).toBe('sdk')

    const list = await client.sessions.list({ limit: 5 })
    expect(list.find((s) => s.id === created.id)).toBeDefined()

    const del = await client.sessions.delete(created.id)
    expect(del.success).toBe(true)
  })

  it('submits a prompt using the injected mock executor', async () => {
    const created = await client.sessions.create({ cwd: '/tmp/sdk-test-2', model: 'auto' })
    try {
      const out = await client.prompts.submit(created.id, { prompt: 'hello world' })
      expect(out.response).toBe('echo:hello world')
      expect(out.reason).toBe('complete')
      expect(out.usage.total).toBe(3)
    } finally {
      await client.sessions.delete(created.id)
    }
  })

  it('returns 404 when submitting a prompt against an unknown session', async () => {
    try {
      await client.prompts.submit('does-not-exist', { prompt: 'x' })
      throw new Error('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(ForgeApiError)
      expect((err as ForgeApiError).status).toBe(404)
    }
  })

  it('rejects malformed session create payloads with a validation error', async () => {
    try {
      await client.sessions.create({ cwd: '' })
      throw new Error('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(ForgeApiError)
      expect((err as ForgeApiError).status).toBe(400)
      expect((err as ForgeApiError).code).toBe('VALIDATION_ERROR')
    }
  })

  it('reports auth status', async () => {
    const s = await client.auth.status()
    expect(typeof s.authenticated).toBe('boolean')
    expect(typeof s.providers).toBe('object')
  })

  it('reports sse stats (zero clients when no one is connected)', async () => {
    const stats = await client.sse.stats()
    expect(stats.totalClients).toBe(0)
  })

  it('broadcasts an event and reports the delivered count', async () => {
    const out = await client.sse.broadcast({
      event: 'text_delta',
      data: { sessionId: 'x', delta: 'hi' },
    })
    expect(typeof out.delivered).toBe('number')
  })
})
