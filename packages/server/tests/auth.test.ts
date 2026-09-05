import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ForgeServer, type AgentExecutor, type AgentRunResult } from '../src'

const mockExecutor = {
  executePrompt: async (_sid: string, _p: string) =>
    ({
      reason: 'complete',
      response: 'ok',
      messages: [],
      turns: 1,
      usage: { input: 0, output: 0, total: 0 },
    }) as unknown as AgentRunResult,
} as unknown as AgentExecutor

describe('auth middleware', () => {
  let open: ForgeServer
  let closed: ForgeServer
  let baseDir: string

  beforeAll(async () => {
    baseDir = mkdtempSync(join(tmpdir(), 'forge-auth-'))
    open = await ForgeServer.create({
      baseDir,
      dbPath: join(baseDir, 'open.db'),
      agentExecutor: mockExecutor,
    })
    closed = await ForgeServer.create({
      baseDir,
      dbPath: join(baseDir, 'closed.db'),
      agentExecutor: mockExecutor,
      authToken: 's3cret',
    })
  })

  afterAll(() => {
    open.close()
    closed.close()
    try {
      rmSync(baseDir, { recursive: true, force: true })
    } catch {
      // best-effort cleanup
    }
  })

  it('allows requests through when no token is configured', async () => {
    const res = await open.getApp().request('/health')
    expect(res.status).toBe(200)
  })

  it('rejects requests without a bearer token when auth is required', async () => {
    const res = await closed.getApp().request('/api/sessions')
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error.code).toBe('UNAUTHORIZED')
  })

  it('rejects requests with the wrong token', async () => {
    const res = await closed.getApp().request('/api/sessions', {
      headers: { authorization: 'Bearer wrong' },
    })
    expect(res.status).toBe(401)
  })

  it('accepts requests with the correct bearer token', async () => {
    const res = await closed.getApp().request('/api/sessions', {
      headers: { authorization: 'Bearer s3cret' },
    })
    expect(res.status).toBe(200)
  })

  it('keeps /health reachable without a token (for liveness probes)', async () => {
    const res = await closed.getApp().request('/health')
    expect(res.status).toBe(200)
  })

  it('keeps /health/ready reachable without a token', async () => {
    const res = await closed.getApp().request('/health/ready')
    expect(res.status).toBe(200)
  })
})