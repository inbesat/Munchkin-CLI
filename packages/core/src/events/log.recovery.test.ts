import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SessionLog, createEvent } from './log'
import type { SessionEvent } from './types'

function makeEvent(i: number, sessionId: string): SessionEvent {
  return createEvent('session.message', sessionId, { role: 'user', content: `m${i}` }, `evt-${i}`)
}

describe('SessionLog append after torn write', () => {
  let baseDir: string
  let sessionId: string

  beforeEach(() => {
    baseDir = mkdtempSync(join(tmpdir(), 'forge-log-'))
    sessionId = 'torn-session'
  })
  afterEach(() => {
    rmSync(baseDir, { recursive: true, force: true })
  })

  it('preserves complete records and appended events after a truncated tail', async () => {
    const log = new SessionLog(baseDir, sessionId)
    await log.append({
      ...makeEvent(0, sessionId),
      payload: { role: 'user', content: 'complete' },
    })

    // Simulate a crash: valid line followed by a torn (unterminated) fragment.
    await Bun.write(
      log.getFilePath(),
      `${JSON.stringify({ ...makeEvent(0, sessionId), id: 'evt-0' })}\n{"partial":`,
    )

    // A crash means a fresh process, hence a fresh SessionLog instance: its
    // first append repairs the torn tail before writing.
    const recovered = new SessionLog(baseDir, sessionId)
    await recovered.append({ ...makeEvent(1, sessionId), id: 'evt-1-after-recovery' })
    await recovered.append({ ...makeEvent(2, sessionId), id: 'evt-2-after-recovery' })

    const replayed: string[] = []
    for await (const event of log.iterate()) replayed.push(event.id)

    expect(replayed).toContain('evt-0')
    expect(replayed).toContain('evt-1-after-recovery')
    expect(replayed).toContain('evt-2-after-recovery')
    expect(replayed).toHaveLength(3)
  })

  it('does not corrupt a clean log when appending', async () => {
    const log = new SessionLog(baseDir, sessionId)
    await log.append(makeEvent(0, sessionId))
    await log.append(makeEvent(1, sessionId))
    const replayed: string[] = []
    for await (const event of log.iterate()) replayed.push(event.id)
    expect(replayed).toEqual(['evt-0', 'evt-1'])
  })
})
