import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SessionLog, createEvent } from '../events'
import {
  type ResumedSession,
  getResumePoint,
  hasIncompleteToolCalls,
  resumeSession,
} from './resume'

/** Build a full ResumedSession from a partial override (test fixture). */
function resumeState(overrides: Record<string, unknown>): ResumedSession {
  return {
    sessionId: 's-test',
    model: 'test-model',
    cwd: '/tmp',
    messages: [],
    pendingToolCalls: [],
    completedToolCalls: [],
    errors: [],
    compactions: [],
    lastEventTimestamp: 0,
    eventCount: 0,
    totalTokens: { input: 0, output: 0 },
    ended: false,
    ...overrides,
  } as ResumedSession
}

let tempDir: string

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'forge-resume-'))
})

afterEach(async () => {})

describe('resumeSession', () => {
  it('returns null for nonexistent session', async () => {
    const result = await resumeSession({ baseDir: tempDir, sessionId: 'nonexistent' })
    expect(result).toBeNull()
  })

  it('returns null for empty session', async () => {
    const _log = new SessionLog(tempDir, 'empty')
    const result = await resumeSession({ baseDir: tempDir, sessionId: 'empty' })
    expect(result).toBeNull()
  })

  it('rebuilds basic conversation state', async () => {
    const log = new SessionLog(tempDir, 's1')
    await log.append(
      createEvent('session.created', 's1', {
        model: 'claude-sonnet-4-20250514',
        cwd: '/tmp/project',
        title: 'My Session',
      }),
    )
    await log.append(
      createEvent('session.message', 's1', {
        role: 'user',
        content: 'Hello',
      }),
    )
    await log.append(
      createEvent('session.message', 's1', {
        role: 'assistant',
        content: 'Hi there!',
        tokens: { input: 10, output: 5 },
      }),
    )

    const session = await resumeSession({ baseDir: tempDir, sessionId: 's1' })

    expect(session).not.toBeNull()
    expect(session?.sessionId).toBe('s1')
    expect(session?.model).toBe('claude-sonnet-4-20250514')
    expect(session?.cwd).toBe('/tmp/project')
    expect(session?.title).toBe('My Session')
    expect(session?.messages).toHaveLength(2)
    expect(session?.messages[0]).toEqual({ role: 'user', content: 'Hello' })
    expect(session?.messages[1]).toEqual({
      role: 'assistant',
      content: 'Hi there!',
      tokens: { input: 10, output: 5 },
    })
    expect(session?.totalTokens).toEqual({ input: 10, output: 5 })
    expect(session?.eventCount).toBe(3)
  })

  it('detects pending tool calls', async () => {
    const log = new SessionLog(tempDir, 's2')
    await log.append(
      createEvent('session.created', 's2', {
        model: 'gpt-4o',
        cwd: '/tmp',
      }),
    )
    await log.append(
      createEvent('session.tool_call', 's2', {
        toolCallId: 'tc-1',
        toolName: 'bash',
        args: { command: 'ls' },
      }),
    )

    const session = await resumeSession({ baseDir: tempDir, sessionId: 's2' })

    expect(session).not.toBeNull()
    expect(session?.pendingToolCalls).toHaveLength(1)
    expect(session?.pendingToolCalls[0].toolCallId).toBe('tc-1')
    expect(session?.pendingToolCalls[0].toolName).toBe('bash')
    expect(session?.completedToolCalls).toHaveLength(0)
  })

  it('matches tool calls with results', async () => {
    const log = new SessionLog(tempDir, 's3')
    await log.append(
      createEvent('session.created', 's3', {
        model: 'gpt-4o',
        cwd: '/tmp',
      }),
    )
    await log.append(
      createEvent('session.tool_call', 's3', {
        toolCallId: 'tc-1',
        toolName: 'bash',
        args: { command: 'ls' },
      }),
    )
    await log.append(
      createEvent('session.tool_result', 's3', {
        toolCallId: 'tc-1',
        toolName: 'bash',
        result: 'file1.txt',
        durationMs: 50,
      }),
    )

    const session = await resumeSession({ baseDir: tempDir, sessionId: 's3' })

    expect(session).not.toBeNull()
    expect(session?.pendingToolCalls).toHaveLength(0)
    expect(session?.completedToolCalls).toHaveLength(1)
    expect(session?.completedToolCalls[0].result).toBe('file1.txt')
    expect(session?.completedToolCalls[0].durationMs).toBe(50)
  })

  it('handles mixed pending and completed tool calls', async () => {
    const log = new SessionLog(tempDir, 's4')
    await log.append(
      createEvent('session.created', 's4', {
        model: 'gpt-4o',
        cwd: '/tmp',
      }),
    )
    await log.append(
      createEvent('session.tool_call', 's4', {
        toolCallId: 'tc-1',
        toolName: 'bash',
        args: { command: 'ls' },
      }),
    )
    await log.append(
      createEvent('session.tool_result', 's4', {
        toolCallId: 'tc-1',
        toolName: 'bash',
        result: 'ok',
      }),
    )
    await log.append(
      createEvent('session.tool_call', 's4', {
        toolCallId: 'tc-2',
        toolName: 'read',
        args: { filePath: '/tmp/foo' },
      }),
    )

    const session = await resumeSession({ baseDir: tempDir, sessionId: 's4' })

    expect(session).not.toBeNull()
    expect(session?.pendingToolCalls).toHaveLength(1)
    expect(session?.pendingToolCalls[0].toolCallId).toBe('tc-2')
    expect(session?.completedToolCalls).toHaveLength(1)
    expect(session?.completedToolCalls[0].toolCallId).toBe('tc-1')
  })

  it('records errors', async () => {
    const log = new SessionLog(tempDir, 's5')
    await log.append(
      createEvent('session.created', 's5', {
        model: 'gpt-4o',
        cwd: '/tmp',
      }),
    )
    await log.append(
      createEvent('session.error', 's5', {
        code: 'FORGE_3001',
        message: 'API key invalid',
        severity: 'error',
        recovery: 'Check your API key',
      }),
    )

    const session = await resumeSession({ baseDir: tempDir, sessionId: 's5' })

    expect(session).not.toBeNull()
    expect(session?.errors).toHaveLength(1)
    expect(session?.errors[0].code).toBe('FORGE_3001')
    expect(session?.errors[0].severity).toBe('error')
  })

  it('records compactions', async () => {
    const log = new SessionLog(tempDir, 's6')
    await log.append(
      createEvent('session.created', 's6', {
        model: 'gpt-4o',
        cwd: '/tmp',
      }),
    )
    await log.append(
      createEvent('session.compaction', 's6', {
        beforeCount: 50,
        afterCount: 10,
        summary: 'Compacted old messages',
        tokensSaved: 5000,
      }),
    )

    const session = await resumeSession({ baseDir: tempDir, sessionId: 's6' })

    expect(session).not.toBeNull()
    expect(session?.compactions).toHaveLength(1)
    expect(session?.compactions[0].tokensSaved).toBe(5000)
  })

  it('detects ended session', async () => {
    const log = new SessionLog(tempDir, 's7')
    await log.append(
      createEvent('session.created', 's7', {
        model: 'gpt-4o',
        cwd: '/tmp',
      }),
    )
    await log.append(
      createEvent('session.ended', 's7', {
        reason: 'user',
        totalTokens: { input: 100, output: 50 },
        totalCost: 0.01,
      }),
    )

    const session = await resumeSession({ baseDir: tempDir, sessionId: 's7' })

    expect(session).not.toBeNull()
    expect(session?.ended).toBe(true)
  })

  it('handles tool result without prior tool_call (orphan)', async () => {
    const log = new SessionLog(tempDir, 's8')
    await log.append(
      createEvent('session.created', 's8', {
        model: 'gpt-4o',
        cwd: '/tmp',
      }),
    )
    await log.append(
      createEvent('session.tool_result', 's8', {
        toolCallId: 'tc-orphan',
        toolName: 'bash',
        result: 'orphan result',
      }),
    )

    const session = await resumeSession({ baseDir: tempDir, sessionId: 's8' })

    expect(session).not.toBeNull()
    expect(session?.completedToolCalls).toHaveLength(1)
    expect(session?.completedToolCalls[0].toolCallId).toBe('tc-orphan')
    expect(session?.completedToolCalls[0].args).toEqual({})
  })

  it('tracks last event timestamp', async () => {
    const log = new SessionLog(tempDir, 's9')
    const _t1 = Date.now() - 1000
    await log.append(
      createEvent('session.created', 's9', {
        model: 'gpt-4o',
        cwd: '/tmp',
      }),
    )
    await log.append(
      createEvent('session.message', 's9', {
        role: 'user',
        content: 'test',
      }),
    )

    const session = await resumeSession({ baseDir: tempDir, sessionId: 's9' })

    expect(session).not.toBeNull()
    expect(session?.lastEventTimestamp).toBeGreaterThan(0)
  })

  it('handles tool_result with error', async () => {
    const log = new SessionLog(tempDir, 's10')
    await log.append(
      createEvent('session.created', 's10', {
        model: 'gpt-4o',
        cwd: '/tmp',
      }),
    )
    await log.append(
      createEvent('session.tool_call', 's10', {
        toolCallId: 'tc-err',
        toolName: 'bash',
        args: { command: 'exit 1' },
      }),
    )
    await log.append(
      createEvent('session.tool_result', 's10', {
        toolCallId: 'tc-err',
        toolName: 'bash',
        result: null,
        error: 'Command failed with exit code 1',
        durationMs: 10,
      }),
    )

    const session = await resumeSession({ baseDir: tempDir, sessionId: 's10' })

    expect(session).not.toBeNull()
    expect(session?.completedToolCalls).toHaveLength(1)
    expect(session?.completedToolCalls[0].error).toBe('Command failed with exit code 1')
  })
})

