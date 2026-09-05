import { describe, expect, it } from 'bun:test'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { ensureTokenUsageTable } from '../cost/schema'
import { CostTracker } from '../cost/tracker'
import { type SessionEvent, SessionLog, createEvent } from '../events'
import { exportSession } from '../session/export'
import { forkSession } from '../session/fork'
import { getResumePoint, hasIncompleteToolCalls, resumeSession } from '../session/resume'
import { SessionStore, openDatabase } from '../store'
import { StoreSync } from '../store/sync'

function ctx() {
  const dir = join(tmpdir(), `crash-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(dir, { recursive: true })
  const dbPath = join(dir, 'forge.db')
  const db = openDatabase(dbPath)
  const cleanup = () => {
    try {
      db.close()
    } catch {}
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {}
  }
  return { dir, dbPath, db, cleanup }
}

async function writeAll(log: SessionLog, events: SessionEvent[]) {
  for (const e of events) await log.append(e)
}

async function readAll(log: SessionLog): Promise<SessionEvent[]> {
  const events: SessionEvent[] = []
  for await (const e of log.iterate()) events.push(e)
  return events
}

function buildConversation(sessionId: string): SessionEvent[] {
  return [
    createEvent('session.created', sessionId, { model: 'gpt-4o', cwd: '/tmp' }),
    createEvent('session.message', sessionId, { role: 'user', content: 'hello' }),
    createEvent('session.message', sessionId, { role: 'assistant', content: 'hi there' }),
    createEvent('session.message', sessionId, { role: 'user', content: 'list files' }),
    createEvent('session.message', sessionId, { role: 'assistant', content: 'let me check' }),
    createEvent('session.tool_call', sessionId, {
      toolCallId: 'tc-1',
      toolName: 'bash',
      args: { command: 'ls' },
    }),
    createEvent('session.tool_result', sessionId, {
      toolCallId: 'tc-1',
      toolName: 'bash',
      result: 'file1.txt\nfile2.txt',
      durationMs: 50,
    }),
    createEvent('session.message', sessionId, {
      role: 'assistant',
      content: 'The project has 2 files.',
    }),
    createEvent('session.ended', sessionId, {
      reason: 'user',
      totalCost: 0.05,
      totalTokens: { input: 1000, output: 500 },
    }),
  ]
}

describe('Crash Recovery: Event Append', () => {
  it('recovers from partial JSONL write', async () => {
    const c = ctx()
    try {
      const sessionId = 'partial-write'
      const log = new SessionLog(c.dir, sessionId)
      const events = buildConversation(sessionId)

      for (let i = 0; i < 5; i++) await log.append(events[i])

      const logPath = log.getFilePath()
      const content = readFileSync(logPath, 'utf-8')
      const lines = content.trim().split('\n')
      writeFileSync(logPath, lines.slice(0, 3).join('\n') + '\n{"corrupted')

      const recovered = new SessionLog(c.dir, sessionId)
      const recoveredEvents = await readAll(recovered)
      expect(recoveredEvents.length).toBeGreaterThanOrEqual(3)
      for (const e of recoveredEvents) {
        expect(e.type).toBeTruthy()
        expect(e.sessionId).toBe(sessionId)
      }
    } finally {
      c.cleanup()
    }
  })

  it('recovers from empty log file', async () => {
    const c = ctx()
    try {
      const sessionId = 'empty-log'
      const log = new SessionLog(c.dir, sessionId)
      await log.append(createEvent('session.created', sessionId, { model: 'gpt-4o', cwd: '/tmp' }))
      writeFileSync(log.getFilePath(), '')

      const recovered = new SessionLog(c.dir, sessionId)
      expect(await readAll(recovered)).toHaveLength(0)
    } finally {
      c.cleanup()
    }
  })

  it('recovers from truncated last line', async () => {
    const c = ctx()
    try {
      const sessionId = 'truncated'
      const log = new SessionLog(c.dir, sessionId)
      const events = buildConversation(sessionId)
      for (const e of events) await log.append(e)

      const content = readFileSync(log.getFilePath(), 'utf-8')
      const lines = content.trim().split('\n')
      writeFileSync(
        log.getFilePath(),
        lines.slice(0, -1).join('\n') + '\n' + lines[lines.length - 1].slice(0, 20),
      )

      const recovered = new SessionLog(c.dir, sessionId)
      const result = await readAll(recovered)
      expect(result.length).toBeGreaterThanOrEqual(events.length - 1)
    } finally {
      c.cleanup()
    }
  })

  it('recovers when log file does not exist', async () => {
    const c = ctx()
    try {
      const log = new SessionLog(c.dir, 'nonexistent')
      expect(await readAll(log)).toHaveLength(0)
      expect(await log.exists()).toBe(false)
    } finally {
      c.cleanup()
    }
  })

  it('preserves all complete lines even with garbage at end', async () => {
    const c = ctx()
    try {
      const sessionId = 'garbage-tail'
      const log = new SessionLog(c.dir, sessionId)
      const events = buildConversation(sessionId)
      for (const e of events) await log.append(e)

      const content = readFileSync(log.getFilePath(), 'utf-8')
      writeFileSync(log.getFilePath(), content + '\ngarbage data\nmore garbage\n')

      const recovered = new SessionLog(c.dir, sessionId)
      const result = await readAll(recovered)
      expect(result.length).toBe(events.length)
    } finally {
      c.cleanup()
    }
  })
})

describe('Crash Recovery: Tool Call/Result Pairs', () => {
  it('detects orphaned tool call (no result)', async () => {
    const c = ctx()
    try {
      const sessionId = 'orphan-tc'
      const log = new SessionLog(c.dir, sessionId)
      await log.append(createEvent('session.created', sessionId, { model: 'gpt-4o', cwd: '/tmp' }))
      await log.append(
        createEvent('session.message', sessionId, { role: 'user', content: 'do something' }),
      )
      await log.append(
        createEvent('session.message', sessionId, { role: 'assistant', content: 'ok' }),
      )
      await log.append(
        createEvent('session.tool_call', sessionId, {
          toolCallId: 'tc-1',
          toolName: 'bash',
          args: { command: 'ls' },
        }),
      )

      const state = await resumeSession({ baseDir: c.dir, sessionId })
      expect(state).not.toBeNull()
      expect(hasIncompleteToolCalls(state!)).toBe(true)
      expect(state!.pendingToolCalls).toHaveLength(1)
      expect(state!.pendingToolCalls[0].toolCallId).toBe('tc-1')
    } finally {
      c.cleanup()
    }
  })

  it('recovers from crash between tool_call and tool_result', async () => {
    const c = ctx()
    try {
      const sessionId = 'tc-crash'
      const log = new SessionLog(c.dir, sessionId)
      await log.append(createEvent('session.created', sessionId, { model: 'gpt-4o', cwd: '/tmp' }))
      await log.append(
        createEvent('session.message', sessionId, { role: 'user', content: 'run tool' }),
      )
      await log.append(
        createEvent('session.message', sessionId, { role: 'assistant', content: 'running' }),
      )
      await log.append(
        createEvent('session.tool_call', sessionId, {
          toolCallId: 'tc-1',
          toolName: 'bash',
          args: { command: 'ls' },
        }),
      )

      const state = await resumeSession({ baseDir: c.dir, sessionId })
      expect(state).not.toBeNull()
      const rp = getResumePoint(state!)
      expect(rp.canResume).toBe(true)
      expect(rp.reason).toContain('incomplete tool call')
    } finally {
      c.cleanup()
    }
  })

  it('tool call with matching result recovers cleanly', async () => {
    const c = ctx()
    try {
      const sessionId = 'tc-match'
      const log = new SessionLog(c.dir, sessionId)
      await log.append(createEvent('session.created', sessionId, { model: 'gpt-4o', cwd: '/tmp' }))
      await log.append(createEvent('session.message', sessionId, { role: 'user', content: 'run' }))
      await log.append(
        createEvent('session.tool_call', sessionId, {
          toolCallId: 'tc-1',
          toolName: 'bash',
          args: { command: 'ls' },
        }),
      )
      await log.append(
        createEvent('session.tool_result', sessionId, {
          toolCallId: 'tc-1',
          toolName: 'bash',
          result: 'ok',
        }),
      )
      await log.append(
        createEvent('session.message', sessionId, { role: 'assistant', content: 'done' }),
      )

      const state = await resumeSession({ baseDir: c.dir, sessionId })
      expect(state).not.toBeNull()
      expect(hasIncompleteToolCalls(state!)).toBe(false)
    } finally {
      c.cleanup()
    }
  })

  it('multiple tool calls with partial results', async () => {
    const c = ctx()
    try {
      const sessionId = 'multi-tc'
      const log = new SessionLog(c.dir, sessionId)
      await log.append(createEvent('session.created', sessionId, { model: 'gpt-4o', cwd: '/tmp' }))
      await log.append(
        createEvent('session.message', sessionId, { role: 'user', content: 'do two things' }),
      )
      await log.append(
        createEvent('session.message', sessionId, { role: 'assistant', content: 'ok' }),
      )
      await log.append(
        createEvent('session.tool_call', sessionId, {
          toolCallId: 'tc-1',
          toolName: 'bash',
          args: { command: 'ls' },
        }),
      )
      await log.append(
        createEvent('session.tool_call', sessionId, {
          toolCallId: 'tc-2',
          toolName: 'bash',
          args: { command: 'pwd' },
        }),
      )
      await log.append(
        createEvent('session.tool_result', sessionId, {
          toolCallId: 'tc-1',
          toolName: 'bash',
          result: 'file1.txt',
        }),
      )

      const state = await resumeSession({ baseDir: c.dir, sessionId })
      expect(state).not.toBeNull()
      expect(hasIncompleteToolCalls(state!)).toBe(true)
      expect(state!.pendingToolCalls).toHaveLength(1)
      expect(state!.pendingToolCalls[0].toolCallId).toBe('tc-2')
    } finally {
      c.cleanup()
    }
  })

  it('tool result without prior tool_call is ignored gracefully', async () => {
    const c = ctx()
    try {
      const sessionId = 'orphan-tr'
      const log = new SessionLog(c.dir, sessionId)
      await log.append(createEvent('session.created', sessionId, { model: 'gpt-4o', cwd: '/tmp' }))
      await log.append(createEvent('session.message', sessionId, { role: 'user', content: 'hi' }))
      await log.append(
        createEvent('session.tool_result', sessionId, {
          toolCallId: 'tc-unknown',
          toolName: 'bash',
          result: 'result',
        }),
      )
      await log.append(
        createEvent('session.message', sessionId, { role: 'assistant', content: 'hello' }),
      )

      const state = await resumeSession({ baseDir: c.dir, sessionId })
      expect(state).not.toBeNull()
      expect(hasIncompleteToolCalls(state!)).toBe(false)
      expect(state!.messages.length).toBeGreaterThanOrEqual(2)
    } finally {
      c.cleanup()
    }
  })
})

describe('Crash Recovery: Session State', () => {
  it('session with only created event is resumable', async () => {
    const c = ctx()
    try {
      const log = new SessionLog(c.dir, 'only-created')
      await log.append(
        createEvent('session.created', 'only-created', { model: 'gpt-4o', cwd: '/tmp' }),
      )

      const state = await resumeSession({ baseDir: c.dir, sessionId: 'only-created' })
      expect(state).not.toBeNull()
      expect(state!.ended).toBe(false)
      expect(getResumePoint(state!).canResume).toBe(true)
    } finally {
      c.cleanup()
    }
  })

  it('ended session cannot be resumed', async () => {
    const c = ctx()
    try {
      const sessionId = 'ended'
      const log = new SessionLog(c.dir, sessionId)
      await log.append(createEvent('session.created', sessionId, { model: 'gpt-4o', cwd: '/tmp' }))
      await log.append(createEvent('session.message', sessionId, { role: 'user', content: 'hi' }))
      await log.append(
        createEvent('session.message', sessionId, { role: 'assistant', content: 'hello' }),
      )
      await log.append(
        createEvent('session.ended', sessionId, {
          reason: 'user',
          totalCost: 0.01,
          totalTokens: { input: 100, output: 50 },
        }),
      )

      const state = await resumeSession({ baseDir: c.dir, sessionId })
      expect(state).not.toBeNull()
      expect(state!.ended).toBe(true)
      expect(getResumePoint(state!).canResume).toBe(false)
    } finally {
      c.cleanup()
    }
  })

  it('interrupted after user message is resumable', async () => {
    const c = ctx()
    try {
      const log = new SessionLog(c.dir, 'int-user')
      await log.append(createEvent('session.created', 'int-user', { model: 'gpt-4o', cwd: '/tmp' }))
      await log.append(
        createEvent('session.message', 'int-user', { role: 'user', content: 'hello' }),
      )

      const state = await resumeSession({ baseDir: c.dir, sessionId: 'int-user' })
      expect(state).not.toBeNull()
      expect(getResumePoint(state!).reason).toContain('user')
    } finally {
      c.cleanup()
    }
  })

  it('interrupted after assistant message is resumable', async () => {
    const c = ctx()
    try {
      const log = new SessionLog(c.dir, 'int-asst')
      await log.append(createEvent('session.created', 'int-asst', { model: 'gpt-4o', cwd: '/tmp' }))
      await log.append(
        createEvent('session.message', 'int-asst', { role: 'user', content: 'hello' }),
      )
      await log.append(
        createEvent('session.message', 'int-asst', { role: 'assistant', content: 'hi' }),
      )

      const state = await resumeSession({ baseDir: c.dir, sessionId: 'int-asst' })
      expect(state).not.toBeNull()
      expect(getResumePoint(state!).reason).toContain('interrupted')
    } finally {
      c.cleanup()
    }
  })

  it('session with error event records the error', async () => {
    const c = ctx()
    try {
      const log = new SessionLog(c.dir, 'with-error')
      await log.append(
        createEvent('session.created', 'with-error', { model: 'gpt-4o', cwd: '/tmp' }),
      )
      await log.append(
        createEvent('session.message', 'with-error', { role: 'user', content: 'go' }),
      )
      await log.append(
        createEvent('session.error', 'with-error', {
          code: 'FORGE_3001',
          message: 'Rate limit',
          severity: 'error',
        }),
      )

      const state = await resumeSession({ baseDir: c.dir, sessionId: 'with-error' })
      expect(state).not.toBeNull()
      expect(state!.errors.length).toBe(1)
      expect(state!.errors[0].code).toBe('FORGE_3001')
    } finally {
      c.cleanup()
    }
  })
})

describe('Crash Recovery: SQLite Store', () => {
  it('store sync recovers from missing database', async () => {
    const c = ctx()
    try {
      const store = new SessionStore(join(c.dir, 'missing.db'), c.dir)
      const log = new SessionLog(c.dir, 'sync-test')
      await log.append(
        createEvent('session.created', 'sync-test', { model: 'gpt-4o', cwd: '/tmp' }),
      )
      await log.append(createEvent('session.message', 'sync-test', { role: 'user', content: 'hi' }))

      const sync = new StoreSync(store)
      const result = await sync.syncAll()
      expect(result.synced).toBe(1)
      expect(result.errors).toHaveLength(0)
    } finally {
      c.cleanup()
    }
  })

  it('store handles concurrent sync of multiple sessions', async () => {
    const c = ctx()
    try {
      const store = new SessionStore(c.dbPath, c.dir)
      for (let i = 0; i < 5; i++) {
        const log = new SessionLog(c.dir, `concurrent-${i}`)
        await log.append(
          createEvent('session.created', `concurrent-${i}`, { model: 'gpt-4o', cwd: '/tmp' }),
        )
        await log.append(
          createEvent('session.message', `concurrent-${i}`, { role: 'user', content: `msg ${i}` }),
        )
      }

      const sync = new StoreSync(store)
      const result = await sync.syncAll()
      expect(result.synced).toBe(5)
      expect(store.listSessions()).toHaveLength(5)
    } finally {
      c.cleanup()
    }
  })

  it('store upserts correctly on re-sync', async () => {
    const c = ctx()
    try {
      const store = new SessionStore(c.dbPath, c.dir)
      const log = new SessionLog(c.dir, 'upsert-test')
      await log.append(
        createEvent('session.created', 'upsert-test', { model: 'gpt-4o', cwd: '/tmp' }),
      )
      await log.append(
        createEvent('session.message', 'upsert-test', { role: 'user', content: 'v1' }),
      )

      const sync = new StoreSync(store)
      await sync.syncAll()

      await log.append(
        createEvent('session.message', 'upsert-test', { role: 'assistant', content: 'v2' }),
      )
      await sync.syncAll()

      const session = store.getSession('upsert-test')
      expect(session).not.toBeNull()
      expect(session!.eventCount).toBe(3)
    } finally {
      c.cleanup()
    }
  })
})

describe('Crash Recovery: Fork After Crash', () => {
  it('can fork from incomplete session', async () => {
    const c = ctx()
    try {
      const sessionId = 'fork-incomplete'
      const log = new SessionLog(c.dir, sessionId)
      await log.append(createEvent('session.created', sessionId, { model: 'gpt-4o', cwd: '/tmp' }))
      await log.append(
        createEvent('session.message', sessionId, { role: 'user', content: 'hello' }),
      )
      await log.append(
        createEvent('session.message', sessionId, { role: 'assistant', content: 'hi' }),
      )
      await log.append(
        createEvent('session.tool_call', sessionId, {
          toolCallId: 'tc-1',
          toolName: 'bash',
          args: { command: 'ls' },
        }),
      )

      const result = await forkSession({
        baseDir: c.dir,
        parentSessionId: sessionId,
        newSessionId: 'fork-child-1',
        newModel: 'gpt-4o-mini',
      })
      expect(result.childSessionId).toBe('fork-child-1')
      expect(result.eventsCopied).toBe(5)

      const childLog = new SessionLog(c.dir, 'fork-child-1')
      const childEvents = await readAll(childLog)
      expect(childEvents).toHaveLength(5)
      expect(childEvents[0].type).toBe('session.created')
      expect(childEvents[3].type).toBe('session.tool_call')
      expect(childEvents[4].type).toBe('session.created')
    } finally {
      c.cleanup()
    }
  })

  it('forked child can diverge with new messages', async () => {
    const c = ctx()
    try {
      const parentId = 'fork-parent-diverge'
      const log = new SessionLog(c.dir, parentId)
      await log.append(createEvent('session.created', parentId, { model: 'gpt-4o', cwd: '/tmp' }))
      await log.append(
        createEvent('session.message', parentId, { role: 'user', content: 'original' }),
      )
      await log.append(
        createEvent('session.message', parentId, { role: 'assistant', content: 'reply' }),
      )

      await forkSession({
        baseDir: c.dir,
        parentSessionId: parentId,
        newSessionId: 'fork-child-diverge',
      })

      const childLog = new SessionLog(c.dir, 'fork-child-diverge')
      await childLog.append(
        createEvent('session.message', 'fork-child-diverge', {
          role: 'user',
          content: 'new question',
        }),
      )
      await childLog.append(
        createEvent('session.message', 'fork-child-diverge', {
          role: 'assistant',
          content: 'new answer',
        }),
      )

      const parentEvents = await readAll(new SessionLog(c.dir, parentId))
      expect(parentEvents).toHaveLength(3)

      const childEvents = await readAll(childLog)
      expect(childEvents).toHaveLength(6)
    } finally {
      c.cleanup()
    }
  })
})

describe('Crash Recovery: Compaction', () => {
  it('compaction event preserves conversation summary', async () => {
    const c = ctx()
    try {
      const log = new SessionLog(c.dir, 'compact-test')
      await log.append(
        createEvent('session.created', 'compact-test', { model: 'gpt-4o', cwd: '/tmp' }),
      )
      await log.append(
        createEvent('session.message', 'compact-test', { role: 'user', content: 'msg1' }),
      )
      await log.append(
        createEvent('session.message', 'compact-test', { role: 'assistant', content: 'reply1' }),
      )
      await log.append(
        createEvent('session.message', 'compact-test', { role: 'user', content: 'msg2' }),
      )
      await log.append(
        createEvent('session.message', 'compact-test', { role: 'assistant', content: 'reply2' }),
      )
      await log.append(
        createEvent('session.compaction', 'compact-test', {
          beforeCount: 4,
          afterCount: 2,
          summary: 'User asked about files.',
          tokensSaved: 500,
        }),
      )
      await log.append(
        createEvent('session.message', 'compact-test', { role: 'user', content: 'msg3' }),
      )

      const state = await resumeSession({ baseDir: c.dir, sessionId: 'compact-test' })
      expect(state).not.toBeNull()
      expect(state!.compactions.length).toBe(1)
      expect(state!.compactions[0].summary).toBe('User asked about files.')
      expect(state!.compactions[0].tokensSaved).toBe(500)
    } finally {
      c.cleanup()
    }
  })

  it('multiple compactions are recorded', async () => {
    const c = ctx()
    try {
      const log = new SessionLog(c.dir, 'multi-compact')
      await log.append(
        createEvent('session.created', 'multi-compact', { model: 'gpt-4o', cwd: '/tmp' }),
      )
      for (let i = 0; i < 10; i++) {
        await log.append(
          createEvent('session.message', 'multi-compact', { role: 'user', content: `msg ${i}` }),
        )
        await log.append(
          createEvent('session.message', 'multi-compact', {
            role: 'assistant',
            content: `reply ${i}`,
          }),
        )
      }
      await log.append(
        createEvent('session.compaction', 'multi-compact', {
          beforeCount: 10,
          afterCount: 4,
          summary: 'First',
          tokensSaved: 300,
        }),
      )
      await log.append(
        createEvent('session.compaction', 'multi-compact', {
          beforeCount: 4,
          afterCount: 2,
          summary: 'Second',
          tokensSaved: 100,
        }),
      )

      const state = await resumeSession({ baseDir: c.dir, sessionId: 'multi-compact' })
      expect(state).not.toBeNull()
      expect(state!.compactions.length).toBe(2)
    } finally {
      c.cleanup()
    }
  })
})

describe('Crash Recovery: Large Sessions', () => {
  it('recovers session with 500 events under 1s', async () => {
    const c = ctx()
    try {
      const log = new SessionLog(c.dir, 'large')
      await log.append(createEvent('session.created', 'large', { model: 'gpt-4o', cwd: '/tmp' }))
      for (let i = 0; i < 249; i++) {
        await log.append(
          createEvent('session.message', 'large', { role: 'user', content: `msg ${i}` }),
        )
        await log.append(
          createEvent('session.message', 'large', { role: 'assistant', content: `reply ${i}` }),
        )
      }
      await log.append(createEvent('session.message', 'large', { role: 'user', content: 'final' }))

      const start = Date.now()
      const state = await resumeSession({ baseDir: c.dir, sessionId: 'large' })
      const elapsed = Date.now() - start

      expect(state).not.toBeNull()
      expect(state!.messages.length).toBe(499)
      expect(elapsed).toBeLessThan(1000)
    } finally {
      c.cleanup()
    }
  })

  it('resumes large session with incomplete tool call under 1s', async () => {
    const c = ctx()
    try {
      const log = new SessionLog(c.dir, 'large-inc')
      await log.append(
        createEvent('session.created', 'large-inc', { model: 'gpt-4o', cwd: '/tmp' }),
      )
      for (let i = 0; i < 200; i++) {
        await log.append(
          createEvent('session.message', 'large-inc', { role: 'user', content: `msg ${i}` }),
        )
        await log.append(
          createEvent('session.message', 'large-inc', { role: 'assistant', content: `reply ${i}` }),
        )
      }
      await log.append(
        createEvent('session.tool_call', 'large-inc', {
          toolCallId: 'tc-final',
          toolName: 'bash',
          args: { command: 'ls' },
        }),
      )

      const start = Date.now()
      const state = await resumeSession({ baseDir: c.dir, sessionId: 'large-inc' })
      const elapsed = Date.now() - start

      expect(state).not.toBeNull()
      expect(hasIncompleteToolCalls(state!)).toBe(true)
      expect(elapsed).toBeLessThan(1000)
    } finally {
      c.cleanup()
    }
  })
})

describe('Crash Recovery: Cost Tracker', () => {
  it('cost tracker survives db reopen', () => {
    const c = ctx()
    try {
      ensureTokenUsageTable(c.db)
      const now = Date.now()
      c.db
        .prepare(
          'INSERT INTO sessions (id, model, cwd, created_at, updated_at, event_count, input_tokens, output_tokens, total_cost) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .run('s1', 'gpt-4o', '/tmp', now, now, 0, 0, 0, 0)
      const tracker = new CostTracker(c.db)
      tracker.recordLLMCall('s1', 0, 'gpt-4o', 'openai', { inputTokens: 1000, outputTokens: 500 })
      c.db.close()

      const db2 = openDatabase(c.dbPath)
      ensureTokenUsageTable(db2)
      const tracker2 = new CostTracker(db2)
      const usage = tracker2.getSessionUsage('s1')
      expect(usage).toHaveLength(1)
      expect(usage[0].input_tokens).toBe(1000)
      db2.close()
    } finally {
      c.cleanup()
    }
  })

  it('cost data persists after multiple reopens', () => {
    const c = ctx()
    try {
      ensureTokenUsageTable(c.db)
      const now = Date.now()
      for (let i = 0; i < 10; i++) {
        c.db
          .prepare(
            'INSERT OR IGNORE INTO sessions (id, model, cwd, created_at, updated_at, event_count, input_tokens, output_tokens, total_cost) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          )
          .run(`s-p${i}`, 'gpt-4o', '/tmp', now, now, 0, 0, 0, 0)
        const tracker = new CostTracker(c.db)
        tracker.recordLLMCall(`s-p${i}`, 0, 'gpt-4o', 'openai', {
          inputTokens: 100 * (i + 1),
          outputTokens: 50 * (i + 1),
        })
        c.db.close()

        const db2 = openDatabase(c.dbPath)
        ensureTokenUsageTable(db2)
        c.db = db2
      }

      const tracker = new CostTracker(c.db)
      const total = tracker.getSessionTotal('s-p9')
      expect(total.input_tokens).toBe(1000)
      expect(total.output_tokens).toBe(500)
    } finally {
      c.cleanup()
    }
  })
})

describe('Crash Recovery: Export Integrity', () => {
  it('export produces valid JSON after crash recovery', async () => {
    const c = ctx()
    try {
      const sessionId = 'export-crash'
      const log = new SessionLog(c.dir, sessionId)
      for (const e of buildConversation(sessionId)) await log.append(e)

      const result = await exportSession({ baseDir: c.dir, sessionId, format: 'json' })
      const parsed = JSON.parse(result.content)
      expect(parsed.events.length).toBe(9)
      expect(result.eventCount).toBe(9)
    } finally {
      c.cleanup()
    }
  })

  it('export recovers gracefully from partial log', async () => {
    const c = ctx()
    try {
      const sessionId = 'export-partial'
      const log = new SessionLog(c.dir, sessionId)
      await log.append(createEvent('session.created', sessionId, { model: 'gpt-4o', cwd: '/tmp' }))
      await log.append(createEvent('session.message', sessionId, { role: 'user', content: 'hi' }))

      writeFileSync(log.getFilePath(), readFileSync(log.getFilePath(), 'utf-8') + '\nbroken json')

      const result = await exportSession({ baseDir: c.dir, sessionId, format: 'json' })
      const parsed = JSON.parse(result.content)
      expect(parsed.events.length).toBeGreaterThanOrEqual(2)
    } finally {
      c.cleanup()
    }
  })
})
