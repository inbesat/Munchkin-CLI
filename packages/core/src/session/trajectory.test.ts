import { describe, expect, it } from 'bun:test'
import { createEvent } from '../events'
import { buildTrajectory } from './trajectory'

const SID = 's1'

function sampleEvents() {
  return [
    createEvent('session.created', SID, { model: 'model-x', cwd: '/tmp/proj', title: 'Fix bug' }),
    createEvent('session.message', SID, { role: 'user', content: 'fix the bug' }),
    createEvent('session.message', SID, {
      role: 'assistant',
      content: "I'll read the file\nsecond line",
      tokens: { input: 100, output: 50 },
    }),
    createEvent('session.tool_call', SID, {
      toolCallId: 'c1',
      toolName: 'read',
      args: { path: 'a.ts' },
    }),
    createEvent('session.tool_result', SID, {
      toolCallId: 'c1',
      toolName: 'read',
      result: { content: 'x' },
      durationMs: 12,
    }),
    createEvent('session.tool_call', SID, {
      toolCallId: 'c2',
      toolName: 'bash',
      args: { command: 'bun test' },
    }),
    createEvent('session.tool_result', SID, {
      toolCallId: 'c2',
      toolName: 'bash',
      result: null,
      error: 'exit 1',
      durationMs: 300,
    }),
    createEvent('session.message', SID, { role: 'user', content: 'thanks' }),
    createEvent('session.error', SID, {
      code: 'RATE_LIMIT',
      message: 'slow down',
      severity: 'warn',
    }),
    createEvent('session.compaction', SID, { beforeCount: 12, afterCount: 4, tokensSaved: 500 }),
    createEvent('session.ended', SID, { reason: 'user' }),
  ]
}

describe('buildTrajectory (Phase 144)', () => {
  it('maps every event kind to an ordered, turn-numbered step', () => {
    const steps = buildTrajectory(sampleEvents())
    expect(steps).toHaveLength(11)
    expect(steps.map((s) => s.index)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
    expect(steps.map((s) => s.kind)).toEqual([
      'created',
      'user',
      'assistant',
      'tool_call',
      'tool_result',
      'tool_call',
      'tool_result',
      'user',
      'error',
      'compaction',
      'ended',
    ])
    expect(steps.map((s) => s.turn)).toEqual([1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2])
  })

  it('summarizes created, messages, tool calls, and tool results', () => {
    const steps = buildTrajectory(sampleEvents())
    expect(steps[0]?.title).toBe('Session created')
    expect(steps[0]?.detail).toContain('model-x')
    expect(steps[0]?.detail).toContain('Fix bug')
    expect(steps[1]?.title).toBe('fix the bug')
    expect(steps[2]?.title).toBe("I'll read the file")
    expect(steps[2]?.detail).toBe("I'll read the file\nsecond line")
    expect(steps[2]?.meta).toBe('100 in / 50 out')
    expect(steps[3]?.title).toBe('Tool call: read')
    expect(steps[3]?.detail).toContain('"path": "a.ts"')
    expect(steps[4]?.title).toBe('Tool result: read')
    expect(steps[4]?.meta).toBe('12ms')
    expect(steps[6]?.meta).toBe('300ms · error')
    expect(steps[6]?.detail).toBe('exit 1')
  })

  it('summarizes errors, compaction, and session end', () => {
    const steps = buildTrajectory(sampleEvents())
    expect(steps[8]?.title).toBe('Error [RATE_LIMIT]')
    expect(steps[8]?.detail).toBe('slow down')
    expect(steps[8]?.meta).toBe('warn')
    expect(steps[9]?.title).toBe('Compaction')
    expect(steps[9]?.detail).toBe('12 → 4 messages')
    expect(steps[9]?.meta).toBe('500 tokens saved')
    expect(steps[10]?.title).toBe('Session ended')
    expect(steps[10]?.detail).toBe('user')
  })

  it('returns no steps for an empty log', () => {
    expect(buildTrajectory([])).toEqual([])
  })

  it('truncates long first lines in titles but keeps the full detail', () => {
    const long = 'x'.repeat(150)
    const steps = buildTrajectory([
      createEvent('session.message', SID, { role: 'user', content: long }),
    ])
    expect(steps[0]?.title).toBe(`${'x'.repeat(99)}…`)
    expect(steps[0]?.detail).toBe(long)
  })
})
