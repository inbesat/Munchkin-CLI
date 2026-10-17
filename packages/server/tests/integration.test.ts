import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { createOfflineModel } from './fixtures/offline-model'

let baseDir: string
// biome-ignore lint/suspicious/noExplicitAny: assigned in beforeAll via a dynamic import (avoids a static import cycle); exercised per test at runtime
let server: any
let authHeader: string

describe('ForgeServer Full Integration Suite', () => {
  beforeAll(async () => {
    const { mkdtempSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const { ForgeServer } = await import('../src/server')
    const { AuthStore } = await import('../src/auth/store')

    baseDir = mkdtempSync(join(tmpdir(), 'forge-integration-'))
    const authStore = new AuthStore({ baseDir: join(baseDir, 'auth') })
    await authStore.load()
    const { secret } = await authStore.createKey({ name: 'test-key', env: 'test' })
    authHeader = `Bearer ${secret}`

    server = await ForgeServer.create({
      baseDir,
      dbPath: join(baseDir, 'sessions.db'),
      corsOrigins: ['*'],
      authStore,
      modelResolver: async () => createOfflineModel(),
    })
  })

  afterAll(async () => {
    server.close()
    await new Promise((r) => setTimeout(r, 100))
    try {
      const { rmSync } = await import('node:fs')
      rmSync(baseDir, { recursive: true, force: true })
    } catch {
      // best-effort
    }
  })

  // ── Basic health and metadata ──

  it('GET /health returns ok', async () => {
    const res = await server.getApp().request('/health')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('ok')
  })

  it('GET /api/config/default returns defaults', async () => {
    const res = await server.getApp().request('/api/config/default', {
      headers: { authorization: authHeader },
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('model')
  })

  it('GET /api/tools lists all tools', async () => {
    const res = await server.getApp().request('/api/tools', {
      headers: { authorization: authHeader },
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body)).toBe(true)
    expect(body.some((t: { name: string }) => t.name === 'read')).toBe(true)
  })

  // ── Session lifecycle ──

  it('creates a session', async () => {
    const create = await server.getApp().request('/api/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: authHeader },
      body: JSON.stringify({ cwd: '/tmp', model: 'auto', title: 'integ test' }),
    })
    expect(create.status).toBe(201)
    const session = await create.json()
    expect(session.id).toBeDefined()
    expect(session.title).toBe('integ test')
    expect(session.status).toBe('active')
  })

  it('lists sessions', async () => {
    const res = await server.getApp().request('/api/sessions', {
      headers: { authorization: authHeader },
    })
    expect(res.status).toBe(200)
    const list = await res.json()
    expect(Array.isArray(list)).toBe(true)
    expect(list.length).toBeGreaterThan(0)
  })

  it('gets a session by id', async () => {
    const create = await server.getApp().request('/api/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: authHeader },
      body: JSON.stringify({ cwd: '/tmp', model: 'auto' }),
    })
    const session = await create.json()
    const get = await server.getApp().request(`/api/sessions/${session.id}`, {
      headers: { authorization: authHeader },
    })
    expect(get.status).toBe(200)
    const fetched = await get.json()
    expect(fetched.id).toBe(session.id)
  })

  it('deletes a session', async () => {
    const create = await server.getApp().request('/api/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: authHeader },
      body: JSON.stringify({ cwd: '/tmp' }),
    })
    const session = await create.json()
    const del = await server.getApp().request(`/api/sessions/${session.id}`, {
      method: 'DELETE',
      headers: { authorization: authHeader },
    })
    expect(del.status).toBe(200)
    const get = await server.getApp().request(`/api/sessions/${session.id}`, {
      headers: { authorization: authHeader },
    })
    expect(get.status).toBe(404)
  })

  // ── Prompt execution with mocked agent ──

  it('executes a prompt and returns the response', async () => {
    const create = await server.getApp().request('/api/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: authHeader },
      body: JSON.stringify({ cwd: '/tmp', model: 'auto' }),
    })
    const session = await create.json()

    const prompt = await server.getApp().request(`/api/prompts/${session.id}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: authHeader },
      body: JSON.stringify({ prompt: 'Hello world' }),
    })
    expect(prompt.status).toBe(200)
    const result = await prompt.json()
    expect(result.sessionId).toBe(session.id)
    expect(typeof result.response).toBe('string')
    expect(result.turns).toBeGreaterThan(0)
    expect(result.usage.total).toBeGreaterThan(0)
  })

  it('handles unknown session gracefully', async () => {
    const prompt = await server.getApp().request('/api/prompts/unknown-id', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: authHeader },
      body: JSON.stringify({ prompt: 'test' }),
    })
    expect(prompt.status).toBe(404)
  })

  // ── Tool execution ──

  it('lists available tools', async () => {
    const res = await server.getApp().request('/api/tools', {
      headers: { authorization: authHeader },
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.some((t: { name: string }) => t.name === 'bash')).toBe(true)
  })

  it('executes a tool directly', async () => {
    const res = await server.getApp().request('/api/tools/execute', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: authHeader },
      body: JSON.stringify({ name: 'bash', args: { command: 'echo hello' } }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.result).toContain('hello')
  })

  it('rejects unknown tools', async () => {
    const res = await server.getApp().request('/api/tools/execute', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: authHeader },
      body: JSON.stringify({ name: 'nonexistent', args: {} }),
    })
    expect(res.status).toBe(400)
  })

  // ── Config management ──

  it('round-trips config values', async () => {
    const post = await server.getApp().request('/api/config', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: authHeader },
      body: JSON.stringify({ key: 'test.key', value: 'test-value' }),
    })
    expect(post.status).toBe(200)
    const get = await server.getApp().request('/api/config/test.key', {
      headers: { authorization: authHeader },
    })
    expect(get.status).toBe(200)
    const body = await get.json()
    expect(body.value).toBe('test-value')
  })

  it('deletes a config key', async () => {
    await server.getApp().request('/api/config', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: authHeader },
      body: JSON.stringify({ key: 'delete.me', value: 'x' }),
    })
    const del = await server.getApp().request('/api/config/delete.me', {
      method: 'DELETE',
      headers: { authorization: authHeader },
    })
    expect(del.status).toBe(200)
    const get = await server.getApp().request('/api/config/delete.me', {
      headers: { authorization: authHeader },
    })
    expect(get.status).toBe(404)
  })

  // ── Auth and API keys ──

  it('GET /api/auth returns provider status', async () => {
    const res = await server.getApp().request('/api/auth', {
      headers: { authorization: authHeader },
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('authenticated')
    expect(body).toHaveProperty('providers')
  })

  it('creates an API key', async () => {
    const res = await server.getApp().request('/api/auth/keys', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: authHeader },
      body: JSON.stringify({ name: 'integ-key', env: 'integ' }),
    })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body).toHaveProperty('key')
    expect(body).toHaveProperty('secret')
    expect(body.secret).toMatch(/^frg_[a-z]+_[A-Za-z0-9_-]+$/)
  })

  it('lists API keys', async () => {
    const res = await server.getApp().request('/api/auth/keys', {
      headers: { authorization: authHeader },
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('keys')
    expect(Array.isArray(body.keys)).toBe(true)
    expect(body.keys.length).toBeGreaterThan(0)
  })

  it('revokes an API key', async () => {
    const create = await server.getApp().request('/api/auth/keys', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: authHeader },
      body: JSON.stringify({ name: 'to-revoke' }),
    })
    const { key } = await create.json()
    const del = await server.getApp().request(`/api/auth/keys/${key.id}`, {
      method: 'DELETE',
      headers: { authorization: authHeader },
    })
    expect(del.status).toBe(200)
    const get = await server.getApp().request(`/api/auth/keys/${key.id}`, {
      headers: { authorization: authHeader },
    })
    expect(get.status).toBe(404)
  })

  // ── SSE streaming ──

  it('opens an SSE connection and receives connected event', async () => {
    const res = await server.getApp().request('/api/sse/events?sessions=', {
      headers: { authorization: authHeader },
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/event-stream')
    const reader = res.body?.getReader()
    if (reader === undefined) throw new Error('sse response has no body')
    const { value } = await reader.read()
    const text = new TextDecoder().decode(value)
    expect(text).toContain('event: connected')
    await reader.cancel()
  })

  // ── Auth middleware ──

  it('rejects requests without token when key exists', async () => {
    const res = await server.getApp().request('/api/sessions')
    expect(res.status).toBe(401)
  })

  it('accepts valid bearer token', async () => {
    const store = server.getAuthStore()
    const { secret } = await store.createKey({ name: 'test-auth' })

    const res = await server.getApp().request('/api/sessions', {
      headers: { authorization: `Bearer ${secret}` },
    })
    expect(res.status).toBe(200)
  })

  it('rejects invalid token', async () => {
    const res = await server.getApp().request('/api/sessions', {
      headers: { authorization: 'Bearer frg_live_invalid' },
    })
    expect(res.status).toBe(401)
  })

  // ── OpenAPI and docs ──

  it('serves OpenAPI spec', async () => {
    const res = await server.getApp().request('/api/openapi.json', {
      headers: { authorization: authHeader },
    })
    expect(res.status).toBe(200)
    const spec = await res.json()
    expect(spec.openapi).toBe('3.1.0')
  })

  it('serves Scalar docs', async () => {
    const res = await server.getApp().request('/docs', {
      headers: { authorization: authHeader },
    })
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('Scalar')
  })

  // ── CORS ──

  it('adds CORS headers', async () => {
    const res = await server.getApp().request('/health', {
      headers: { origin: 'http://example.com' },
    })
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
  })

  // ── Error handling ──

  it('returns 401 for unknown routes without auth', async () => {
    const res = await server.getApp().request('/api/nonexistent')
    expect(res.status).toBe(401)
  })

  it('validates request bodies', async () => {
    const res = await server.getApp().request('/api/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: authHeader },
      body: JSON.stringify({ model: 'auto' }),
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })

  // ── SSE stats ──

  it('GET /api/sse/stats returns hub stats', async () => {
    const res = await server.getApp().request('/api/sse/stats', {
      headers: { authorization: authHeader },
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('clients')
  })

  // ── Config defaults ──

  it('GET /api/config/default returns defaults', async () => {
    const res = await server.getApp().request('/api/config/default', {
      headers: { authorization: authHeader },
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('model')
  })

  // ── CORS headers on all routes ──

  it('adds CORS to all API routes', async () => {
    const res = await server.getApp().request('/api/sessions', {
      headers: { origin: 'http://evil.com', authorization: authHeader },
    })
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
  })

  // ── Error handling ──

  it('returns 401 for unknown routes without auth', async () => {
    const res = await server.getApp().request('/api/nonexistent')
    expect(res.status).toBe(401)
  })

  it('validates request bodies', async () => {
    const res = await server.getApp().request('/api/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: authHeader },
      body: JSON.stringify({ model: 'auto' }),
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })

  // ── SSE stats ──

  it('GET /api/sse/stats returns hub stats', async () => {
    const res = await server.getApp().request('/api/sse/stats', {
      headers: { authorization: authHeader },
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('clients')
  })

  // ── Config defaults ──

  it('GET /api/config/default returns defaults', async () => {
    const res = await server.getApp().request('/api/config/default', {
      headers: { authorization: authHeader },
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('model')
  })

  // ── CORS headers on all routes ──

  it('adds CORS to all API routes', async () => {
    const res = await server.getApp().request('/api/sessions', {
      headers: { origin: 'http://evil.com', authorization: authHeader },
    })
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
  })

  // ── Error handling ──

  it('returns 401 for unknown routes without auth', async () => {
    const res = await server.getApp().request('/api/nonexistent')
    expect(res.status).toBe(401)
  })

  it('validates request bodies', async () => {
    const res = await server.getApp().request('/api/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: authHeader },
      body: JSON.stringify({ model: 'auto' }),
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })

  // ── SSE stats ──

  it('GET /api/sse/stats returns hub stats', async () => {
    const res = await server.getApp().request('/api/sse/stats', {
      headers: { authorization: authHeader },
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('clients')
  })

  // ── Config defaults ──

  it('GET /api/config/default returns defaults', async () => {
    const res = await server.getApp().request('/api/config/default', {
      headers: { authorization: authHeader },
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('model')
  })

  // ── CORS headers on all routes ──

  it('adds CORS to all API routes', async () => {
    const res = await server.getApp().request('/api/sessions', {
      headers: { origin: 'http://evil.com', authorization: authHeader },
    })
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
  })

  // ── Error handling ──

  it('returns 401 for unknown routes without auth', async () => {
    const res = await server.getApp().request('/api/nonexistent')
    expect(res.status).toBe(401)
  })

  it('validates request bodies', async () => {
    const res = await server.getApp().request('/api/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: authHeader },
      body: JSON.stringify({ model: 'auto' }),
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })
})
