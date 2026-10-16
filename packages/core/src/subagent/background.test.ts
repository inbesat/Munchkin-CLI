import { describe, expect, it } from 'bun:test'
import { BackgroundTaskManager } from './background'

describe('BackgroundTaskManager (Phase 97)', () => {
  it('starts a task, reports running then completed with its result', async () => {
    const manager = new BackgroundTaskManager()
    const id = manager.start('search TODO comments', async () => 'found 7 todos')
    expect(manager.get(id)?.status).toBe('running')

    await manager.waitFor(id)
    const task = manager.get(id)
    expect(task?.status).toBe('completed')
    expect(manager.result(id)).toBe('found 7 todos')
  })

  it('continues the main agent while a task runs (non-blocking)', async () => {
    const manager = new BackgroundTaskManager()
    let released = false
    const id = manager.start('slow task', async () => {
      await new Promise((r) => setTimeout(r, 50))
      return 'slow result'
    })
    // The main agent keeps working immediately — start() returns before the task finishes.
    expect(manager.get(id)?.status).toBe('running')
    released = true
    expect(released).toBe(true)
    await manager.waitFor(id)
    expect(manager.result(id)).toBe('slow result')
  })

  it('captures failures as failed status with an error message', async () => {
    const manager = new BackgroundTaskManager()
    const id = manager.start('boom task', async () => {
      throw new Error('tool exploded')
    })
    await manager.waitFor(id)
    const task = manager.get(id)
    expect(task?.status).toBe('failed')
    expect(task?.error).toContain('tool exploded')
  })

  it('cancel aborts a running task and marks it cancelled', async () => {
    const manager = new BackgroundTaskManager()
    const id = manager.start('cancellable', async (signal) => {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, 5000)
        signal?.addEventListener('abort', () => {
          clearTimeout(timer)
          reject(new Error('aborted'))
        })
      })
      return 'never'
    })
    expect(manager.cancel(id)).toBe(true)
    await manager.waitFor(id)
    expect(manager.get(id)?.status).toBe('cancelled')
  })

  it('lists all tasks with unique ids', async () => {
    const manager = new BackgroundTaskManager()
    const a = manager.start('task a', async () => 'a')
    const b = manager.start('task b', async () => 'b')
    expect(a).not.toBe(b)
    expect(manager.list().map((t) => t.description)).toContain('task a')
    expect(manager.list().map((t) => t.description)).toContain('task b')
    await manager.waitFor(a)
    await manager.waitFor(b)
    expect(manager.list().every((t) => t.status === 'completed')).toBe(true)
  })

  it('reports an unknown id as absent', () => {
    const manager = new BackgroundTaskManager()
    expect(manager.get('nope')).toBeUndefined()
  })
})
