/**
 * Agent teams / swarm mode (Phase 99): multiple agents coordinate through a
 * shared task board and the Phase-98 message bus. A coordinator delegates,
 * workers complete, and results are integrated both on the board and into a
 * Phase-97 BackgroundTaskManager so either API can retrieve them.
 */
import { SessionMessageBus } from './messaging'
import type { BackgroundTaskManager } from './background'

export interface TeamTask {
  id: string
  description: string
  assignee?: string
  status: 'pending' | 'assigned' | 'completed' | 'unassigned-error'
  result?: string
}

export interface AgentTeamOptions {
  bus: SessionMessageBus
  coordinator: string
  workers: readonly string[]
  /** Phase-97 registry the team integrates completed results into. */
  tasks: BackgroundTaskManager
}

export class AgentTeam {
  private board = new Map<string, TeamTask>()
  private counter = 0
  private readonly bus: SessionMessageBus
  private readonly coordinator: string
  private readonly workers: readonly string[]
  private readonly background: BackgroundTaskManager

  constructor(options: AgentTeamOptions) {
    this.bus = options.bus
    this.coordinator = options.coordinator
    this.workers = options.workers
    this.background = options.tasks
  }

  /** Create a task; when an assignee is given, delegate immediately. */
  delegate(description: string, assignee?: string): TeamTask {
    this.counter += 1
    const task: TeamTask = { id: `team-task-${this.counter}`, description, status: 'pending' }
    if (assignee !== undefined) {
      if (!this.workers.includes(assignee)) {
        const errored: TeamTask = {
          ...task,
          status: 'unassigned-error',
          result: `unknown worker: ${assignee}`,
        }
        this.board.set(task.id, errored)
        return errored
      }
      task.assignee = assignee
      task.status = 'assigned'
      // Direct note to the worker; visible on each member's own inbox.
      this.bus.send(this.coordinator, assignee, `TASK ${task.id}: ${task.description}`)
    }
    this.board.set(task.id, task)
    // Announce the delegation to the whole team (coordinator's own inbox is
    // excluded by the bus, so this reaches workers only).
    this.bus.send(this.coordinator, '*', `DELEGATED ${task.id}: ${task.description}`)
    return task
  }

  /** Complete a task; only the assignee may complete it. Notifies the coordinator. */
  complete(taskId: string, completingWorker: string, result: string): boolean {
    const task = this.board.get(taskId)
    if (!task || task.assignee !== completingWorker || task.status !== 'assigned') {
      return false
    }
    task.status = 'completed'
    task.result = result
    // Results integration: registered in the Phase-97 manager under the team
    // task id, so either API (team board or /tasks) can retrieve it.
    this.background.recordCompleted(taskId, `${taskId}: ${task.description}`, result)
    this.bus.send(completingWorker, this.coordinator, `DONE ${task.id}: ${result}`)
    this.bus.send(completingWorker, '*', `COMPLETED ${task.id} by ${completingWorker}`)
    return true
  }

  /** All tasks with their statuses. */
  tasks(): readonly TeamTask[] {
    return [...this.board.values()]
  }
}
