import { describe, expect, it } from 'bun:test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AuthStore } from '../src/auth/store'
import { ForgeServer } from '../src/server'

const baseDir = mkdtempSync(join(tmpdir(), 'forge-debt-'))
const authStore = new AuthStore({ baseDir: join(baseDir, 'auth') })
await authStore.load()
const { secret } = await authStore.createKey({ name: 't', env: 'test' })
const authHeader = `Bearer ${secret}`
const server = await ForgeServer.create({
  baseDir,
  dbPath: join(baseDir, 'db.sqlite'),
  corsOrigins: ['*'],
  authStore,
  modelResolver: async () => {
    throw new Error('no model in this probe')
  },
})
const app = server.getApp()

describe('blocker verification', () => {
  it('config GET after POST returns the value (not 404)', async () => {
    const post = await app.request('/api/config', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: authHeader },
      body: JSON.stringify({ key: 'probe.key', value: 'v1' }),
    })
    expect(post.status).toBe(200)
    const get = await app.request('/api/config/probe.key', {
      headers: { authorization: authHeader },
    })
    expect(get.status).toBe(200)
    expect((await get.json()).value).toBe('v1')
  })

  it('DELETE of unknown config key returns 404 (not 401)', async () => {
    const del = await app.request('/api/config/no.such.key', {
      method: 'DELETE',
      headers: { authorization: authHeader },
    })
    expect(del.status).toBe(404)
    expect((await del.json()).error.code).toBe('CONFIG_NOT_FOUND')
  })

  it('GET of revoked API key returns 404 (not 401)', async () => {
    const created = await app.request('/api/auth/keys', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: authHeader },
      body: JSON.stringify({ name: 'doomed' }),
    })
    const { key } = await created.json()
    const del = await app.request(`/api/auth/keys/${key.id}`, {
      method: 'DELETE',
      headers: { authorization: authHeader },
    })
    expect(del.status).toBe(200)
    const get = await app.request(`/api/auth/keys/${key.id}`, {
      headers: { authorization: authHeader },
    })
    expect(get.status).toBe(404)
  })

  it('GET of never-existing API key id returns 404 (not 401)', async () => {
    const get = await app.request('/api/auth/keys/does-not-exist', {
      headers: { authorization: authHeader },
    })
    expect(get.status).toBe(404)
  })

  it('GET /api/openapi.json returns the spec (200)', async () => {
    const res = await app.request('/api/openapi.json', {
      headers: { authorization: authHeader },
    })
    expect(res.status).toBe(200)
    expect((await res.json()).openapi).toBeDefined()
  })

  it('GET /docs (Scalar) returns 200 with auth', async () => {
    const res = await app.request('/docs', { headers: { authorization: authHeader } })
    expect(res.status).toBe(200)
  })
})
