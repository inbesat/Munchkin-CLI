import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SessionLog, createEvent } from '../events'
import { SessionStore } from './session-store'
import { StoreSync } from './sync'

let tempDir: string
let stores: SessionStore[] = []
let dbCounter = 0

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'forge-store-'))
  stores = []
  dbCounter++
})

afterEach(async () => {
  for (const s of stores) {
    try {
      s.close()
    } catch {}
  }
})

function createStore(): SessionStore {
  const dbPath = join(tempDir, `test-${dbCounter}.db`)
  const s = new SessionStore(dbPath, tempDir)
  stores.push(s)
  return s
}

function createTestEvents(sessionId: string) {
  return [
    createEvent('session.created', sessionId, {
      model: 'claude-sonnet-4-20250514',
      cwd: '/tmp/project',
      title: 'Test Session',
    }),
    createEvent('session.message', sessionId, {
      role: 'user',
      content: 'Hello',
    }),
    createEvent('session.message', sessionId, {
      role: 'assistant',
      content: 'Hi there',
      tokens: { input: 100, output: 50 },
    }),
    createEvent('session.tool_call', sessionId, {
      toolCallId: 'tc-1',
      toolName: 'bash',
      args: { command: 'ls' },
    }),
    createEvent('session.tool_result', sessionId, {
      toolCallId: 'tc-1',
      toolName: 'bash',
      result: 'file1.txt\nfile2.txt',
    }),
    createEvent('session.ended', sessionId, {
      reason: 'user',
      totalTokens: { input: 200, output: 100 },
      totalCost: 0.005,
    }),
  ]
}

describe('SessionStore', () => {
  it('syncs from events and stores metadata', async () => {
    const log = new SessionLog(tempDir, 's1')
    for (const event of createTestEvents('s1')) {
      await log.append(event)
    }

    const store = createStore()
    const meta = await store.syncFromEvents('s1')

    expect(meta).not.toBeNull()
    expect(meta?.id).toBe('s1')
    expect(meta?.model).toBe('claude-sonnet-4-20250514')
    expect(meta?.cwd).toBe('/tmp/project')
    expect(meta?.title).toBe('Test Session')
    expect(meta?.eventCount).toBe(6)
    expect(meta?.totalCost).toBe(0.005)
  })

  it('lists sessions', async () => {
    const log1 = new SessionLog(tempDir, 's1')
    const log2 = new SessionLog(tempDir, 's2')
    for (const e of createTestEvents('s1')) await log1.append(e)
    for (const e of createTestEvents('s2')) await log2.append(e)

    const store = createStore()
    await store.syncAll()
    const list = store.listSessions()

    expect(list.length).toBe(2)
  })

  it('gets session by id', async () => {
    const log = new SessionLog(tempDir, 's1')
    for (const e of createTestEvents('s1')) await log.append(e)

    const store = createStore()
    await store.syncFromEvents('s1')
    const meta = store.getSession('s1')

    expect(meta).not.toBeNull()
    expect(meta?.id).toBe('s1')
  })

  it('searches sessions by title', async () => {
    const log = new SessionLog(tempDir, 's1')
    for (const e of createTestEvents('s1')) await log.append(e)

    const store = createStore()
    await store.syncFromEvents('s1')
    const results = store.searchSessions('Test')

    expect(results.length).toBe(1)
    expect(results[0].title).toBe('Test Session')
  })

  it('gets recent sessions', async () => {
    const log = new SessionLog(tempDir, 's1')
    for (const e of createTestEvents('s1')) await log.append(e)

    const store = createStore()
    await store.syncFromEvents('s1')
    const recent = store.getRecentSessions(5)

    expect(recent.length).toBe(1)
  })

  it('gets total cost', async () => {
    const log = new SessionLog(tempDir, 's1')
    for (const e of createTestEvents('s1')) await log.append(e)

    const store = createStore()
    await store.syncFromEvents('s1')
    const cost = store.getTotalCost()

    expect(cost).toBe(0.005)
  })

  it('gets cost by model', async () => {
    const log = new SessionLog(tempDir, 's1')
    for (const e of createTestEvents('s1')) await log.append(e)

    const store = createStore()
    await store.syncFromEvents('s1')
    const byModel = store.getCostByModel()

    expect(byModel['claude-sonnet-4-20250514']).toBe(0.005)
  })

  it('syncs multiple sessions', async () => {
    const log1 = new SessionLog(tempDir, 's1')
    const log2 = new SessionLog(tempDir, 's2')
    for (const e of createTestEvents('s1')) await log1.append(e)
    for (const e of createTestEvents('s2')) await log2.append(e)

    const store = createStore()
    const all = await store.syncAll()

    expect(all.length).toBe(2)
  })

  it('returns null for nonexistent session', async () => {
    const store = createStore()
    const meta = await store.syncFromEvents('nonexistent')
    expect(meta).toBeNull()
  })

  it('handles upsert on re-sync', async () => {
    const log = new SessionLog(tempDir, 's1')
    for (const e of createTestEvents('s1')) await log.append(e)

    const store = createStore()
    await store.syncFromEvents('s1')
    await store.syncFromEvents('s1')
    const list = store.listSessions()

    expect(list.length).toBe(1)
  })
})

describe('StoreSync', () => {
  it('syncs all sessions', async () => {
    const log = new SessionLog(tempDir, 's1')
    for (const e of createTestEvents('s1')) await log.append(e)

    const store = createStore()
    const sync = new StoreSync(store)
    const result = await sync.syncAll()

    expect(result.synced).toBe(1)
    expect(result.failed).toBe(0)
  })

  it('syncs individual session', async () => {
    const log = new SessionLog(tempDir, 's1')
    for (const e of createTestEvents('s1')) await log.append(e)

    const store = createStore()
    const sync = new StoreSync(store)
    const meta = await sync.syncSession('s1')

    expect(meta).not.toBeNull()
    expect(meta?.id).toBe('s1')
  })
})