describe('hasIncompleteToolCalls', () => {
  it('returns true when pending tool calls exist', () => {
    expect(
      hasIncompleteToolCalls(
        resumeState({
          pendingToolCalls: [{ toolCallId: 'tc-1', toolName: 'bash', args: {}, calledAt: 0 }],
        }),
      ),
    ).toBe(true)
  })

  it('returns false when no pending tool calls', () => {
    expect(hasIncompleteToolCalls(resumeState({ pendingToolCalls: [] }))).toBe(false)
  })
})

describe('getResumePoint', () => {
  it('reports cannot resume if ended', () => {
    const result = getResumePoint(resumeState({ ended: true, pendingToolCalls: [], messages: [] }))
    expect(result.canResume).toBe(false)
    expect(result.reason).toContain('ended')
  })

  it('reports pending tool calls', () => {
    const result = getResumePoint(
      resumeState({
        ended: false,
        pendingToolCalls: [{ toolCallId: 'tc-1', toolName: 'bash', args: {}, calledAt: 0 }],
        messages: [],
      }),
    )
    expect(result.canResume).toBe(true)
    expect(result.reason).toContain('incomplete tool call')
  })

  it('reports pending assistant response after user message', () => {
    const result = getResumePoint(
      resumeState({
        ended: false,
        pendingToolCalls: [],
        messages: [{ role: 'user', content: 'hello' }],
      }),
    )
    expect(result.canResume).toBe(true)
    expect(result.reason).toContain('user')
  })

  it('reports interrupted after assistant message', () => {
    const result = getResumePoint(
      resumeState({
        ended: false,
        pendingToolCalls: [],
        messages: [{ role: 'assistant', content: 'hi' }],
      }),
    )
    expect(result.canResume).toBe(true)
    expect(result.reason).toContain('interrupted')
  })

  it('reports can resume with no messages', () => {
    const result = getResumePoint(
      resumeState({
        ended: false,
        pendingToolCalls: [],
        messages: [],
      }),
    )
    expect(result.canResume).toBe(true)
  })
})
