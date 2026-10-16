import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ForgeServer } from '../src/server'
import type { AgentExecutor, AgentRunResult } from '../src/services/agent-executor'

const mockExecutor = {
  executePrompt: async (
    _sessionId: string,
    prompt: string,
    _options: unknown,
    _onEvent?: unknown,
  ): Promise<AgentRunResult> => ({
    reason: 'complete',
    response: `echo:${prompt}`,
    messages: [],
    turns: 1,
    usage: { input: 1, output: 2, total: 3 },
    error: undefined,
  }),
} as unknown as AgentExecutor

describe('ForgeServer (integration)', () => {
  let server: ForgeServer
  let baseDir: string

  beforeAll(async () => {
    baseDir = mkdtempSync(join(tmpdir(), 'forge-server-test-'))
    server = await ForgeServer.create({
      baseDir,
      dbPath: join(baseDir, 'sessions.db'),
      corsOrigins: ['*'],
      agentExecutor: mockExecutor,
    })
  })

  afterAll(async () => {
    server.close()
    await new Promise((r) => setTimeout(r, 100))
    try {
      rmSync(baseDir, { recursive: true, force: true })
    } catch {
      // best-effort cleanup on Windows (file lock may linger)
    }
  })

  it('GET /health returns ok', async () => {
    const res = await server.getApp().request('/health')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('ok')
  })

  it('GET /api/config/default returns the default config', async () => {
    const res = await server.getApp().request('/api/config/default')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('model')
  })

  it('config POST then GET round-trips', async () => {
    const post = await server.getApp().request('/api/config', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key: 'model.model', value: 'claude-opus-4' }),
    })
    expect(post.status).toBe(200)

    const get = await server.getApp().request('/api/config/model.model?scope=project')
    expect(get.status).toBe(200)
    const body = await get.json()
    expect(body.value).toBe('claude-opus-4')
  })

  it('GET /api/tools lists available tools', async () => {
    const res = await server.getApp().request('/api/tools')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body)).toBe(true)
    expect(body.some((t: { name: string }) => t.name === 'read')).toBe(true)
  })

  it('rejects session create without cwd (validation)', async () => {
    const res = await server.getApp().request('/api/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'auto' }),
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })

  it('creates a session then runs a prompt via injected executor', async () => {
    const create = await server.getApp().request('/api/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ cwd: '/tmp', model: 'auto', title: 'test' }),
    })
    expect(create.status).toBe(201)
    const session = await create.json()
    expect(session.id).toBeDefined()
    const sessionId = session.id as string

    const prompt = await server.getApp().request(`/api/prompts/${sessionId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: 'hi' }),
    })
    expect(prompt.status).toBe(200)
    const pref = await prompt.json()
    expect(pref.response).toBe('echo:hi')
    expect(pref.turns).toBe(1)
  })

  it('GET /api/sessions/:id returns 404 for unknown session', async () => {
    const res = await server.getApp().request('/api/sessions/does-not-exist')
    expect(res.status).toBe(404)
  })

  it('GET /api/sse/stats returns hub stats', async () => {
    const res = await server.getApp().request('/api/sse/stats')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('clients')
  })

  it('applies CORS headers', async () => {
    const res = await server.getApp().request('/health', {
      headers: { origin: 'http://example.com' },
    })
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
  })

  it('GET /api/auth returns provider status without secrets', async () => {
    const res = await server.getApp().request('/api/auth')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('authenticated')
    expect(body).toHaveProperty('providers')
    expect(body.providers).toHaveProperty('anthropic')
  })

  it('GET /api/openapi.json serves the OpenAPI 3.1 spec', async () => {
    const res = await server.getApp().request('/api/openapi.json')
    expect(res.status).toBe(200)
    const spec = await res.json()
    expect(spec.openapi).toBe('3.1.0')
    expect(spec.paths).toHaveProperty('/api/sessions')
    expect(spec.paths).toHaveProperty('/api/prompts/{sessionId}')
  })

  it('GET /docs serves the Scalar API reference', async () => {
    const res = await server.getApp().request('/docs')
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toInclude('/api/openapi.json')
    expect(html).toInclude('@scalar/api-reference')
  })
})
