import { describe, expect, it, mock } from 'bun:test'
import { toRequestMessages } from '../agent/context'
import { createEvent, type SessionEvent } from '../events'
import { assembleMessages, hydrateMessages } from '../session/hydration'
import { CompactCommand } from './compact-command'
import { AutoCompactor } from './compaction'
import { Microcompactor } from './microcompact'

const config = { maxTokens: 2000, compactionThreshold: 0.8, keepRecentMessages: 2 }
const modelInfo = { contextWindow: 2000, maxOutputTokens: 100 }
const history = (count = 8): SessionEvent[] =>
  Array.from({ length: count }, (_, i) =>
    createEvent('session.message', 's1', {
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `${i}: ${'history '.repeat(300)}`,
    }),
  )
const fakeModel = (summary = 'Decisions preserved.') => ({
  generate: mock(async () => ({ content: summary })),
})
const toolEvents = (count = 4): SessionEvent[] =>
  Array.from({ length: count }, (_, i) => [
    createEvent('session.message', 's1', { role: 'assistant', content: `run ${i}` }),
    createEvent('session.tool_call', 's1', {
      toolCallId: `call-${i}`, toolName: 'read', args: { path: '中文.ts' },
    }),
    createEvent('session.tool_result', 's1', {
      toolCallId: `call-${i}`, toolName: 'read', result: '😀 output '.repeat(300),
    }),
  ]).flat()

describe('microcompact effective context regressions', () => {
  it('returns shorter effective messages with intact IDs and immutable events', async () => {
    const events = toolEvents()
    const original = structuredClone(events)
    const result = await new Microcompactor({ maxToolResultsToKeep: 2 }).microcompact(events)
    expect(result.messages).toBeDefined()
    expect(JSON.stringify(toRequestMessages(result.messages)).length)
      .toBeLessThan(JSON.stringify(toRequestMessages(assembleMessages(events))).length)
    expect(result.messages.slice(-4)).toEqual(assembleMessages(events).slice(-4))
    expect(result.messages.flatMap((m) => m.role === 'user' ? m.parts : [])
      .filter((p) => p.type === 'tool_result').map((p) => p.toolCallId))
      .toEqual(['call-0', 'call-1', 'call-2', 'call-3'])
    expect(events).toEqual(original)
  })

  it('is idempotent on effective messages and never grows short results', async () => {
    const mc = new Microcompactor({ maxToolResultsToKeep: 0 })
    const first = await mc.microcompact(toolEvents())
    const second = await mc.microcompactMessages(first.messages)
    expect(second.messages).toEqual(first.messages)
    expect(second.tokensSaved).toBe(0)
    const short = [createEvent('session.tool_result', 's1', {
      toolCallId: 'short', toolName: 'read', result: null,
    })]
    const skipped = await mc.microcompact(short)
    expect(skipped.messages).toEqual(assembleMessages(short))
    expect(skipped.tokensSaved).toBe(0)
  })

  it('preserves pairs even with summarization disabled', async () => {
    const result = await new Microcompactor({ maxToolResultsToKeep: 1, summarizeToolResults: false })
      .microcompact(toolEvents())
    expect(result.messages.flatMap((m) => m.role === 'user' ? m.parts : [])
      .filter((p) => p.type === 'tool_result')).toHaveLength(4)
  })

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('rejects invalid keep count %s', (keep) => {
    expect(() => new Microcompactor({ maxToolResultsToKeep: keep })).toThrow()
    expect(() => new Microcompactor().updateOptions({ maxToolResultsToKeep: keep })).toThrow()
  })
})

describe('compaction model-context regressions', () => {
  it('hydrates summary plus recent context while preserving raw log/history', async () => {
    const events = history()
    const original = structuredClone(events)
    const compactor = new AutoCompactor({ model: fakeModel(), modelInfo, config })
    const result = await compactor.compact(events)
    expect(result.success).toBe(true)
    const compacted = [...events, result.compactionEvent]
    const hydrated = hydrateMessages(compacted, { format: 'openai' })
    expect(hydrated).toHaveLength(3)
    expect(hydrated[0].content).toContain('Decisions preserved.')
    expect(hydrated[1].content).toBe(events[6].payload.content)
    expect(JSON.stringify(hydrated).length).toBeLessThan(JSON.stringify(events).length / 2)
    expect(assembleMessages(compacted).length).toBeGreaterThanOrEqual(8)
    expect(compactor.shouldCompact(compacted)).toBe(false)
    expect(events).toEqual(original)
  })

  it('manual compact works below auto threshold and passes focus to the model', async () => {
    const model = fakeModel()
    const command = new CompactCommand({ model, modelInfo: { ...modelInfo, contextWindow: 200000 },
      config: { ...config, maxTokens: 200000 }, events: history() })
    expect(command.shouldCompact()).toBe(false)
    const before = command.getBudgetSummary()
    const result = await command.execute('retain auth details 中文 🔑')
    expect(result.success).toBe(true)
    expect(JSON.stringify(model.generate.mock.calls)).toContain('retain auth details 中文 🔑')
    expect(result.budgetSummary).not.toBe(before)
    expect(command.shouldCompact()).toBe(false)
    const again = await command.execute()
    expect(again.success).toBe(false)
    expect(model.generate).toHaveBeenCalledTimes(1)
  })

  it('manual compact without focus also works below threshold', async () => {
    const command = new CompactCommand({ model: fakeModel(), modelInfo,
      config: { ...config, maxTokens: 200000 }, events: history(4) })
    expect((await command.execute()).success).toBe(true)
  })

  it('keeps recent tool results with their call across the summary boundary', async () => {
    const events = [...history(), ...toolEvents(1)]
    const compactor = new AutoCompactor({ model: fakeModel(), modelInfo, config,
      keepRecentMessages: 1 })
    const result = await compactor.compact(events)
    const projected = hydrateMessages([...events, result.compactionEvent], { format: 'openai' })
    expect(result.success).toBe(true)
    expect(projected).toHaveLength(3)
    expect(projected[1].tool_calls?.[0].id).toBe('call-0')
    expect(projected[2].tool_call_id).toBe('call-0')
  })

  it('rejects empty or expanding summaries without replacing context', async () => {
    for (const summary of ['', 'x'.repeat(100000)]) {
      const compactor = new AutoCompactor({ model: fakeModel(summary), modelInfo, config })
      const result = await compactor.compact(history())
      expect(result.success).toBe(false)
      expect(result.tokensSaved).toBe(0)
    }
  })

  it('handles empty input and model failure without inventing effective summaries', async () => {
    const model = { generate: mock(async () => { throw new Error('offline') }) }
    const compactor = new AutoCompactor({ model, modelInfo, config })
    expect((await compactor.compact([])).success).toBe(false)
    expect((await compactor.compact(history())).error).toContain('offline')
  })

  it.each([-1, 0, 1.5, Number.NaN])('rejects invalid recent count %s', (keep) => {
    expect(() => new AutoCompactor({ model: fakeModel(), modelInfo, config,
      keepRecentMessages: keep })).toThrow()
  })
})
