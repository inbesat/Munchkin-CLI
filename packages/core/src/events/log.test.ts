import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SessionLog, createEvent } from './index'

let tempDir: string

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'forge-session-'))
})

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true })
})

describe('SessionLog', () => {
  it('appends and iterates events', async () => {
    const log = new SessionLog(tempDir, 'test-session')
    await log.append(
      createEvent('session.created', 'test-session', {
        model: 'claude-sonnet-4-20250514',
        cwd: '/tmp',
      }),
    )
    await log.append(
      createEvent('session.message', 'test-session', {
        role: 'user',
        content: 'Hello',
      }),
    )
    await log.append(
      createEvent('session.message', 'test-session', {
        role: 'assistant',
        content: 'Hi there',
      }),
    )

    const events: string[] = []
    for await (const event of log.iterate()) {
      events.push(event.type)
    }

    expect(events).toEqual(['session.created', 'session.message', 'session.message'])
  })

  it('counts events', async () => {
    const log = new SessionLog(tempDir, 'count-test')
    await log.append(
      createEvent('session.created', 'count-test', {
        model: 'claude-sonnet-4-20250514',
        cwd: '/tmp',
      }),
    )
    await log.append(
      createEvent('session.message', 'count-test', {
        role: 'user',
        content: 'test',
      }),
    )

    const count = await log.count()
    expect(count).toBe(2)
  })

  it('returns 0 count for nonexistent session', async () => {
    const log = new SessionLog(tempDir, 'nonexistent')
    const count = await log.count()
    expect(count).toBe(0)
  })

  it('checks if session file exists', async () => {
    const log = new SessionLog(tempDir, 'exists-test')
    expect(await log.exists()).toBe(false)

    await log.append(
      createEvent('session.created', 'exists-test', {
        model: 'claude-sonnet-4-20250514',
        cwd: '/tmp',
      }),
    )
    expect(await log.exists()).toBe(true)
  })

  it('returns valid JSON from iterate', async () => {
    const log = new SessionLog(tempDir, 'valid-json')
    const event = createEvent('session.tool_call', 'valid-json', {
      toolCallId: 'tc-1',
      toolName: 'bash',
      args: { command: 'ls' },
    })
    await log.append(event)

    for await (const e of log.iterate()) {
      expect(e.id).toBe(event.id)
      expect(e.sessionId).toBe('valid-json')
      expect(e.schemaVersion).toBe(1)
      expect(e.type).toBe('session.tool_call')
      expect(e.timestamp).toBeGreaterThan(0)
    }
  })

  it('handles tool_result event with error', async () => {
    const log = new SessionLog(tempDir, 'tool-error')
    await log.append(
      createEvent('session.tool_result', 'tool-error', {
        toolCallId: 'tc-2',
        toolName: 'bash',
        result: null,
        error: 'Command failed',
        durationMs: 150,
      }),
    )

    for await (const e of log.iterate()) {
      expect(e.type).toBe('session.tool_result')
      if (e.type === 'session.tool_result') {
        expect(e.payload.error).toBe('Command failed')
        expect(e.payload.durationMs).toBe(150)
      }
    }
  })

  it('handles session.ended with cost data', async () => {
    const log = new SessionLog(tempDir, 'cost')
    await log.append(
      createEvent('session.ended', 'cost', {
        reason: 'user',
        totalTokens: { input: 5000, output: 2000 },
        totalCost: 0.05,
      }),
    )

    for await (const e of log.iterate()) {
      if (e.type === 'session.ended') {
        expect(e.payload.totalCost).toBe(0.05)
        expect(e.payload.totalTokens).toEqual({ input: 5000, output: 2000 })
      }
    }
  })

  it('handles compaction event', async () => {
    const log = new SessionLog(tempDir, 'compact')
    await log.append(
      createEvent('session.compaction', 'compact', {
        beforeCount: 100,
        afterCount: 20,
        summary: 'Removed old tool results',
        tokensSaved: 8000,
      }),
    )

    for await (const e of log.iterate()) {
      if (e.type === 'session.compaction') {
        expect(e.payload.beforeCount).toBe(100)
        expect(e.payload.afterCount).toBe(20)
        expect(e.payload.tokensSaved).toBe(8000)
      }
    }
  })

  it('returns file path and session ID', async () => {
    const log = new SessionLog(tempDir, 'paths')
    expect(log.getSessionId()).toBe('paths')
    expect(log.getFilePath()).toContain('paths.jsonl')
  })
})

describe('createEvent', () => {
  it('creates event with correct schema version', () => {
    const event = createEvent('session.created', 's1', {
      model: 'gpt-4o',
      cwd: '/tmp',
    })
    expect(event.schemaVersion).toBe(1)
  })

  it('creates event with UUID if no ID provided', () => {
    const event = createEvent('session.created', 's1', {
      model: 'gpt-4o',
      cwd: '/tmp',
    })
    expect(event.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  })

  it('uses provided ID', () => {
    const event = createEvent(
      'session.created',
      's1',
      { model: 'gpt-4o', cwd: '/tmp' },
      'custom-id',
    )
    expect(event.id).toBe('custom-id')
  })
})
