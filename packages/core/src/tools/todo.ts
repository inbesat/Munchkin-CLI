import { Tool, ToolResult } from './types'
import { Type } from '@sinclair/typebox'
import { TaskStore, TodoItem, TaskList, defaultTaskStore } from './todo-manager'
import { ToolError, ErrorCode } from '../errors'

/** Max tasks a TodoWrite call can set, to keep tool responses bounded. */
const MAX_TODOS = 100

/** TodoWrite input schema. */
export const TodoWriteSchema = Type.Object({
  todos: Type.Array(
    Type.Object({
      content: Type.String({ description: 'Task description' }),
      status: Type.Optional(
        Type.Union([
          Type.Literal('pending'),
          Type.Literal('in_progress'),
          Type.Literal('completed'),
          Type.Literal('cancelled'),
        ]),
      ),
      activeForm: Type.Optional(Type.String({ description: 'Present-tense label while active' })),
      completedForm: Type.Optional(Type.String({ description: 'Past-tense label once complete' })),
    }),
  ),
  sessionId: Type.Optional(Type.String({ description: 'Session to write tasks for (default: current)' })),
})

/** TodoRead input schema. */
export const TodoReadSchema = Type.Object({
  sessionId: Type.Optional(Type.String({ description: 'Session to read tasks for (default: current)' })),
})

/** TodoWrite output metadata. */
export interface TodoWriteResult extends ToolResult {
  metadata?: {
    count: number
    pending: number
    inProgress: number
    completed: number
    cancelled: number
    sessionId: string
  }
}

/** TodoRead output metadata. */
export interface TodoReadResult extends ToolResult {
  metadata?: {
    todos: readonly TodoItem[]
    count: number
    pending: number
    completed: number
    sessionId: string
  }
}

/** Create the TodoWrite tool backed by a store. */
export function createTodoWriteTool(store: TaskStore = defaultTaskStore): Tool {
  return {
    name: 'todoWrite',
    description:
      'Replace the current task list. The agent sends the FULL desired state each call (create, update status, or clear). ' +
      'Tasks persist across turns and are shown in the status bar.',
    parameters: TodoWriteSchema,
    scope: 'builtin',
    risk: 'low',
    requiresPermission: false,
    async execute(input: Record<string, unknown>, signal?: AbortSignal): Promise<TodoWriteResult> {
      if (signal?.aborted) {
        throw new ToolError(ErrorCode.CANCELLED, 'TodoWrite cancelled', 'todoWrite')
      }

      const { todos, sessionId } = input as { todos?: unknown[]; sessionId?: string }
      if (!Array.isArray(todos)) {
        throw new ToolError(ErrorCode.TOOL_INVALID_INPUT, 'todos must be an array', 'todoWrite')
      }
      if (todos.length > MAX_TODOS) {
        throw new ToolError(
          ErrorCode.TOOL_INVALID_INPUT,
          `Too many todos: ${todos.length} (max ${MAX_TODOS})`,
          'todoWrite',
        )
      }

      let list: TaskList
      try {
        list = store.replace(sessionId, todos as TodoItem[])
      } catch (err) {
        throw new ToolError(
          ErrorCode.TOOL_INVALID_INPUT,
          err instanceof Error ? err.message : 'Invalid todo item',
          'todoWrite',
        )
      }

      const counts = countByStatus(list.todos)
      return {
        success: true,
        output:
          list.todos.length === 0
            ? '(no todos)'
            : list.todos.map((t, i) => `[${i + 1}] ${t.status}: ${t.content}`).join('\n'),
        metadata: {
          count: list.todos.length,
          pending: counts.pending,
          inProgress: counts.inProgress,
          completed: counts.completed,
          cancelled: counts.cancelled,
          sessionId: list.id,
        },
      }
    },
  }
}

/** Create the TodoRead tool backed by a store. */
export function createTodoReadTool(store: TaskStore = defaultTaskStore): Tool {
  return {
    name: 'todoRead',
    description: 'Read the current task list with completion status. Returned tasks persist across turns.',
    parameters: TodoReadSchema,
    scope: 'builtin',
    risk: 'low',
    requiresPermission: false,
    async execute(input: Record<string, unknown>, signal?: AbortSignal): Promise<TodoReadResult> {
      if (signal?.aborted) {
        throw new ToolError(ErrorCode.CANCELLED, 'TodoRead cancelled', 'todoRead')
      }

      const { sessionId } = input as { sessionId?: string }
      const todos = store.getTasks(sessionId)
      const counts = countByStatus(todos)

      return {
        success: true,
        output:
          todos.length === 0
            ? '(no todos)'
            : todos.map((t, i) => `[${i + 1}] ${t.status}: ${t.content}`).join('\n'),
        metadata: {
          todos,
          count: todos.length,
          pending: counts.pending,
          completed: counts.completed,
          sessionId: sessionId ?? store.getOrCreate().id,
        },
      }
    },
  }
}

/** Count tasks per status. */
function countByStatus(todos: readonly TodoItem[]): TaskCounts {
  const counts: TaskCounts = { pending: 0, inProgress: 0, completed: 0, cancelled: 0 }
  for (const todo of todos) {
    switch (todo.status) {
      case 'pending':
        counts.pending += 1
        break
      case 'in_progress':
        counts.inProgress += 1
        break
      case 'completed':
        counts.completed += 1
        break
      case 'cancelled':
        counts.cancelled += 1
        break
    }
  }
  return counts
}

interface TaskCounts {
  pending: number
  inProgress: number
  completed: number
  cancelled: number
}

/** Default tool instances sharing the default store. */
export const todoWriteTool = createTodoWriteTool()
export const todoReadTool = createTodoReadTool()