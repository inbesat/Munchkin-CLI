import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import {
  type FreshnessRecord,
  FreshnessTracker,
  checkFreshnessBeforeEdit,
  defaultFreshnessTracker,
  recordFileRead,
} from './freshness'

const TEST_DIR = join(__dirname, 'freshness-test')
const TEST_FILE = join(TEST_DIR, 'test.txt')

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true })
  writeFileSync(TEST_FILE, 'original content\n')
  defaultFreshnessTracker.clearAll()
})

afterEach(() => {
  try {
    rmSync(TEST_DIR, { recursive: true, force: true })
  } catch {}
  defaultFreshnessTracker.clearAll()
})

describe('FreshnessTracker', () => {
  let tracker: FreshnessTracker

  beforeEach(() => {
    tracker = new FreshnessTracker()
  })

  it('records a file read with hash', async () => {
    const record = await tracker.recordRead(TEST_FILE, 'session-1')
    expect(record.path).toBe(TEST_FILE)
    expect(record.hash).toHaveLength(64)
    expect(record.size).toBeGreaterThan(0)
    expect(record.sessionId).toBe('session-1')
  })

  it('returns fresh for unchanged file', async () => {
    await tracker.recordRead(TEST_FILE, 'session-1')
    const result = await tracker.checkFreshness(TEST_FILE, 'session-1')
    expect(result.fresh).toBe(true)
    expect(result.currentHash).toBe(result.recordedHash)
  })

  it('detects external modification', async () => {
    await tracker.recordRead(TEST_FILE, 'session-1')
    writeFileSync(TEST_FILE, 'modified content\n')
    const result = await tracker.checkFreshness(TEST_FILE, 'session-1')
    expect(result.fresh).toBe(false)
    expect(result.warning).toContain('modified externally')
    expect(result.currentHash).not.toBe(result.recordedHash)
  })

  it('detects file deletion', async () => {
    await tracker.recordRead(TEST_FILE, 'session-1')
    rmSync(TEST_FILE)
    const result = await tracker.checkFreshness(TEST_FILE, 'session-1')
    expect(result.fresh).toBe(false)
    expect(result.warning).toContain('deleted')
  })

  it('returns fresh for file not read in session', async () => {
    const result = await tracker.checkFreshness(TEST_FILE, 'session-1')
    expect(result.fresh).toBe(true)
    expect(result.warning).toContain('No freshness record')
  })

  it('returns fresh for unknown session', async () => {
    await tracker.recordRead(TEST_FILE, 'session-1')
    const result = await tracker.checkFreshness(TEST_FILE, 'session-2')
    expect(result.fresh).toBe(true)
    expect(result.warning).toContain('No freshness record')
  })

  it('isolates sessions', async () => {
    await tracker.recordRead(TEST_FILE, 'session-1')
    writeFileSync(TEST_FILE, 'modified')
    const result1 = await tracker.checkFreshness(TEST_FILE, 'session-1')
    const result2 = await tracker.checkFreshness(TEST_FILE, 'session-2')
    expect(result1.fresh).toBe(false)
    expect(result2.fresh).toBe(true)
  })

  it('clears session records', async () => {
    await tracker.recordRead(TEST_FILE, 'session-1')
    tracker.clearSession('session-1')
    const result = await tracker.checkFreshness(TEST_FILE, 'session-1')
    expect(result.fresh).toBe(true)
  })

  it('clears all records', async () => {
    await tracker.recordRead(TEST_FILE, 'session-1')
    await tracker.recordRead(TEST_FILE, 'session-2')
    tracker.clearAll()
    const result1 = await tracker.checkFreshness(TEST_FILE, 'session-1')
    const result2 = await tracker.checkFreshness(TEST_FILE, 'session-2')
    expect(result1.fresh).toBe(true)
    expect(result2.fresh).toBe(true)
  })

  it('gets session records', async () => {
    await tracker.recordRead(TEST_FILE, 'session-1')
    const records = tracker.getSessionRecords('session-1')
    expect(records).toHaveLength(1)
    expect(records[0].path).toBe(TEST_FILE)
  })

  it('throws on missing file', async () => {
    await expect(tracker.recordRead(join(TEST_DIR, 'missing.txt'), 's1')).rejects.toThrow(
      'File not found',
    )
  })

  it('different content produces different hash', async () => {
    const record1 = await tracker.recordRead(TEST_FILE, 's1')
    writeFileSync(TEST_FILE, 'different content')
    const record2 = await tracker.recordRead(TEST_FILE, 's2')
    expect(record1.hash).not.toBe(record2.hash)
  })
})

describe('checkFreshnessBeforeEdit', () => {
  it('returns warning for stale file', async () => {
    await recordFileRead(TEST_FILE, 'session-1')
    writeFileSync(TEST_FILE, 'modified')
    const warning = await checkFreshnessBeforeEdit(TEST_FILE, 'session-1')
    expect(warning).toBeDefined()
    expect(warning).toContain('modified externally')
  })

  it('returns undefined for fresh file', async () => {
    await recordFileRead(TEST_FILE, 'session-1')
    const warning = await checkFreshnessBeforeEdit(TEST_FILE, 'session-1')
    expect(warning).toBeUndefined()
  })

  it('throws when blockOnStale is true', async () => {
    await recordFileRead(TEST_FILE, 'session-1')
    writeFileSync(TEST_FILE, 'modified')
    await expect(
      checkFreshnessBeforeEdit(TEST_FILE, 'session-1', { blockOnStale: true }),
    ).rejects.toThrow('Stale file edit blocked')
  })

  it('uses custom tracker', async () => {
    const customTracker = new FreshnessTracker()
    await recordFileRead(TEST_FILE, 'session-1', customTracker)
    writeFileSync(TEST_FILE, 'modified')
    const warning = await checkFreshnessBeforeEdit(TEST_FILE, 'session-1', {
      tracker: customTracker,
    })
    expect(warning).toBeDefined()
  })
})

describe('recordFileRead', () => {
  it('returns FreshnessRecord with correct properties', async () => {
    const record = await recordFileRead(TEST_FILE, 'session-1')
    expect(record).toMatchObject({
      path: TEST_FILE,
      sessionId: 'session-1',
    })
    expect(record.hash).toHaveLength(64)
    expect(record.size).toBeGreaterThan(0)
  })

  it('stores record in default tracker', async () => {
    await recordFileRead(TEST_FILE, 'session-1')
    const result = await defaultFreshnessTracker.checkFreshness(TEST_FILE, 'session-1')
    expect(result.fresh).toBe(true)
  })
})

describe('FreshnessRecord', () => {
  it('has required fields', () => {
    const record: FreshnessRecord = {
      path: '/test.txt',
      hash: 'a'.repeat(64),
      size: 100,
      timestamp: Date.now(),
      sessionId: 's1',
    }
    expect(record.path).toBe('/test.txt')
    expect(record.hash).toHaveLength(64)
  })
})
