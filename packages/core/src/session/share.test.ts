import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SessionLog, createEvent } from '../events'
import { sanitizeContent, sanitizeEvents, shareSession } from './share'

let tempDir: string
let originalFetch: typeof globalThis.fetch

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'forge-share-'))
  originalFetch = globalThis.fetch
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

async function createTestSession(sessionId: string) {
  const log = new SessionLog(tempDir, sessionId)

  await log.append(
    createEvent('session.created', sessionId, {
      model: 'claude-sonnet-4-20250514',
      cwd: '/tmp/project',
      title: 'Debug Session',
    }),
  )

  await log.append(
    createEvent('session.message', sessionId, {
      role: 'user',
      content:
        'My API key is sk-abc123def456ghi789jkl0 and my token is ghp_' +
        '1234567890abcdef1234567890abcdef1234',
    }),
  )

  await log.append(
    createEvent('session.message', sessionId, {
      role: 'assistant',
      content: 'I see your credentials. Let me help with the bug.',
      tokens: { input: 50, output: 20 },
    }),
  )

  await log.append(
    createEvent('session.message', sessionId, {
      role: 'user',
      content: 'The file /home/user/secret-project/app.ts has an issue',
    }),
  )

  await log.append(
    createEvent('session.ended', sessionId, {
      reason: 'user',
      totalCost: 0.001,
    }),
  )
}

