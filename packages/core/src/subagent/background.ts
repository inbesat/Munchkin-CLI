/**
 * Background task management (Phase 97): run detached work (e.g. subagents)
 * without blocking the main agent; status, results, and cancellation are
 * queryable while the main agent keeps working. Failures never throw to the
 * caller — they surface as task state.
 */

export type BackgroundTaskStatus = 'running' | 'completed' | 'failed' | 'cancelled'

export interface BackgroundTask<T = unknown> {
  readonly id: string
  readonly description: string
  status: BackgroundTaskStatus
  readonly startedAt: number
  finishedAt?: number
  result?: T
  error?: string
}

export interface BackgroundTaskRunner {
  /** Execute the task; `signal` aborts on cancellation. */
  (signal: AbortSignal): Promise<unknown>
}

interface InternalTask<T = unknown> extends BackgroundTask<T> {
  controller?: AbortController
  settled?: Promise<void>
}

/** Registry of detached tasks. One instance per session/app is typical. */
export class BackgroundTaskManager {
  private tasks = new Map<string, InternalTask>()
  private counter = 0

  /** Start a detached task; returns its id immediately (non-blocking). */
  start(description: string, runner: BackgroundTaskRunner, onDone?: (id: string) => void): string {
    this.counter += 1
    const id = `task-${this.counter}`
    const controller = new AbortController()
    const task: InternalTask = {
      id,
      description,
      status: 'running',
      startedAt: Date.now(),
      controller,
      settled: Promise.resolve(),
    }
    this.tasks.set(id, task)

    task.settled = runner(controller.signal).then(
      (result) => {
        if (task.status === 'running') {
          task.status = 'completed'
          task.result = result
        }
        task.finishedAt = Date.now()
        onDone?.(id)
      },
      (error: unknown) => {
        if (task.status === 'running') {
          task.status = controller.signal.aborted ? 'cancelled' : 'failed'
          task.error = error instanceof Error ? error.message : String(error)
        }
        task.finishedAt = Date.now()
        onDone?.(id)
      },
    )
    return id
  }

  /** Look up a task by id, or undefined. */
  get(id: string): BackgroundTask | undefined {
    return this.tasks.get(id)
  }

  /** Snapshot list, oldest first. */
  list(): readonly BackgroundTask[] {
    return [...this.tasks.values()]
  }

  /** Resolve when the task reaches a terminal state (immediately if already terminal). */
  async waitFor(id: string): Promise<void> {
    const task = this.tasks.get(id)
    if (task) await task.settled
  }

  /** Retrieve a completed task's result (undefined while running/failed). */
  result(id: string): unknown {
    return this.tasks.get(id)?.result
  }

  /** Register an already-resolved result under a caller-chosen id (results integration). */
  recordCompleted(id: string, description: string, result: string): void {
    this.tasks.set(id, {
      id,
      description,
      status: 'completed',
      startedAt: Date.now(),
      finishedAt: Date.now(),
      result,
    })
  }

  /** Cancel a running task via its AbortSignal. Returns false if it already ended. */
  cancel(id: string): boolean {
    const task = this.tasks.get(id)
    if (!task) return false
    if (task.status !== 'running') return false
    task.status = 'cancelled'
    if (task.controller !== undefined) task.controller.abort()
    return true
  }
}
