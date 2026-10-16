import { describe, expect, it } from 'bun:test'
import { createHmac, verify as cryptoVerify, generateKeyPairSync } from 'node:crypto'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { GitHubApp } from './app'
import { createGitHubAppFromEnv } from './env'
import { createGitHubRoutes } from './routes'

interface RecordedCall {
  url: string
  method: string
  headers: Record<string, string>
  body: unknown
}

function fakeFetch(responder: (call: RecordedCall) => Response): {
  fetchImpl: typeof fetch
  calls: RecordedCall[]
} {
  const calls: RecordedCall[] = []
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    const call: RecordedCall = {
      url,
      method: init?.method ?? 'GET',
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    }
    calls.push(call)
    return responder(call)
  }) as typeof fetch
  return { fetchImpl, calls }
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const sign = (secret: string, body: string): string =>
  `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`

const SECRET = 'test-secret'

const labelEvent = (): string =>
  JSON.stringify({
    action: 'labeled',
    label: { name: 'forge-review' },
    pull_request: { number: 42 },
    repository: { full_name: 'acme/widgets' },
    installation: { id: 7 },
    sender: { login: 'alice' },
  })

const SECRET_DIFF = [
  'diff --git a/src/config.ts b/src/config.ts',
  '--- a/src/config.ts',
  '+++ b/src/config.ts',
  '@@ -1,2 +1,3 @@',
  '+const apiKey = "sk-ant-abc123456789012345678"',
].join('\n')

describe('GitHubApp.handleWebhook (Phase 142)', () => {
  it('label event: fetches the PR diff, reviews it, and posts the comment', async () => {
    const { fetchImpl, calls } = fakeFetch((call) => {
      if (call.url.endsWith('/repos/acme/widgets/pulls/42')) return new Response(SECRET_DIFF)
      if (call.url.endsWith('/repos/acme/widgets/issues/42/comments')) return json({ id: 1 }, 201)
      return json({ error: { message: 'unexpected' } }, 404)
    })
    const app = new GitHubApp({ webhookSecret: SECRET, token: 'static-token', fetchImpl })

    const body = labelEvent()
    const outcome = await app.handleWebhook({
      eventName: 'pull_request',
      signature: sign(SECRET, body),
      rawBody: body,
    })

    expect(outcome).toEqual({ status: 'reviewed', owner: 'acme', repo: 'widgets', prNumber: 42 })
    expect(calls.length).toBe(2)
    expect(calls[0]?.url).toBe('https://api.github.com/repos/acme/widgets/pulls/42')
    expect(calls[0]?.headers.Accept).toBe('application/vnd.github.v3.diff')
    expect(calls[0]?.headers.Authorization).toBe('Bearer static-token')
    const comment = (calls[1]?.body as { body: string }).body
    expect(comment).toContain('forge review')
    expect(comment).toContain('possible API key literal added')
    expect(comment).toContain('Posted by forge (GitHub App review).')
  })

  it('rejects an invalid signature without any API calls', async () => {
    const { fetchImpl, calls } = fakeFetch(() => json({}, 200))
    const app = new GitHubApp({ webhookSecret: SECRET, token: 'static-token', fetchImpl })
    const outcome = await app.handleWebhook({
      eventName: 'pull_request',
      signature: sign('wrong-secret', labelEvent()),
      rawBody: labelEvent(),
    })
    expect(outcome).toEqual({ status: 'rejected', reason: 'invalid webhook signature' })
    expect(calls.length).toBe(0)
  })

  it('ignores non-trigger events without any API calls', async () => {
    const { fetchImpl, calls } = fakeFetch(() => json({}, 200))
    const app = new GitHubApp({ webhookSecret: SECRET, token: 'static-token', fetchImpl })
    const body = JSON.stringify({ zen: 'keep it logically awesome' })
    const outcome = await app.handleWebhook({
      eventName: 'push',
      signature: sign(SECRET, body),
      rawBody: body,
    })
    expect(outcome).toEqual({ status: 'ignored', reason: "event 'push' is not handled" })
    expect(calls.length).toBe(0)
  })

  it('app credentials: signs an RS256 JWT and exchanges it for an installation token', async () => {
    const { publicKey, privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    })
    const { fetchImpl, calls } = fakeFetch((call) => {
      if (call.url.endsWith('/app/installations/7/access_tokens'))
        return json({ token: 'inst-token' }, 201)
      if (call.url.endsWith('/repos/acme/widgets/pulls/42')) return new Response(SECRET_DIFF)
      if (call.url.endsWith('/repos/acme/widgets/issues/42/comments')) return json({ id: 1 }, 201)
      return json({ error: { message: 'unexpected' } }, 404)
    })
    const app = new GitHubApp({
      webhookSecret: SECRET,
      appId: 123,
      privateKeyPem: privateKey,
      fetchImpl,
      now: () => 1_700_000_000_000,
    })

    const body = labelEvent()
    const outcome = await app.handleWebhook({
      eventName: 'pull_request',
      signature: sign(SECRET, body),
      rawBody: body,
    })

    expect(outcome.status).toBe('reviewed')
    expect(calls[0]?.url).toBe('https://api.github.com/app/installations/7/access_tokens')
    const jwt = (calls[0]?.headers.Authorization ?? '').replace(/^Bearer /, '')
    const [header, payload, signature] = jwt.split('.')
    expect(JSON.parse(Buffer.from(header, 'base64url').toString('utf8'))).toEqual({
      alg: 'RS256',
      typ: 'JWT',
    })
    expect(JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')).iss).toBe('123')
    expect(
      cryptoVerify(
        'RSA-SHA256',
        Buffer.from(`${header}.${payload}`),
        publicKey,
        Buffer.from(signature, 'base64url'),
      ),
    ).toBe(true)
    expect(calls[1]?.headers.Authorization).toBe('Bearer inst-token')
    expect(calls[2]?.headers.Authorization).toBe('Bearer inst-token')
  })

  it('fails cleanly when no credentials are configured', async () => {
    const { fetchImpl, calls } = fakeFetch(() => json({}, 200))
    const app = new GitHubApp({ webhookSecret: SECRET, fetchImpl })
    const body = labelEvent()
    const outcome = await app.handleWebhook({
      eventName: 'pull_request',
      signature: sign(SECRET, body),
      rawBody: body,
    })
    expect(outcome.status).toBe('failed')
    if (outcome.status === 'failed') expect(outcome.error).toContain('no GitHub credentials')
    expect(calls.length).toBe(0)
  })
})

