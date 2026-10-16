import { describe, expect, it } from 'bun:test'
import {
  type CondenserCase,
  type CondenserModel,
  buildFixtureSession,
  extractiveSummarizerModel,
  runCondenserEvals,
} from './index'

const gates = { minTokenReduction: 0.5, minKeyTermRetention: 0.6 }

describe('condenser evals (Phase 92)', () => {
  it('fixtures embed labeled key terms and build valid session events', () => {
    const fixture = buildFixtureSession()
    expect(fixture.keyTerms.length).toBeGreaterThanOrEqual(4)
    expect(fixture.events.length).toBeGreaterThanOrEqual(10)
    // Every key term must be present in the uncondensed conversation.
    const joined = JSON.stringify(fixture.events)
    for (const term of fixture.keyTerms) expect(joined).toContain(term)
  })

  it('summarizing condenser passes reduction and retention gates', async () => {
    const model: CondenserModel = extractiveSummarizerModel()
    const report = await runCondenserEvals(model, gates)
    const compactionCase = report.cases.find((c: CondenserCase) => c.condenser === 'summarizing')
    expect(compactionCase).toBeDefined()
    expect(compactionCase?.tokenReduction).toBeGreaterThanOrEqual(gates.minTokenReduction)
    expect(compactionCase?.keyTermRetention).toBeGreaterThanOrEqual(gates.minKeyTermRetention)
    expect(compactionCase?.probeAnswered).toBe(true)
    expect(report.passed).toBe(true)
  })

  it('microcompact condenser passes reduction and retention gates', async () => {
    const model: CondenserModel = extractiveSummarizerModel()
    const report = await runCondenserEvals(model, gates)
    const micro = report.cases.find((c: CondenserCase) => c.condenser === 'microcompact')
    expect(micro).toBeDefined()
    expect(micro?.tokenReduction).toBeGreaterThanOrEqual(gates.minTokenReduction)
    expect(micro?.keyTermRetention).toBeGreaterThanOrEqual(gates.minKeyTermRetention)
    expect(micro?.probeAnswered).toBe(true)
  })

  it('aggregates across cases and reports threshold booleans per case', async () => {
    const report = await runCondenserEvals(extractiveSummarizerModel(), gates)
    expect(report.cases.length).toBe(2)
    expect(report.aggregate).toEqual({
      cases: 2,
      passed: 2,
      failed: 0,
      avgTokenReduction: report.cases.reduce((s, c) => s + c.tokenReduction, 0) / 2,
      avgKeyTermRetention: report.cases.reduce((s, c) => s + c.keyTermRetention, 0) / 2,
    })
  })

  it('fails a lossy condenser (negative control)', async () => {
    // A condenser model that produces an empty summary destroys key terms.
    const lossy: CondenserModel = {
      generate: async () => ({ content: 'nothing important' }),
    }
    const report = await runCondenserEvals(lossy, gates)
    expect(report.passed).toBe(false)
    const failing = report.cases.filter((c) => !c.gates.keyTermRetention)
    expect(failing.length).toBeGreaterThanOrEqual(1)
  })
})
