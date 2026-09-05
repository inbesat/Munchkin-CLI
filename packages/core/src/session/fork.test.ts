import { beforeEach, describe, expect, it } from 'bun:test'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SessionLog, createEvent } from '../events'
import { forkSession, forkSessionAtMessage } from './fork'
import { resumeSession } from './resume'

let tempDir: string

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'forge-fork-'))
})

async function createTestSession(sessionId: string, messageCount: number) {
  const log = new SessionLog(tempDir, sessionId)
  await log.append(
    createEvent('session.created', sessionId, {
      model: 'claude-sonnet-4-20250514',
      cwd: '/tmp/project',
      title: 'Original Session',
    }),
  )

  for (let i = 0; i < messageCount; i++) {
    await log.append(
      createEvent('session.message', sessionId, {
        role: 'user',
        content: `Message ${i}`,
      }),
    )
    await log.append(
      createEvent('session.message', sessionId, {
        role: 'assistant',
        content: `Response ${i}`,
        tokens: { input: 10 * (i + 1), output: 5 * (i + 1) },
      }),
    )
  }

  return log
}

describe('forkSession', () => {
  it('throws for nonexistent parent session', async () => {
    await expect(forkSession({ baseDir: tempDir, parentSessionId: 'nonexistent' })).rejects.toThrow(
      'not found',
    )
  })

  it('forks all events when no fork point specified', async () => {
    await createTestSession('parent', 3)

    const result = await forkSession({
      baseDir: tempDir,
      parentSessionId: 'parent',
      newSessionId: 'child',
    })

    expect(result.childSessionId).toBe('child')
    expect(result.eventsCopied).toBeGreaterThan(0)
    expect(result.parentSession.messages).toHaveLength(6)
  })

  it('creates independent child event log', async () => {
    await createTestSession('parent', 2)

    const result = await forkSession({
      baseDir: tempDir,
      parentSessionId: 'parent',
      newSessionId: 'child',
    })

    const childSession = await resumeSession({
      baseDir: tempDir,
      sessionId: result.childSessionId,
    })

    expect(childSession).not.toBeNull()
    expect(childSession?.messages).toHaveLength(4)
    expect(childSession?.model).toBe('claude-sonnet-4-20250514')
  })

  it('preserves parent session untouched', async () => {
    await createTestSession('parent', 2)

    await forkSession({
      baseDir: tempDir,
      parentSessionId: 'parent',
      newSessionId: 'child',
    })

    const parentSession = await resumeSession({
      baseDir: tempDir,
      sessionId: 'parent',
    })

    expect(parentSession).not.toBeNull()
    expect(parentSession?.messages).toHaveLength(4)
  })

  it('allows different model for forked session', async () => {
    await createTestSession('parent', 1)

    const result = await forkSession({
      baseDir: tempDir,
      parentSessionId: 'parent',
      newSessionId: 'child',
      newModel: 'gpt-4o',
    })

    const childSession = await resumeSession({
      baseDir: tempDir,
      sessionId: result.childSessionId,
    })

    expect(childSession?.model).toBe('gpt-4o')
  })

  it('allows different title for forked session', async () => {
    await createTestSession('parent', 1)

    const result = await forkSession({
      baseDir: tempDir,
      parentSessionId: 'parent',
      newSessionId: 'child',
      newTitle: 'Experiment Branch',
    })

    const childSession = await resumeSession({
      baseDir: tempDir,
      sessionId: result.childSessionId,
    })

    expect(childSession?.title).toBe('Experiment Branch')
  })

  it('forks at specific event index', async () => {
    await createTestSession('parent', 3)

    const result = await forkSession({
      baseDir: tempDir,
      parentSessionId: 'parent',
      newSessionId: 'child',
      forkAfterEventIndex: 2,
    })

    const childSession = await resumeSession({
      baseDir: tempDir,
      sessionId: result.childSessionId,
    })

    expect(childSession).not.toBeNull()
    expect(childSession?.messages.length).toBeLessThan(6)
    expect(result.forkPoint).toBe(2)
  })

  it('forks at specific timestamp', async () => {
    const log = new SessionLog(tempDir, 'parent')
    const t1 = Date.now() - 3000
    const t2 = Date.now() - 2000
    const t3 = Date.now() - 1000

    const e1 = createEvent('session.created', 'parent', {
      model: 'gpt-4o',
      cwd: '/tmp',
    })
    e1.timestamp = t1
    await log.append(e1)

    const e2 = createEvent('session.message', 'parent', {
      role: 'user',
      content: 'msg1',
    })
    e2.timestamp = t2
    await log.append(e2)

    const e3 = createEvent('session.message', 'parent', {
      role: 'assistant',
      content: 'resp1',
    })
    e3.timestamp = t3
    await log.append(e3)

    const result = await forkSession({
      baseDir: tempDir,
      parentSessionId: 'parent',
      newSessionId: 'child',
      forkAfterTimestamp: t2,
    })

    const childSession = await resumeSession({
      baseDir: tempDir,
      sessionId: result.childSessionId,
    })

    expect(childSession).not.toBeNull()
    expect(result.eventsCopied).toBeGreaterThanOrEqual(2)
  })

  it('child can diverge with new messages', async () => {
    await createTestSession('parent', 2)

    const result = await forkSession({
      baseDir: tempDir,
      parentSessionId: 'parent',
      newSessionId: 'child',
    })

    const childLog = new SessionLog(tempDir, result.childSessionId)
    await childLog.append(
      createEvent('session.message', result.childSessionId, {
        role: 'user',
        content: 'New divergent message',
      }),
    )

    const childSession = await resumeSession({
      baseDir: tempDir,
      sessionId: result.childSessionId,
    })

    expect(childSession?.messages).toHaveLength(5)
    expect(childSession?.messages[4].content).toBe('New divergent message')
  })

  it('generates unique child session ID if not provided', async () => {
    await createTestSession('parent', 1)

    const result = await forkSession({
      baseDir: tempDir,
      parentSessionId: 'parent',
    })

    expect(result.childSessionId).toContain('parent-fork-')
    expect(result.childSessionId).not.toBe('parent')
  })

  it('throws when no events to fork from', async () => {
    await expect(
      forkSession({
        baseDir: tempDir,
        parentSessionId: 'empty-parent',
      }),
    ).rejects.toThrow('not found')
  })
})

