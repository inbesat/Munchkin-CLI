import type { Database } from 'bun:sqlite'
import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ensureTokenUsageTable } from '../cost'
import { SessionLog, createEvent } from '../events'
import { openDatabase } from '../store'
import { gatherSessionStats, gatherStats, gatherToolUsage } from './gather'

/** Local-time ms so the day grouping is timezone-proof. */
const localMs = (y: number, mo: number, d: number, h: number): number =>
  new Date(y, mo - 1, d, h).getTime()

let baseDir: string
let db: Database

beforeAll(async () => {
  baseDir = mkdtempSync(join(tmpdir(), 'forge-stats-'))
  db = openDatabase(join(baseDir, 'forge.db'))
  ensureTokenUsageTable(db)

  const insertSession = db.prepare(
    `INSERT INTO sessions (id, model, cwd, created_at, updated_at, ended_at, event_count, input_tokens, output_tokens, total_cost)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  insertSession.run('s1', 'model-a', '/tmp', 1000, 61000, 61000, 10, 100, 50, 0.5)
  insertSession.run('s2', 'model-b', '/tmp', 2000, 32000, 32000, 20, 200, 100, 0.25)
  insertSession.run('s3', 'model-a', '/tmp', 3000, 4000, null, 4, 10, 5, 0.05)

  const insertUsage = db.prepare(
    `INSERT INTO token_usage (session_id, event_index, model, provider, input_tokens, output_tokens, cost, timestamp)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  insertUsage.run('s1', 1, 'model-a', 'prov-a', 100, 50, 0.5, localMs(2026, 10, 15, 12))
  insertUsage.run('s2', 1, 'model-b', 'prov-b', 200, 100, 0.25, localMs(2026, 10, 16, 12))
  insertUsage.run('s2', 2, 'model-a', 'prov-a', 10, 5, 0.05, localMs(2026, 10, 16, 13))

  const log1 = new SessionLog(baseDir, 's1')
  await log1.append(
    createEvent('session.tool_call', 's1', { toolCallId: 'c1', toolName: 'read', args: {} }),
  )
  await log1.append(
    createEvent('session.tool_call', 's1', { toolCallId: 'c2', toolName: 'bash', args: {} }),
  )
  await log1.append(
    createEvent('session.tool_result', 's1', { toolCallId: 'c1', toolName: 'read', result: 'ok' }),
  )
  const log2 = new SessionLog(baseDir, 's2')
  await log2.append(
    createEvent('session.tool_call', 's2', { toolCallId: 'c3', toolName: 'read', args: {} }),
  )
})

afterAll(() => {
  db.close()
  try {
    rmSync(baseDir, { recursive: true, force: true })
  } catch {
    // best-effort cleanup (Windows can hold the DB file briefly)
  }
})

describe('gatherSessionStats (Phase 143)', () => {
  it('counts sessions, active sessions, and averages duration + events', () => {
    const stats = gatherSessionStats(db)
    expect(stats.total).toBe(3)
    expect(stats.active).toBe(1)
    expect(stats.avgDurationMs).toBe((60000 + 30000) / 2)
    expect(stats.avgEvents).toBeCloseTo((10 + 20 + 4) / 3, 5)
  })
})

describe('gatherToolUsage (Phase 143)', () => {
  it('counts tool calls across session logs, sorted by calls desc', async () => {
    expect(await gatherToolUsage(baseDir)).toEqual([
      { tool: 'read', calls: 2 },
      { tool: 'bash', calls: 1 },
    ])
  })

  it('returns an empty list when the sessions directory is missing', async () => {
    expect(await gatherToolUsage(join(baseDir, 'does-not-exist'))).toEqual([])
  })
})

describe('gatherStats (Phase 143)', () => {
  it('combines session, cost, daily, and tool aggregates', async () => {
    const stats = await gatherStats({ db, baseDir })
    expect(stats.sessions.total).toBe(3)
    expect(stats.cost.total_cost).toBeCloseTo(0.8, 5)
    expect(stats.cost.call_count).toBe(3)
    expect(stats.costByModel.map((m) => m.model)).toEqual(['model-a', 'model-b'])
    expect(stats.costByModel[0]?.cost).toBeCloseTo(0.55, 5)
    expect(stats.costByDay.map((d) => d.date)).toEqual(['2026-10-15', '2026-10-16'])
    expect(stats.toolUsage[0]).toEqual({ tool: 'read', calls: 2 })
  })
})
