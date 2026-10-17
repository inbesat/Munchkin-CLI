import { describe, expect, it } from 'bun:test'
import { BackgroundTaskManager } from './background'
import { withDeadline } from './deadline'
import { SessionMessageBus } from './messaging'
import { type SpawnSubagentOptions, spawnSubagent } from './spawn'
import { AgentTeam } from './teams'
import type { AgentChunk, AgentModel, AgentTool } from './types'

const text = (delta: string): AgentChunk => ({ type: 'text-delta', delta })
const finish = (): AgentChunk => ({ type: 'finish', reason: 'stop' as const })

function scriptedModel(turns: AgentChunk[][]): AgentModel {
  let call = 0
  return {
    id: 'test/model',
    provider: 'test',
    config: { capabilities: { contextWindow: 100000, maxTokens: 4096 } },
    stream() {
      const chunks = turns[Math.min(call, turns.length - 1)] ?? []
      call += 1
      return (async function* () {
        for (const chunk of chunks) yield chunk
      })()
    },
  }
}

const happyModel = (): AgentModel => scriptedModel([[text('subagent done.'), finish()]])

describe('orchestration stress tests (Phase 102)', () => {
  it('fans out 12 parallel subagents and all complete under a deadlock watchdog', async () => {
    const fanout = Array.from({ length: 12 }, (_, i) =>
      spawnSubagent({ model: happyModel(), task: `task ${i}` }),
    )
    const results = await withDeadline(Promise.all(fanout), 5000, '12-agent fan-out')
    expect(results).toHaveLength(12)
    for (const run of results) {
      expect(run.stopReason).toBe('complete')
      expect(run.summary).toBe('subagent done.')
    }
  })

  it('isolates failures: one throwing subagent does not fail its siblings', async () => {
    const throwingModel: AgentModel = {
      id: 'test/boom',
      provider: 'test',
      config: { capabilities: { contextWindow: 100000, maxTokens: 4096 } },
      stream() {
        throw new Error('model crashed')
      },
    }
    const fanout = Array.from({ length: 12 }, (_, i) =>
      spawnSubagent({ model: i === 0 ? throwingModel : happyModel(), task: `task ${i}` }),
    )
    const results = await withDeadline(Promise.all(fanout), 5000, 'failure isolation fan-out')
    expect(results[0]?.stopReason).toBe('error')
    expect(String(results[0]?.error)).toContain('model crashed')
    expect(results.filter((r) => r.stopReason === 'complete')).toHaveLength(11)
  })

  it('enforces per-subagent timeouts on stragglers', async () => {
    const slowModel: AgentModel = {
      id: 'test/slow',
      provider: 'test',
      config: { capabilities: { contextWindow: 100000, maxTokens: 4096 } },
      stream() {
        return (async function* () {
          await new Promise((resolve) => setTimeout(resolve, 5000))
          yield text('too late')
          yield finish()
        })()
      },
    }
    const fanout = [
      spawnSubagent({ model: happyModel(), task: 'fast task' }),
      spawnSubagent({ model: slowModel, task: 'slow task', timeoutMs: 60 }),
      spawnSubagent({ model: slowModel, task: 'slow task 2', timeoutMs: 60 }),
    ]
    const results = await withDeadline(Promise.all(fanout), 3000, 'timeout fan-out')
    expect(results[0]?.stopReason).toBe('complete')
    expect(results[1]?.stopReason).toBe('error')
    expect(String(results[1]?.error)).toContain('timed out')
    expect(results[2]?.stopReason).toBe('error')
  })

  it('deadlock detection: uncancellable tool still terminates via the spawn timeout', async () => {
    const stuckTool: AgentTool = {
      name: 'stuck',
      description: 'a tool that never resolves',
      execute: async () => new Promise<string>(() => {}),
    }
    const onlyToolCall = (): AgentModel =>
      scriptedModel([
        [{ type: 'tool-call', toolCall: { id: 't', name: 'stuck', args: {} } }, finish()],
      ])
    // Watchdog: the spawn itself must settle despite the stuck tool. The
    // spawn-timeout aborts the tool race (spawn.ts), the loop feeds the
    // error back, and maxIterations caps any retry loop.
    const run = await withDeadline(
      spawnSubagent({
        model: onlyToolCall(),
        task: 'deadlock bait',
        tools: [stuckTool],
        maxIterations: 2,
        timeoutMs: 300,
      }),
      3000,
      'deadlocked subagent',
    )
    expect(run.stopReason).not.toBe('complete')
    expect(String(run.error)).toMatch(/timed out/i)
  })

  it('soak: 12-task team board + bus + background registry under load loses nothing', async () => {
    const fanout = Array.from({ length: 12 }, (_, i) =>
      spawnSubagent({ model: happyModel(), task: `soak ${i}` }),
    )
    const results = await withDeadline(Promise.all(fanout), 5000, 'soak fan-out')

    const bus = new SessionMessageBus()
    const manager = new BackgroundTaskManager()
    const team = new AgentTeam({
      bus,
      coordinator: 'coordinator',
      workers: ['w1', 'w2', 'w3'],
      tasks: manager,
    })

    const delegated = Array.from({ length: 12 }, (_, i) => {
      const worker = `w${(i % 3) + 1}`
      return team.delegate(`soak task ${i}`, worker)
    })

    for (const task of delegated) {
      team.complete(task.id, task.assignee ?? 'w1', `result for ${task.id}`)
    }

    const board = team.tasks()
    expect(board.every((t) => t.status === 'completed')).toBe(true)
    for (const task of delegated) {
      expect(manager.result(task.id)).toBe(`result for ${task.id}`)
    }

    const workerInboxes = bus
      .allMessages()
      .filter((m) => (m.to.startsWith('w') || m.to === 'coordinator') && m.to !== '*')
    expect(workerInboxes.length).toBeGreaterThanOrEqual(delegated.length * 2)
    void results
  })

  it('spawnSubagent options surface deterministically after soak (phase guard)', async () => {
    const options: SpawnSubagentOptions = { model: happyModel(), task: 'guard' }
    const run = await withDeadline(spawnSubagent(options), 2000, 'phase guard spawn')
    expect(run.stopReason).toBe('complete')
  })
})
