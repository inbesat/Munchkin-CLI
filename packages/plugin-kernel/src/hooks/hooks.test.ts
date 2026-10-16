import { describe, expect, it } from 'bun:test'
import { BLOCK, HookEngine } from './engine'
import { type HookEventName, LIFECYCLE_EVENTS } from './events'

describe('lifecycle event definitions (Phase 103)', () => {
  it('defines the eleven blueprint-named events', () => {
    for (const name of [
      'SessionStart',
      'SessionEnd',
      'PreToolUse',
      'PostToolUse',
      'UserPromptSubmit',
      'Stop',
      'SubagentStart',
      'SubagentStop',
      'PreCompact',
      'PostCompact',
    ] as const) {
      expect(LIFECYCLE_EVENTS).toContain(name)
    }
  })

  it('enumerates 25+ lifecycle events for the roadmap titer (~20 more beyond the 11)', () => {
    expect(LIFECYCLE_EVENTS.length).toBeGreaterThanOrEqual(25)
    const unique = new Set(LIFECYCLE_EVENTS)
    expect(unique.size).toBe(LIFECYCLE_EVENTS.length)
  })

  it('event names are usable as types', () => {
    const name: HookEventName = 'PreToolUse'
    expect(typeof name).toBe('string')
  })
})

describe('HookEngine (Phase 103)', () => {
  it('fires registered handlers when their event is emitted', async () => {
    const engine = new HookEngine()
    const seen: string[] = []
    engine.on('SessionStart', (payload) => {
      seen.push(`start:${String((payload as { sessionId?: string }).sessionId)}`)
    })
    await engine.emit('SessionStart', { sessionId: 's1' })
    expect(seen).toEqual(['start:s1'])
  })

  it('routes payloads to the right event only', async () => {
    const engine = new HookEngine()
    const seen: string[] = []
    engine.on('PreToolUse', () => seen.push('pre'))
    engine.on('PostToolUse', () => seen.push('post'))
    await engine.emit('PreToolUse', { toolName: 'read' })
    expect(seen).toEqual(['pre'])
  })

  it('delivers to multiple handlers in priority order', async () => {
    const engine = new HookEngine()
    const order: string[] = []
    engine.on('Stop', () => order.push('default'), { priority: 0 })
    engine.on('Stop', () => order.push('first'), { priority: 100 })
    engine.on('Stop', () => order.push('last'), { priority: -100 })
    await engine.emit('Stop', {})
    expect(order).toEqual(['last', 'default', 'first'])
  })

  it('blocking hooks prevent the default action and stop later handlers', async () => {
    const engine = new HookEngine()
    const calls: string[] = []
    engine.on('PreToolUse', () => ({ block: true, reason: 'rm -rf is not allowed' }), {
      priority: -10,
    })
    engine.on('PreToolUse', () => calls.push('later-handler'), { priority: 0 })
    const result = await engine.emit('PreToolUse', { toolName: 'bash', args: { cmd: 'rm -rf /' } })
    expect(result.blocked).toBe(true)
    expect(result.reason).toBe('rm -rf is not allowed')
    expect(calls).toEqual([])
  })

  it('non-blocking observers cannot block', async () => {
    const engine = new HookEngine()
    engine.on('PreToolUse', () => ({ block: true, reason: 'ignored' }), {
      priority: 10,
      blocking: false,
    })
    const result = await engine.emit('PreToolUse', {})
    expect(result.blocked).toBe(false)
  })

  it('captures handler errors as failed results instead of throwing', async () => {
    const engine = new HookEngine()
    engine.on('UserPromptSubmit', () => {
      throw new Error('handler exploded')
    })
    const result = await engine.emit('UserPromptSubmit', { prompt: 'hi' })
    expect(result.blocked).toBe(false)
    expect(result.results[0]?.ok).toBe(false)
    expect(result.results[0]?.error).toContain('handler exploded')
  })

  it('unsubscribes handlers and supports engine reset', async () => {
    const engine = new HookEngine()
    const calls: number[] = []
    const off = engine.on('SessionEnd', () => calls.push(1))
    off()
    await engine.emit('SessionEnd', {})
    expect(calls).toEqual([])

    engine.on('SessionEnd', () => calls.push(2))
    engine.reset()
    await engine.emit('SessionEnd', {})
    expect(calls).toEqual([])
  })

  it('returns BLOCK sentinel results directly from handlers', async () => {
    const engine = new HookEngine()
    engine.on('SubagentStart', () => BLOCK('blocked by policy'))
    const result = await engine.emit('SubagentStart', { name: 'rag' })
    expect(result.blocked).toBe(true)
    expect(result.reason).toBe('blocked by policy')
  })
})
