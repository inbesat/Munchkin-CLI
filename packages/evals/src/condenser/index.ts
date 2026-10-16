/**
 * Condenser evals (Phase 92): measure compaction quality (key-term
 * retention), cost reduction (tokens saved), and task-completion impact
 * (probe answerability) for the Phase-84 summarizing condenser and the
 * Phase-86 microcompactor. Deterministic; no network, no real providers.
 */
import {
  type ModelInfo,
  assembleContextMessages,
  createAutoCompactor,
  createMicrocompactor,
} from '@forge/core'
import { type SessionEvent, createEvent } from '@forge/core'

export interface CondenserModel {
  generate(options: unknown): Promise<{ readonly content: string }>
}

export interface CondenserFixture {
  events: SessionEvent[]
  keyTerms: readonly string[]
  /** The facts a probe answer must contain to count as task success. */
  probeTerms: readonly string[]
}

export interface CondenserThresholds {
  minTokenReduction: number
  minKeyTermRetention: number
}

export interface CondenserCase {
  condenser: 'summarizing' | 'microcompact'
  tokensBefore: number
  tokensAfter: number
  tokenReduction: number
  keyTerms: readonly string[]
  retainedTerms: readonly string[]
  keyTermRetention: number
  probeAnswered: boolean
  gates: { tokenReduction: boolean; keyTermRetention: boolean; probe: boolean }
}

export interface CondenserEvalReport {
  cases: CondenserCase[]
  passed: boolean
  aggregate: {
    cases: number
    passed: number
    failed: number
    avgTokenReduction: number
    avgKeyTermRetention: number
  }
}

export interface EvalGates extends Partial<CondenserThresholds> {}

const KEY_PREFIX = 'KEY '

/** Deterministic, labeled fixture: big padding + KEY-marked facts + a probe target. */
export function buildFixtureSession(): CondenserFixture {
  const keyTerms = ['port 5050', 'REDIS_URL', 'deploy-staging', 'postgres-v16'] as const
  const events: SessionEvent[] = [
    createEvent('session.created', 'eval-session', { model: 'offline', cwd: '/tmp' }),
  ]
  const i = 0
  for (const term of keyTerms) {
    events.push(
      createEvent('session.message', 'eval-session', {
        role: 'user',
        content: `Decision ${i}: ${KEY_PREFIX}${term} must be preserved.`,
      }),
    )
    events.push(
      createEvent('session.message', 'eval-session', {
        role: 'assistant',
        content: `Acknowledged ${term}.`,
      }),
    )
  }
  for (let t = 0; t < 12; t++) {
    events.push(
      createEvent('session.tool_call', 'eval-session', {
        toolCallId: `call-${t}`,
        toolName: 'read',
        args: { path: `/tmp/pad-${t}.log` },
      }),
    )
    const payload = t === 3 ? `${KEY_PREFIX}probe target: auth service answers on port 5050.` : ''
    events.push(
      createEvent('session.tool_result', 'eval-session', {
        toolCallId: `call-${t}`,
        toolName: 'read',
        result: `${payload}${'p'.repeat(3000)}`,
        durationMs: 1,
      }),
    )
  }
  return { events, keyTerms, probeTerms: ['5050'] }
}

/** Deterministic offline summarizer: keeps sentences containing KEY-marked facts. */
export function extractiveSummarizerModel(): CondenserModel {
  const keep = ['port 5050', 'REDIS_URL', 'deploy-staging', 'postgres-v16']
  return {
    async generate(options) {
      const text = JSON.stringify(options)
      const kept = keep.filter((term) => text.includes(term)).map((term) => `KEY ${term}`)
      return {
        content: kept.length > 0 ? `Preserved facts:\n${kept.join('\n')}` : 'no key facts found',
      }
    },
  }
}

const estimate = (value: unknown): number => Math.ceil(JSON.stringify(value).length / 4)
const modelInfo: ModelInfo = { contextWindow: 100000, maxOutputTokens: 2048 }
const smallConfig = { maxTokens: 2000, compactionThreshold: 0.8, keepRecentMessages: 2 }

