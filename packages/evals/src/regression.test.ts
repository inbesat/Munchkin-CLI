import { describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  compareToBaseline,
  defaultRegressionConfigPath,
  loadRegressionConfig,
  saveRegressionConfig,
} from './regression'
import type { EvalRunResult } from './runner'

function result(taskId: string, passed: boolean): EvalRunResult {
  return {
    taskId,
    modelId: 'test-model',
    passed,
    reason: 'complete',
    turns: 1,
    usage: { input: 10, output: 5, total: 15 },
    cost: 0.001,
    durationMs: 5,
  }
}

describe('compareToBaseline (Phase 146)', () => {
  it('flags a previously-passing task that now fails as a regression', () => {
    const report = compareToBaseline({ tasks: ['a'], baseline: { a: true } }, [result('a', false)])
    expect(report.passed).toBe(false)
    expect(report.regressions).toHaveLength(1)
    expect(report.results[0]).toEqual({
      taskId: 'a',
      baseline: true,
      actual: false,
      status: 'regressed',
    })
  })

  it('passes when every pinned task keeps its baseline state', () => {
    const report = compareToBaseline({ tasks: ['a', 'b'], baseline: { a: true, b: false } }, [
      result('a', true),
      result('b', false),
    ])
    expect(report.passed).toBe(true)
    expect(report.regressions).toHaveLength(0)
    expect(report.results.map((r) => r.status)).toEqual(['ok', 'ok'])
  })

  it('reports newly-fixed and unpinned tasks without blocking', () => {
    const report = compareToBaseline({ tasks: ['a', 'c'], baseline: { a: false } }, [
      result('a', true),
      result('c', true),
    ])
    expect(report.passed).toBe(true)
    expect(report.results.map((r) => r.status)).toEqual(['fixed', 'new'])
  })
})

describe('regression config (Phase 146)', () => {
  it('round-trips config files and rejects invalid shapes', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'forge-regress-'))
    const file = join(dir, 'regression.json')
    const config = { tasks: ['create-file'], baseline: { 'create-file': true } }
    await saveRegressionConfig(file, config)
    expect(await loadRegressionConfig(file)).toEqual(config)
    writeFileSync(file, JSON.stringify({ tasks: 'nope' }))
    await expect(loadRegressionConfig(file)).rejects.toThrow('invalid regression config')
    writeFileSync(file, '{ not json')
    await expect(loadRegressionConfig(file)).rejects.toThrow('invalid regression config')
    rmSync(dir, { recursive: true, force: true })
  })

  it('ships a default config pinning built-in tasks with a baseline', async () => {
    const config = await loadRegressionConfig(defaultRegressionConfigPath())
    expect(config.tasks.length).toBeGreaterThanOrEqual(3)
    for (const id of config.tasks) {
      expect(typeof config.baseline[id]).toBe('boolean')
    }
  })
})
