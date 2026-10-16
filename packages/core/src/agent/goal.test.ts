import { describe, expect, it } from 'bun:test'
import type { AgentChunk, AgentModel } from './types'
import { clearGoal, type GoalResult, goalIsActive, runGoalLoop, setGoal } from './goal'

/** Scripted model: each stream() call plays the next turn's chunks. */
function scriptedModel(turns: AgentChunk[][]): {
  model: AgentModel
  requests: AgentGenerateOptions[]
} {
  const requests: AgentGenerateOptions[] = []
  let call = 0
  const model: AgentModel = {
    id: 'test/model',
    provider: 'test',
    config: { capabilities: { contextWindow: 100000, maxTokens: 4096 } },
    stream(options) {
      const chunks = turns[Math.min(call, turns.length - 1)] ?? []
      call += 1
      requests.push(options)
      return (async function* () {
        for (const chunk of chunks) yield chunk
      })()
    },
  }
  return { model, requests }
}

const text = (delta: string): AgentChunk => ({ type: 'text-delta', delta })
const finish = (): AgentChunk => ({ type: 'finish', reason: 'stop' as const })

describe('goal mode state helpers (Phase 101)', () => {
  it('setGoal activates, clearGoal deactivates', () => {
    setGoal('refactor auth to JWT')
    expect(goalIsActive()).toBe(true)
    clearGoal()
    expect(goalIsActive()).toBe(false)
  })
})

describe('runGoalLoop (Phase 101)', () => {
  it('keeps iterating until the completion sentinel appears', async () => {
    const { model, requests } = scriptedModel([
      [text('Working on it... step 1 done.'), finish()],
      [text('Step 2 done. [GOAL_MET] refactored to JWT'), finish()],
    ])
    const result: GoalResult = await runGoalLoop({
      model,
      task: 'refactor the auth module to use JWT',
      maxGoalRounds: 5,
    })
    expect(result.goalMet).toBe(true)
    expect(result.rounds).toBe(2)
    expect(result.summary).toContain('GOAL_MET')
    // Round 2 continuation should mention the goal and prior progress.
    const continuationSent = JSON.stringify(requests[1])
    expect(continuationSent).toContain('refactor the auth module to use JWT')
    expect(continuationSent).toContain('step 1 done')
  })

  it('stops after maxGoalRounds without the sentinel', async () => {
    const { model } = scriptedModel([
      [text('still working'), finish()],
    ])
    const result: GoalResult = await runGoalLoop({
      model,
      task: 'impossible goal',
      maxGoalRounds: 3,
    })
    expect(result.goalMet).toBe(false)
    expect(result.rounds).toBe(3)
  })

  it('runs multiple rounds autonomously (verification of continued work)', async () => {
    const { model } = scriptedModel([
      [text('round one'), finish()],
      [text('round two'), finish()],
      [text('round three'), finish()],
      [text('done [GOAL_MET]'), finish()],
    ])
    const result = await runGoalLoop({
      model,
      task: 'task with four rounds',
      maxGoalRounds: 6,
    })
    expect(result.goalMet).toBe(true)
    expect(result.rounds).toBe(4)
  })

  it('does not treat a mid-goal answer as complete when the detector rejects it', async () => {
    const { model } = scriptedModel([
      // Model claims success without the sentinel; default detector requires it.
      [text('I believe the goal is met.'), finish()],
      [text('Actually finished now [GOAL_MET]'), finish()],
    ])
    const result = await runGoalLoop({
      model,
      task: 'finish the refactor',
      maxGoalRounds: 5,
    })
    expect(result.goalMet).toBe(true)
    expect(result.rounds).toBe(2)
  })

  it('aborts immediately when the signal fires before a round', async () => {
    const controller = new AbortController()
    const { model, requests } = scriptedModel([
      [text('working'), finish()],
    ])
    controller.abort()
    const result: GoalResult = await runGoalLoop({
      model,
      task: 'task',
      maxGoalRounds: 5,
      abortSignal: controller.signal,
    })
    expect(result.goalMet).toBe(false)
    expect(result.rounds).toBe(0)
    expect(requests.length).toBe(0)
  })

  it('clearGoal aborts an in-flight goal loop', async () => {
    setGoal('long running refactor')
    let sawAbort = false
    const model: AgentModel = {
      id: 'test/model',
      provider: 'test',
      config: { capabilities: { contextWindow: 100000, maxTokens: 4096 } },
      stream(options) {
        return (async function* () {
          await new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, 5000)
            options.abortSignal?.addEventListener('abort', () => {
              sawAbort = true
              clearTimeout(timer)
              resolve()
            })
          })
          yield { type: 'finish' as const, reason: sawAbort ? ('abort' as const) : ('stop' as const) }
        })()
      },
    }

    const run = runGoalLoop({ model, task: 'long task', maxGoalRounds: 5 })
    await new Promise((r) => setTimeout(r, 20))
    clearGoal() // user issues /goal clear mid-run
    const result = await run
    expect(sawAbort).toBe(true)
    expect(result.goalMet).toBe(false)
    expect(result.stopReason).toBe('aborted')
  })
})
