/** Status a task can be in. */
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled'

/** A single task entry. */
export interface TodoItem {
  readonly content: string
  readonly status: TaskStatus
  /** Present-tense label shown while the task is active (e.g. "Editing file"). */
  readonly activeForm?: string
  /** Past-tense label shown once complete (e.g. "Edited file"). */
  readonly completedForm?: string
}

/** Persistent task list for one session. */
export interface TaskList {
  readonly id: string
  readonly todos: TodoItem[]
  readonly updatedAt: number
}

/** All valid task statuses, in canonical order. */
export const TASK_STATUSES: readonly TaskStatus[] = ['pending', 'in_progress', 'completed', 'cancelled']

/** Guard: is the given value a valid TaskStatus? */
export function isTaskStatus(value: unknown): value is TaskStatus {
  return typeof value === 'string' && (TASK_STATUSES as readonly string[]).includes(value)
}

/** Validate a TodoItem shape; throws TypeError on invalid input. */
export function normalizeTodoItem(value: unknown): TodoItem {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError('Todo must be an object')
  }
  const item = value as Record<string, unknown>
  if (typeof item.content !== 'string' || item.content.trim() === '') {
    throw new TypeError('Todo content must be a non-empty string')
  }
  const status = item.status ?? 'pending'
  if (!isTaskStatus(status)) {
    throw new TypeError(`Invalid todo status: ${String(status)}`)
  }
  const todo: MutableTodoItem = { content: item.content.trim(), status }
  if (typeof item.activeForm === 'string') todo.activeForm = item.activeForm
  if (typeof item.completedForm === 'string') todo.completedForm = item.completedForm
  return todo
}

/** Mutable variant used while building a TodoItem. */
type MutableTodoItem = {
  content: string
  status: TaskStatus
  activeForm?: string
  completedForm?: string
}

/**
 * In-memory, session-scoped task store.
 *
 * TodoWrite treats the list as a snapshot: the agent sends the full desired set
 * of tasks and the store replaces the previous one. This gives idempotent
 * "update across turns" semantics without delta operations.
 */
export class TaskStore {
  private readonly lists = new Map<string, TaskList>()

  constructor(private readonly defaultSessionId = 'default') {}

  /** Get the task list for a session, creating it lazily. */
  getOrCreate(sessionId?: string): TaskList {
    const id = sessionId ?? this.defaultSessionId
    const existing = this.lists.get(id)
    if (existing) return existing
    const list: TaskList = { id, todos: [], updatedAt: Date.now() }
    this.lists.set(id, list)
    return list
  }

  /** Read the current tasks for a session (empty array if none stored). */
  getTasks(sessionId?: string): TodoItem[] {
    return this.lists.get(sessionId ?? this.defaultSessionId)?.todos ?? []
  }

  /** Replace the task list for a session with a full snapshot and stamp the update time. */
  replace(sessionId: string | undefined, todos: TodoItem[]): TaskList {
    const id = sessionId ?? this.defaultSessionId
    const normalized = todos.map(normalizeTodoItem)
    const list: TaskList = { id, todos: normalized, updatedAt: Date.now() }
    this.lists.set(id, list)
    return list
  }

  /** Remove all tasks for a session. */
  clear(sessionId?: string): void {
    this.lists.delete(sessionId ?? this.defaultSessionId)
  }

  /** Remove every session's tasks. */
  clearAll(): void {
    this.lists.clear()
  }

  /** Number of sessions currently tracked. */
  get size(): number {
    return this.lists.size
  }

  /** All tracked session ids, sorted. */
  listSessions(): string[] {
    return [...this.lists.keys()].sort()
  }
}

/** Shared default store for the default tool instances. */
export const defaultTaskStore = new TaskStore()