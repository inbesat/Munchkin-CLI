import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SessionLog, createEvent, ensureTokenUsageTable, openDatabase } from '@forge/core'
import { run } from '../cli'
import { runStatsCommand } from './command'

/** Local-time ms so the day grouping is timezone-proof. */
const localMs = (y: number, mo: number, d: number, h: number): number =>
  new Date(y, mo - 1, d, h).getTime()

let baseDir: string

beforeAll(async () => {
  baseDir = mkdtempSync(join(tmpdir(), 'forge-stats-cli-'))
  const db = openDatabase(join(baseDir, 'forge.db'))
  ensureTokenUsageTable(db)

  const insertSession = db.prepare(
    `INSERT INTO sessions (id, model, cwd, created_at, updated_at, ended_at, event_count, input_tokens, output_tokens, total_cost)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  insertSession.run('s1', 'model-a', '/tmp', 1000, 61000, 61000, 10, 100, 50, 0.5)
  insertSession.run('s2', 'model-b', '/tmp', 2000, 32000, null, 20, 200, 100, 0.25)

  const insertUsage = db.prepare(
    `INSERT INTO token_usage (session_id, event_index, model, provider, input_tokens, output_tokens, cost, timestamp)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  insertUsage.run('s1', 1, 'model-a', 'prov-a', 100, 50, 0.5, localMs(2026, 10, 15, 12))
  insertUsage.run('s2', 1, 'model-b', 'prov-b', 200, 100, 0.25, localMs(2026, 10, 16, 12))

  const log1 = new SessionLog(baseDir, 's1')
  await log1.append(
    createEvent('session.tool_call', 's1', { toolCallId: 'c1', toolName: 'read', args: {} }),
  )
  await log1.append(
    createEvent('session.tool_call', 's1', { toolCallId: 'c2', toolName: 'bash', args: {} }),
  )
  db.close()
})

afterAll(() => {
  try {
    rmSync(baseDir, { recursive: true, force: true })
  } catch {
    // best-effort cleanup (Windows can hold the DB file briefly)
  }
})

describe('runStatsCommand (Phase 143)', () => {
  it('prints a table dashboard by default', async () => {
    const out: string[] = []
    const code = await runStatsCommand(['stats', '--base-dir', baseDir], {
      write: (l) => out.push(l),
    })
    const text = out.join('\n')
    expect(code).toBe(0)
    expect(text).toContain('Sessions')
    expect(text).toContain('Cost by model')
    expect(text).toContain('Cost by day')
    expect(text).toContain('Tool usage')
    expect(text).toContain('model-a')
    expect(text).toContain('read')
    expect(text).toContain('$0.7500')
  })

  it('emits parseable JSON with --json', async () => {
    const out: string[] = []
    const code = await runStatsCommand(['stats', '--json', '--base-dir', baseDir], {
      write: (l) => out.push(l),
    })
    expect(code).toBe(0)
    const stats = JSON.parse(out.join('\n'))
    expect(stats.sessions.total).toBe(2)
    expect(stats.sessions.active).toBe(1)
    expect(stats.cost.total_cost).toBeCloseTo(0.75, 5)
    expect(stats.cost.call_count).toBe(2)
    expect(stats.toolUsage).toEqual([
      { tool: 'bash', calls: 1 },
      { tool: 'read', calls: 1 },
    ])
  })

  it('reports missing data without creating a database', async () => {
    const missing = join(baseDir, 'nope')
    const out: string[] = []
    const code = await runStatsCommand(['stats', '--base-dir', missing], {
      write: (l) => out.push(l),
    })
    expect(code).toBe(0)
    expect(out.join('\n')).toContain('No usage data yet')

    const jsonOut: string[] = []
    await runStatsCommand(['stats', '--json', '--base-dir', missing], {
      write: (l) => jsonOut.push(l),
    })
    expect(JSON.parse(jsonOut.join('\n')).sessions.total).toBe(0)
  })

  it('is reachable through the CLI dispatcher', async () => {
    const out: string[] = []
    const code = await run(['stats', '--base-dir', baseDir], { write: (l) => out.push(l) })
    expect(code).toBe(0)
    expect(out.join('\n')).toContain('Sessions')
  })
})