function visibleTokens(events: readonly SessionEvent[]): number {
  return estimate(assembleContextMessages([...events]))
}

function retentionOf(visibleText: string, keyTerms: readonly string[]): string[] {
  return keyTerms.filter((term) => visibleText.includes(term))
}

async function evalSummarizing(
  model: CondenserModel,
  fixture: CondenserFixture,
): Promise<CondenserCase> {
  const compactor = createAutoCompactor({
    model: model as unknown as Parameters<typeof createAutoCompactor>[0]['model'],
    modelInfo,
    config: smallConfig,
    keepRecentMessages: 2,
  })
  const result = await compactor.compact([...fixture.events])
  const beforeTokens = visibleTokens(fixture.events)
  const visibleText = JSON.stringify(result.messages)
  return finishCase(
    'summarizing',
    beforeTokens,
    estimate(result.messages),
    fixture,
    retentionOf(visibleText, fixture.keyTerms),
    fixture.probeTerms.every((term) => visibleText.includes(term)),
  )
}

async function evalMicrocompact(fixture: CondenserFixture): Promise<CondenserCase> {
  const micro = createMicrocompactor({ maxToolResultsToKeep: 2, summarizeToolResults: true })
  const result = await micro.microcompact([...fixture.events])
  const beforeTokens = visibleTokens(fixture.events)
  const visibleText = JSON.stringify(result.messages)
  return finishCase(
    'microcompact',
    beforeTokens,
    estimate(result.messages),
    fixture,
    retentionOf(visibleText, fixture.keyTerms),
    fixture.probeTerms.every((term) => visibleText.includes(term)),
  )
}

function finishCase(
  condenser: CondenserCase['condenser'],
  tokensBefore: number,
  tokensAfter: number,
  fixture: CondenserFixture,
  retainedTerms: readonly string[],
  probeAnswered: boolean,
): CondenserCase {
  const tokenReduction = tokensBefore > 0 ? 1 - tokensAfter / tokensBefore : 0
  const keyTermRetention =
    fixture.keyTerms.length === 0 ? 1 : retainedTerms.length / fixture.keyTerms.length
  return {
    condenser,
    tokensBefore,
    tokensAfter,
    tokenReduction,
    keyTerms: fixture.keyTerms,
    retainedTerms,
    keyTermRetention,
    probeAnswered,
    gates: {
      tokenReduction: tokenReduction >= 0.5,
      keyTermRetention: keyTermRetention >= 0.6,
      probe: probeAnswered,
    },
  }
}

/**
 * Run the condenser eval suite. Every case is scored against the gates;
 * the aggregate `passed` is true only when every case passes every gate.
 */
export async function runCondenserEvals(
  model: CondenserModel,
  thresholds: EvalGates = {},
): Promise<CondenserEvalReport> {
  const fixture = buildFixtureSession()
  const cases: CondenserCase[] = [
    await evalSummarizing(model, fixture),
    await evalMicrocompact(fixture),
  ]
  for (const c of cases) {
    if (thresholds.minTokenReduction !== undefined) {
      c.gates.tokenReduction = c.tokenReduction >= thresholds.minTokenReduction
    }
    if (thresholds.minKeyTermRetention !== undefined) {
      c.gates.keyTermRetention = c.keyTermRetention >= thresholds.minKeyTermRetention
    }
  }
  const passedCount = cases.filter((c) => Object.values(c.gates).every(Boolean)).length
  const sum = (pick: (c: CondenserCase) => number) => cases.reduce((total, c) => total + pick(c), 0)
  return {
    cases,
    passed: passedCount === cases.length,
    aggregate: {
      cases: cases.length,
      passed: passedCount,
      failed: cases.length - passedCount,
      avgTokenReduction: sum((c) => c.tokenReduction) / cases.length,
      avgKeyTermRetention: sum((c) => c.keyTermRetention) / cases.length,
    },
  }
}
