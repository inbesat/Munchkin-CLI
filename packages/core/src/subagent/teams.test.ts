import { describe, expect, it } from 'bun:test'
import { BackgroundTaskManager } from './background'
import { SessionMessageBus } from './messaging'
import { AgentTeam } from './teams'

function team3() {
  const bus = new SessionMessageBus()
  const manager = new BackgroundTaskManager()
  const team = new AgentTeam({
    bus,
    coordinator: 'coordinator',
    workers: ['worker-1', 'worker-2'],
    tasks: manager,
  })
  return { bus, team, manager }
}

describe('AgentTeam (Phase 99)', () => {
  it('delegates tasks to workers over the shared bus', () => {
    const { bus, team } = team3()
    const task = team.delegate('Write tests for auth.', 'worker-1')
    expect(task.status).toBe('assigned')
    expect(task.assignee).toBe('worker-1')
    // Worker-1 received a direct note on the bus.
    const inbox = bus.inbox('worker-1').receive()
    expect(inbox.some((m) => m.from === 'coordinator' && m.content.includes(task.id))).toBe(true)
  })

  it('worker completes only its own task; coordinator is notified and result integrated', () => {
    const { bus, team, manager } = team3()
    const task = team.delegate('Compute standings.', 'worker-2')
    const done = team.complete(task.id, 'worker-2', 'standings: 3 teams')
    expect(done).toBe(true)
    expect(team.tasks().find((t) => t.id === task.id)).toMatchObject({
      status: 'completed',
      result: 'standings: 3 teams',
    })
    // Results integrated into the Phase-97 background task registry.
    expect(manager.get(task.id)?.status).toBe('completed')
    expect(manager.result(task.id)).toBe('standings: 3 teams')
    // Coordinator received the DONE note on the bus.
    const notes = bus.inbox('coordinator').receive()
    expect(notes.some((m) => m.content.includes(task.id))).toBe(true)
  })

  it('rejects completion from a non-assignee and records it', () => {
    const { team } = team3()
    const task = team.delegate('secret work', 'worker-1')
    expect(team.complete(task.id, 'worker-2', 'sneaky')).toBe(false)
    expect(team.tasks().find((t) => t.id === task.id)?.status).toBe('assigned')
  })

  it('supports a team of 3 with two delegated tasks and full integration', async () => {
    const { bus, team, manager } = team3()
    const t1 = team.delegate('docs pass', 'worker-1')
    const t2 = team.delegate('lint pass', 'worker-2')
    team.complete(t1.id, 'worker-1', 'docs updated')
    team.complete(t2.id, 'worker-2', 'lint clean')

    const statuses = team.tasks().map((t) => t.status)
    expect(statuses).toEqual(['completed', 'completed'])
    expect(await Promise.all([manager.waitFor(t1.id), manager.waitFor(t2.id)])).toBeDefined()
    expect(manager.result(t1.id)).toBe('docs updated')
    expect(manager.result(t2.id)).toBe('lint clean')
    // The whole team saw the announcements as broadcasts.
    const worker1Notes = bus.inbox('worker-1').receive()
    expect(worker1Notes.some((m) => m.content.includes('lint pass'))).toBe(true)
  })

  it('delegating to an unknown worker records an error instead of throwing', () => {
    const { team } = team3()
    const task = team.delegate('orphan work', 'worker-99')
    expect(task.status).toBe('unassigned-error')
    expect(team.tasks().filter((t) => t.status === 'unassigned-error')).toHaveLength(1)
  })
})