// biome-ignore lint/suspicious/noExplicitAny: test fixture shape (loosely typed mock data)
function mockFetch(capturedBody: { current: any }) {
  return mock((_url: string | URL | Request, init?: RequestInit) => {
    if (init?.body && typeof init.body === 'string') {
      capturedBody.current = JSON.parse(init.body)
    }
    return Promise.resolve(
      new Response(
        JSON.stringify({ id: 'gist-mock', html_url: 'https://gist.github.com/user/gist-mock' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
  }) as typeof fetch
}

describe('sanitizeContent', () => {
  it('redacts API keys', () => {
    const input = 'api_key=abc123secret456'
    const result = sanitizeContent(input)
    expect(result).not.toContain('abc123secret456')
    expect(result).toContain('[REDACTED]')
  })

  it('redacts OpenAI keys', () => {
    const input = 'Using sk-abcdefghijklmnopqrstuvwxyz123456'
    const result = sanitizeContent(input)
    expect(result).not.toContain('sk-abcdefghijklmnopqrstuvwxyz123456')
    expect(result).toContain('[REDACTED]')
  })

  it('redacts GitHub tokens', () => {
    const input = 'Token: ghp_' + 'abcdefghijklmnopqrstuvwxyz1234567890ab'
    const result = sanitizeContent(input)
    expect(result).not.toContain('ghp_')
    expect(result).toContain('[REDACTED]')
  })

  it('redacts Slack tokens', () => {
    const input = 'Token: xoxb-' + '123456789012-1234567890123-abcdefghijklmnopqrstuv'
    const result = sanitizeContent(input)
    expect(result).not.toContain('xoxb-')
    expect(result).toContain('[REDACTED]')
  })

  it('anonymizes file paths', () => {
    const input = 'File at /home/john/project/app.ts has a bug'
    const result = sanitizeContent(input, true)
    expect(result).not.toContain('/home/john')
    expect(result).toContain('[USER]')
  })

  it('anonymizes Windows paths', () => {
    const input = 'File at C:\\Users\\john\\project\\app.ts has a bug'
    const result = sanitizeContent(input, true)
    expect(result).not.toContain('C:\\Users\\john')
    expect(result).toContain('[USER]')
  })

  it('does not anonymize when flag is false', () => {
    const input = 'File at /home/john/project/app.ts'
    const result = sanitizeContent(input, false)
    expect(result).toContain('/home/john')
  })

  it('preserves clean content', () => {
    const input = 'This is a normal message with no secrets'
    const result = sanitizeContent(input)
    expect(result).toBe(input)
  })
})

describe('sanitizeEvents', () => {
  it('sanitizes message content', () => {
    const events = [
      createEvent('session.message', 's1', {
        role: 'user',
        content: 'My key is sk-abcdefghijklmnopqrstuvwxyz123456',
      }),
    ]

    const result = sanitizeEvents(events)
    expect(result[0].payload.content).not.toContain('sk-abcdefghijklmnopqrstuvwxyz123456')
  })

  it('sanitizes tool call args', () => {
    const events = [
      createEvent('session.tool_call', 's1', {
        toolCallId: 'tc-1',
        toolName: 'bash',
        args: { command: 'echo hello' },
      }),
    ]

    const result = sanitizeEvents(events)
    const args = result[0].payload.args as { command: string }
    expect(args.command).toBe('echo hello')
  })

  it('sanitizes tool result strings', () => {
    const events = [
      createEvent('session.tool_result', 's1', {
        toolCallId: 'tc-1',
        toolName: 'bash',
        result: 'token=ghp_' + 'abcdefghijklmnopqrstuvwxyz1234567890ab',
      }),
    ]

    const result = sanitizeEvents(events)
    expect(result[0].payload.result).not.toContain('ghp_')
  })

  it('preserves non-sensitive events', () => {
    const events = [
      createEvent('session.created', 's1', {
        model: 'gpt-4o',
        cwd: '/tmp',
      }),
    ]

    const result = sanitizeEvents(events)
    expect(result[0].payload.model).toBe('gpt-4o')
  })
})

describe('shareSession', () => {
  it('throws for nonexistent session', async () => {
    await expect(
      shareSession({
        baseDir: tempDir,
        sessionId: 'nonexistent',
        githubToken: 'ghp_test123',
      }),
    ).rejects.toThrow('not found')
  })

  it('creates gist and returns URL', async () => {
    await createTestSession('s1')

    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            id: 'gist-123',
            html_url: 'https://gist.github.com/user/gist-123',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    ) as typeof fetch

    const result = await shareSession({
      baseDir: tempDir,
      sessionId: 's1',
      githubToken: 'ghp_test123',
    })

    expect(result.url).toBe('https://gist.github.com/user/gist-123')
    expect(result.gistId).toBe('gist-123')
    expect(result.exported.sessionId).toBe('s1')
  })

  it('sends correct request to GitHub API', async () => {
    await createTestSession('s2')

    let capturedUrl: string | null = null
    let capturedInit: RequestInit | null = null
    globalThis.fetch = mock((url: string | URL | Request, init?: RequestInit) => {
      capturedUrl = typeof url === 'string' ? url : url.toString()
      capturedInit = init ?? null
      return Promise.resolve(
        new Response(
          JSON.stringify({ id: 'gist-456', html_url: 'https://gist.github.com/user/gist-456' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
    }) as typeof fetch

    await shareSession({
      baseDir: tempDir,
      sessionId: 's2',
      githubToken: 'ghp_test456',
      title: 'My Debug Session',
    })

    expect(capturedUrl).toBe('https://api.github.com/gists')
    expect(capturedInit?.headers).toEqual(
      expect.objectContaining({
        Authorization: 'Bearer ghp_test456',
        'X-GitHub-Api-Version': '2022-11-28',
      }),
    )

    // biome-ignore lint/suspicious/noExplicitAny: test fixture shape (loosely typed mock data)
    const body = JSON.parse(capturedInit?.body as string) as any
    expect(body.public).toBe(false)
    expect(body.description).toBe('My Debug Session')
    expect(body.files['session.md']).toBeDefined()
  })

  it('sanitizes sensitive data before upload', async () => {
    await createTestSession('s3')

    // biome-ignore lint/suspicious/noExplicitAny: test fixture shape (loosely typed mock data)
    const captured = { current: null as any }
    globalThis.fetch = mockFetch(captured)

    await shareSession({
      baseDir: tempDir,
      sessionId: 's3',
      githubToken: 'ghp_test789',
    })

    const fileContent = captured.current.files['session.md'].content
    expect(fileContent).not.toContain('sk-abc123def456ghi789jkl0')
    expect(fileContent).not.toContain('ghp_' + '1234567890abcdef1234567890abcdef1234')
    expect(fileContent).not.toContain('/home/user/secret-project')
  })

  it('throws on GitHub API error', async () => {
    await createTestSession('s4')

    globalThis.fetch = mock(() =>
      Promise.resolve(new Response('Bad credentials', { status: 401, statusText: 'Unauthorized' })),
    ) as typeof fetch

    await expect(
      shareSession({
        baseDir: tempDir,
        sessionId: 's4',
        githubToken: 'ghp_invalid',
      }),
    ).rejects.toThrow('GitHub API error: 401')
  })

  it('uses default title when not provided', async () => {
    await createTestSession('s5')

    // biome-ignore lint/suspicious/noExplicitAny: test fixture shape (loosely typed mock data)
    const captured = { current: null as any }
    globalThis.fetch = mockFetch(captured)

    await shareSession({
      baseDir: tempDir,
      sessionId: 's5',
      githubToken: 'ghp_test000',
    })

    expect(captured.current.description).toBe('Forge Session: s5')
  })

  it('respects anonymize flag', async () => {
    await createTestSession('s6')

    // biome-ignore lint/suspicious/noExplicitAny: test fixture shape (loosely typed mock data)
    const captured = { current: null as any }
    globalThis.fetch = mockFetch(captured)

    await shareSession({
      baseDir: tempDir,
      sessionId: 's6',
      githubToken: 'ghp_test111',
      anonymize: false,
    })

    const fileContent = captured.current.files['session.md'].content
    expect(fileContent).toContain('/home/user/secret-project')
  })
})
