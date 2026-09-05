import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDatabase } from '../store/schema'
import { SessionSearch } from './search'

let tempDir: string
let dbPath: string
let search: SessionSearch

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'forge-search-'))
  dbPath = join(tempDir, 'test.db')
  search = new SessionSearch(dbPath)
})

afterEach(() => {
  search.close()
})

function seedSessions(count: number) {
  const db = openDatabase(dbPath)
  const stmt = db.prepare(
    `INSERT INTO sessions (id, title, model, cwd, created_at, updated_at, ended_at, event_count, input_tokens, output_tokens, total_cost)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )

  const models = ['claude-sonnet-4-20250514', 'gpt-4o', 'claude-haiku-3.5', 'gemini-2.5-pro']
  const now = Date.now()

  for (let i = 0; i < count; i++) {
    const model = models[i % models.length]
    const createdAt = now - (count - i) * 60_000
    const cost = +(i * 0.01).toFixed(2)
    stmt.run(
      `session-${i}`,
      `Test Session ${i} - ${model}`,
      model,
      `/tmp/project-${i % 5}`,
      createdAt,
      createdAt + 60_000,
      null,
      10 + i,
      100 * (i + 1),
      50 * (i + 1),
      cost,
    )
  }

  db.close()
}

describe('SessionSearch', () => {
  it('searches by title substring', () => {
    seedSessions(20)

    const result = search.search({ title: 'Session 5' })

    expect(result.total).toBeGreaterThanOrEqual(1)
    expect(result.sessions.some((s) => s.title?.includes('Session 5'))).toBe(true)
  })

  it('searches by model', () => {
    seedSessions(20)

    const result = search.search({ model: 'gpt-4o' })

    expect(result.total).toBeGreaterThanOrEqual(1)
    expect(result.sessions.every((s) => s.model === 'gpt-4o')).toBe(true)
  })

  it('searches by date range', () => {
    seedSessions(10)
    const now = Date.now()

    const result = search.search({
      dateFrom: now - 5 * 60_000,
      dateTo: now,
    })

    expect(result.total).toBeGreaterThanOrEqual(1)
    expect(
      result.sessions.every((s) => s.createdAt >= now - 5 * 60_000 && s.createdAt <= now),
    ).toBe(true)
  })

  it('searches by cost range', () => {
    seedSessions(10)

    const result = search.search({ costMin: 0.05, costMax: 0.15 })

    expect(result.total).toBeGreaterThanOrEqual(1)
    expect(result.sessions.every((s) => s.totalCost >= 0.05 && s.totalCost <= 0.15)).toBe(true)
  })

  it('combines multiple filters', () => {
    seedSessions(20)
    const _now = Date.now()

    const result = search.search({
      model: 'gpt-4o',
      costMin: 0.01,
      costMax: 0.2,
    })

    expect(result.total).toBeGreaterThanOrEqual(1)
    expect(result.sessions.every((s) => s.model === 'gpt-4o')).toBe(true)
    expect(result.sessions.every((s) => s.totalCost >= 0.01 && s.totalCost <= 0.2)).toBe(true)
  })

  it('returns empty for no matches', () => {
    seedSessions(5)

    const result = search.search({ title: 'Nonexistent Session' })

    expect(result.total).toBe(0)
    expect(result.sessions).toHaveLength(0)
  })

  it('respects limit and offset', () => {
    seedSessions(50)

    const page1 = search.search({ limit: 10, offset: 0 })
    const page2 = search.search({ limit: 10, offset: 10 })

    expect(page1.sessions).toHaveLength(10)
    expect(page2.sessions).toHaveLength(10)
    expect(page1.total).toBe(50)
    expect(page1.sessions[0].id).not.toBe(page2.sessions[0].id)
  })

  it('fuzzy title search matches multiple words', () => {
    seedSessions(10)

    const result = search.searchTitleFuzzy('Test Session')

    expect(result.length).toBeGreaterThanOrEqual(1)
    expect(result.every((s) => s.title?.includes('Test') && s.title?.includes('Session'))).toBe(
      true,
    )
  })

  it('searchByModel returns correct model sessions', () => {
    seedSessions(12)

    const result = search.searchByModel('claude-haiku-3.5')

    expect(result.length).toBeGreaterThanOrEqual(1)
    expect(result.every((s) => s.model === 'claude-haiku-3.5')).toBe(true)
  })

  it('searchByDateRange returns sessions in range', () => {
    seedSessions(10)
    const now = Date.now()

    const result = search.searchByDateRange(now - 2 * 60_000, now)

    expect(result.length).toBeGreaterThanOrEqual(1)
    expect(result.every((s) => s.createdAt >= now - 2 * 60_000 && s.createdAt <= now)).toBe(true)
  })

  it('searchByCostRange returns sessions in range', () => {
    seedSessions(10)

    const result = search.searchByCostRange(0.03, 0.07)

    expect(result.length).toBeGreaterThanOrEqual(1)
    expect(result.every((s) => s.totalCost >= 0.03 && s.totalCost <= 0.07)).toBe(true)
  })

  it('getModels returns distinct models', () => {
    seedSessions(20)

    const models = search.getModels()

    expect(models.length).toBeGreaterThanOrEqual(1)
    expect(new Set(models).size).toBe(models.length)
  })

  it('handles empty database', () => {
    const result = search.search({})

    expect(result.total).toBe(0)
    expect(result.sessions).toHaveLength(0)
    expect(search.getModels()).toHaveLength(0)
  })

  it('search with no filters returns all', () => {
    seedSessions(15)

    const result = search.search({})

    expect(result.total).toBe(15)
    expect(result.sessions).toHaveLength(15)
  })
})
