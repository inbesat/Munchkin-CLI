import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SessionLog, SessionStore } from '@forge/core'
import { ForgeServer } from '../src/server'
import { createOfflineModel } from './fixtures/offline-model'

describe('server repair regressions', () => {
  let baseDir: string
  let server: ForgeServer
  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), 'forge-repair-'))
    server = await ForgeServer.create({ baseDir, modelResolver: async () => createOfflineModel() })
  })
  afterEach(async () => {
    server.close()
    // Windows AV can hold freshly created files briefly after close(); retry.
    for (let attempt = 0; ; attempt++) {
      try {
        await rm(baseDir, { recursive: true, force: true })
        break
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EBUSY' || attempt >= 5) throw error
        await new Promise((resolve) => setTimeout(resolve, 50))
      }
    }
  })

  it('deletes the source log, returns events 404, and cannot resurrect during sync', async () => {
    const manager = server.getSessionManager()
    const session = await manager.createSession(baseDir, 'offline')
    const log = new SessionLog(baseDir, session.id)
    expect(await log.exists()).toBe(true)
    expect(await manager.deleteSession(session.id)).toBe(true)
    expect(await log.exists()).toBe(false)
    const events = await server.getApp().request(`/api/sessions/${session.id}/events`)
    expect(events.status).toBe(404)
    const store = new SessionStore(join(baseDir, 'verify.db'), baseDir)
    try {
      expect(await store.syncFromEvents(session.id)).toBeNull()
    } finally {
      store.close()
    }
  })

  it('round-trips extension config keys across server restarts', async () => {
    const response = await server.getApp().request('/api/config', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key: 'extension.example', value: { enabled: true } }),
    })
    expect(response.status).toBe(200)
    server.close()
    server = await ForgeServer.create({ baseDir, modelResolver: async () => createOfflineModel() })
    const response2 = await server.getApp().request('/api/config/extension.example')
    expect(response2.status).toBe(200)
    expect((await response2.json()).value).toEqual({ enabled: true })
  })

  it('rejects inherited config keys and prototype pollution on every config method', async () => {
    for (const key of ['__proto__.polluted', 'constructor.prototype.polluted', 'toString', 'a..b']) {
      for (const method of ['GET', 'DELETE', 'POST']) {
        const res = await server.getApp().request(method === 'POST' ? '/api/config' : `/api/config/${key}`, {
          method, headers: { 'content-type': 'application/json' },
          ...(method === 'POST' ? { body: JSON.stringify({ key, value: true }) } : {}),
        })
        expect(res.status).toBe(400)
      }
    }
    expect(Object.hasOwn(Object.prototype, 'polluted')).toBe(false)
  })

  it('serves SSE as UTF-8 bytes, including later broadcasts', async () => {
    const res = await server.getApp().request('/api/sse/events')
    const reader = res.body?.getReader()
    if (!reader) throw new Error('missing stream')
    try {
      const first = await reader.read()
      expect(first.value).toBeInstanceOf(Uint8Array)
      expect(new TextDecoder().decode(first.value)).toContain('event: connected')
      server.getSSEHub().broadcast('unicode', { text: '你好' })
      expect(new TextDecoder().decode((await reader.read()).value)).toContain('你好')
    } finally {
      await reader.cancel()
    }
  })

  it('keeps docs authenticated and renders Scalar for authorized clients', async () => {
    const { secret } = await server.getAuthStore().createKey({ name: 'fixture' })
    expect((await server.getApp().request('/docs')).status).toBe(401)
    const res = await server.getApp().request('/docs', { headers: { authorization: `Bearer ${secret}` } })
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('Scalar')
  })

  it('CLI source is valid UTF-8', async () => {
    const bytes = await readFile(new URL('../src/cli.ts', import.meta.url))
    expect(() => new TextDecoder('utf-8', { fatal: true }).decode(bytes)).not.toThrow()
  })
})
