import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SessionLog, createEvent } from '@forge/core'
import { createOfflineModel } from '../../tests/fixtures/offline-model'
import { ForgeServer } from '../server'

let server: ForgeServer
let baseDir: string
let sessionId: string

beforeAll(async () => {
  baseDir = mkdtempSync(join(tmpdir(), 'forge-trajectory-'))
  server = await ForgeServer.create({
    baseDir,
    dbPath: join(baseDir, 'forge.db'),
    modelResolver: async () => createOfflineModel(),
  })
  const res = await server.getApp().request('/api/sessions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ cwd: '/tmp', model: 'auto' }),
  })
  sessionId = ((await res.json()) as { id: string }).id

  const log = new SessionLog(baseDir, sessionId)
  await log.append(
    createEvent('session.message', sessionId, {
      role: 'user',
      content: 'fix <script>alert(1)</script> bug',
    }),
  )
  await log.append(
    createEvent('session.tool_call', sessionId, {
      toolCallId: 'c1',
      toolName: 'read',
      args: { path: 'a.ts' },
    }),
  )
  await log.append(
    createEvent('session.tool_result', sessionId, {
      toolCallId: 'c1',
      toolName: 'read',
      result: 'ok',
      durationMs: 5,
    }),
  )
})

afterAll(() => {
  server.close()
  try {
    rmSync(baseDir, { recursive: true, force: true })
  } catch {
    // best-effort cleanup (Windows can hold the DB file briefly)
  }
})

describe('GET /trajectory/:id (Phase 144)', () => {
  it('renders every step of the session as HTML', async () => {
    const res = await server.getApp().request(`/trajectory/${sessionId}`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
    const html = await res.text()
    expect(html).toContain('<!doctype html>')
    expect(html).toContain(sessionId)
    expect(html).toContain('fix ')
    expect(html).toContain('Tool call: read')
    expect(html).toContain('Tool result: read')
    expect(html).toContain('Session created')
  })

  it('escapes event content instead of injecting it', async () => {
    const res = await server.getApp().request(`/trajectory/${sessionId}`)
    const html = await res.text()
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).not.toContain('<script>alert')
  })

  it('returns an HTML 404 for an unknown session', async () => {
    const res = await server.getApp().request('/trajectory/does-not-exist')
    expect(res.status).toBe(404)
    expect(await res.text()).toContain('not found')
  })
})