describe('createGitHubRoutes (Phase 142)', () => {
  it('valid signature -> 202 reviewed; invalid signature -> 401', async () => {
    const { fetchImpl } = fakeFetch((call) => {
      if (call.url.endsWith('/repos/acme/widgets/pulls/42')) return new Response(SECRET_DIFF)
      if (call.url.endsWith('/repos/acme/widgets/issues/42/comments')) return json({ id: 1 }, 201)
      return json({}, 404)
    })
    const routes = createGitHubRoutes(
      new GitHubApp({ webhookSecret: SECRET, token: 't', fetchImpl }),
    )
    const body = labelEvent()

    const ok = await routes.request('/webhook', {
      method: 'POST',
      headers: { 'x-github-event': 'pull_request', 'x-hub-signature-256': sign(SECRET, body) },
      body,
    })
    expect(ok.status).toBe(202)
    expect(((await ok.json()) as { status: string }).status).toBe('reviewed')

    const bad = await routes.request('/webhook', {
      method: 'POST',
      headers: { 'x-github-event': 'pull_request', 'x-hub-signature-256': 'sha256=deadbeef' },
      body,
    })
    expect(bad.status).toBe(401)
  })
})

describe('createGitHubAppFromEnv (Phase 142)', () => {
  it('returns undefined without a webhook secret, and an app with one', () => {
    expect(createGitHubAppFromEnv({})).toBeUndefined()
    expect(
      createGitHubAppFromEnv({ GITHUB_WEBHOOK_SECRET: 's', GITHUB_TOKEN: 't' }),
    ).toBeInstanceOf(GitHubApp)
  })

  it('reads the private key from a file path when no inline key is set', () => {
    const dir = mkdtempSync(join(tmpdir(), 'forge-gh-'))
    const keyPath = join(dir, 'app.pem')
    writeFileSync(keyPath, 'PEM-CONTENT')
    const app = createGitHubAppFromEnv({
      GITHUB_WEBHOOK_SECRET: 's',
      GITHUB_APP_PRIVATE_KEY_PATH: keyPath,
    })
    expect(app).toBeInstanceOf(GitHubApp)
  })
})
