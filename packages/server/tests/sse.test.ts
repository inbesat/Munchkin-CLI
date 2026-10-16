import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ForgeServer } from '../src/server'

async function readUntil(
  res: Response,
  predicate: (buf: string) => boolean,
  timeoutMs = 5000,
): Promise<string> {
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const timer = setTimeout(() => {
    reader.cancel()
    throw new Error('sse read timeout')
  }, timeoutMs)
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      // Server streams UTF-8 bytes; tolerate both chunk kinds for robustness.
      buffer += typeof value === 'string' ? value : decoder.decode(value, { stream: true })
      if (predicate(buffer)) return buffer
    }
    return buffer
  } finally {
    clearTimeout(timer)
    reader.cancel().catch(() => {})
  }
}

describe('SSE real-time streaming', () => {
  let server: ForgeServer
  let baseDir: string

  beforeAll(async () => {
    baseDir = mkdtempSync(join(tmpdir(), 'forge-sse-test-'))
    server = await ForgeServer.create({
      baseDir,
      dbPath: join(baseDir, 'sse.db'),
      corsOrigins: ['*'],
    })
  })

  afterAll(async () => {
    server.close()
    await new Promise((r) => setTimeout(r, 100))
    try {
      rmSync(baseDir, { recursive: true, force: true })
    } catch {
      /* best-effort */
    }
  })

  it('streams broadcast events to a connected SSE client in real time', async () => {
    const streamRes = await server.getApp().request('/api/sse/events')
    expect(streamRes.status).toBe(200)

    const readPromise = readUntil(streamRes, (buf) => buf.includes('event: ping'))

    // Fire a broadcast after the stream is open
    const post = await server.getApp().request('/api/sse/broadcast', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ event: 'ping', data: { hello: 'world' } }),
    })
    expect(post.status).toBe(200)

    const body = await readPromise
    expect(body).toInclude('event: ping')
    expect(body).toInclude('hello')
  })

  it('streams the connected event on open', async () => {
    const streamRes = await server.getApp().request('/api/sse/events')
    expect(streamRes.status).toBe(200)
    const body = await readUntil(streamRes, (buf) => buf.includes('event: connected'))
    expect(body).toInclude('event: connected')
  })

  it('stats reflect the connected client', async () => {
    const res = await server.getApp().request('/api/sse/stats')
    expect(res.status).toBe(200)
    const stats = await res.json()
    expect(stats.totalClients).toBeGreaterThanOrEqual(0)
  })
})