describe('forkSessionAtMessage', () => {
  it('forks at specific message index', async () => {
    await createTestSession('parent', 5)

    const result = await forkSessionAtMessage(tempDir, 'parent', 2, {
      newSessionId: 'child-at-2',
    })

    const childSession = await resumeSession({
      baseDir: tempDir,
      sessionId: result.childSessionId,
    })

    expect(childSession).not.toBeNull()
    expect(childSession?.messages.length).toBeLessThan(10)
    expect(result.childSessionId).toBe('child-at-2')
  })

  it('throws for invalid message index', async () => {
    await createTestSession('parent', 3)

    await expect(forkSessionAtMessage(tempDir, 'parent', 10)).rejects.toThrow('not found')
  })

  it('forks at first message', async () => {
    await createTestSession('parent', 3)

    const result = await forkSessionAtMessage(tempDir, 'parent', 0, {
      newSessionId: 'child-first',
    })

    const childSession = await resumeSession({
      baseDir: tempDir,
      sessionId: result.childSessionId,
    })

    expect(childSession).not.toBeNull()
    expect(childSession?.messages.length).toBeGreaterThan(0)
  })

  it('forks at last message', async () => {
    await createTestSession('parent', 3)

    const result = await forkSessionAtMessage(tempDir, 'parent', 5, {
      newSessionId: 'child-last',
    })

    const childSession = await resumeSession({
      baseDir: tempDir,
      sessionId: result.childSessionId,
    })

    expect(childSession).not.toBeNull()
  })
})
