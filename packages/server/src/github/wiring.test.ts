import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { createHmac } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createOfflineModel } from '../../tests/fixtures/offline-model'
import { AuthStore } from '../auth/store'
import { ForgeServer } from '../server'
import { GitHubApp } from './app'

const SECRET = 'wiring-secret'

const sign = (body: string): string =>
  `sha256=${createHmac('sha256', SECRET).update(body).digest('hex')}`

const labelEvent = (): string =>
  JSON.stringify({
    action: 'labeled',
    label: { name: 'forge-review' },
    pull_request: { number: 42 },
    repository: { full_name: 'acme/widgets' },
    installation: { id: 7 },
  })

describe('server wiring for the GitHub App (Phase 142)', () => {
  let server: ForgeServer
  let baseDir: string

  beforeAll(async () => {
    baseDir = mkdtempSync(join(tmpdir(), 'forge-gh-wiring-'))
    const authStore = new AuthStore({ baseDir: join(baseDir, 'auth') })
    await authStore.load()
    await authStore.createKey({ name: 'test-key', env: 'test' })

    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      if (url.endsWith('/repos/acme/widgets/pulls/42')) {
        return new Response('+const apiKey = "sk-ant-abc123456789012345678"')
      }
      if (url.endsWith('/repos/acme/widgets/issues/42/comments')) {
        return new Response('{}', { status: 201 })
      }
      return new Response('{}', { status: 404 })
    }) as typeof fetch

    server = await ForgeServer.create({
      baseDir,
      dbPath: join(baseDir, 'sessions.db'),
      authStore,
      modelResolver: async () => createOfflineModel(),
      githubApp: new GitHubApp({ webhookSecret: SECRET, token: 't', fetchImpl }),
    })
  })

  afterAll(() => {
    server.close()
    try {
      rmSync(baseDir, { recursive: true, force: true })
    } catch {
      // best-effort cleanup (Windows can hold the DB file briefly)
    }
  })

  it('accepts a signed webhook without a bearer token (auth exemption)', async () => {
    const body = labelEvent()
    const res = await server.getApp().request('/api/github/webhook', {
      method: 'POST',
      headers: { 'x-github-event': 'pull_request', 'x-hub-signature-256': sign(body) },
      body,
    })
    expect(res.status).toBe(202)
    expect(((await res.json()) as { status: string }).status).toBe('reviewed')
  })

  it('rejects an unsigned webhook before any review runs', async () => {
    const res = await server.getApp().request('/api/github/webhook', {
      method: 'POST',
      headers: { 'x-github-event': 'pull_request', 'x-hub-signature-256': 'sha256=bad' },
      body: labelEvent(),
    })
    expect(res.status).toBe(401)
  })

  it('still requires auth on other API routes', async () => {
    const res = await server.getApp().request('/api/sessions')
    expect(res.status).toBe(401)
  })
})
