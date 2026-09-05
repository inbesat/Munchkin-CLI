import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { todoWriteTool, todoReadTool, createTodoWriteTool, createTodoReadTool, TodoWriteSchema, TodoReadSchema } from './todo'
import { TaskStore, defaultTaskStore, normalizeTodoItem, isTaskStatus, TASK_STATUSES } from './todo-manager'
import { ToolRegistry, createToolRegistryConfig } from './registry'

describe('todo-manager', () => {
  let store: TaskStore

  beforeEach(() => {
    store = new TaskStore('test-default')
  })

  afterEach(() => {
    store.clearAll()
  })

  it('getTasks returns empty array when nothing stored', () => {
    expect(store.getTasks()).toEqual([])
  })

  it('replace stores a snapshot', () => {
    store.replace(undefined, [{ content: 'write tests', status: 'in_progress' }])
    expect(store.getTasks()).toHaveLength(1)
    expect(store.getTasks()[0].content).toBe('write tests')
  })

  it('replace overwrites the previous snapshot', () => {
    store.replace(undefined, [{ content: 'a', status: 'pending' }])
    store.replace(undefined, [{ content: 'b', status: 'pending' }, { content: 'c', status: 'completed' }])
    const tasks = store.getTasks()
    expect(tasks).toHaveLength(2)
    expect(tasks.map((t) => t.content)).toEqual(['b', 'c'])
  })

  it('defaults missing status to pending', () => {
    const item = normalizeTodoItem({ content: 'hello' })
    expect(item.status).toBe('pending')
  })

  it('normalizeTodoItem trims content and rejects invalid input', () => {
    expect(normalizeTodoItem({ content: '  hi  ' }).content).toBe('hi')
    expect(() => normalizeTodoItem({ content: '' })).toThrow()
    expect(() => normalizeTodoItem({ content: 'x', status: 'bogus' })).toThrow()
    expect(() => normalizeTodoItem(null)).toThrow()
  })

  it('isTaskStatus validates statuses', () => {
    for (const s of TASK_STATUSES) expect(isTaskStatus(s)).toBe(true)
    expect(isTaskStatus('bogus')).toBe(false)
    expect(isTaskStatus(123)).toBe(false)
  })

  it('sessions are isolated', () => {
    store.replace('one', [{ content: 'task-1', status: 'pending' }])
    store.replace('two', [{ content: 'task-2', status: 'completed' }])
    expect(store.getTasks('one')[0].content).toBe('task-1')
    expect(store.getTasks('two')[0].content).toBe('task-2')
  })

  it('clear removes a session but not others', () => {
    store.replace('one', [{ content: 'a', status: 'pending' }])
    store.replace('two', [{ content: 'b', status: 'pending' }])
    store.clear('one')
    expect(store.getTasks('one')).toEqual([])
    expect(store.getTasks('two')).toHaveLength(1)
  })

  it('tracks sessions and updatedAt', () => {
    store.replace('one', [{ content: 'a', status: 'pending' }])
    const list = store.getOrCreate('one')
    expect(store.listSessions()).toEqual(['one'])
    expect(typeof list.updatedAt).toBe('number')
    expect(store.size).toBe(1)
  })
})

describe('todoWriteTool', () => {
  let store: TaskStore
  let tool: ReturnType<typeof createTodoWriteTool>

  beforeEach(() => {
    store = new TaskStore()
    tool = createTodoWriteTool(store)
  })

  afterEach(() => {
    store.clearAll()
  })

  it('creates tasks', async () => {
    const result = await tool.execute({
      todos: [
        { content: 'implement tool', status: 'in_progress' },
        { content: 'write tests' },
      ],
    })
    expect(result.success).toBe(true)
    expect(result.metadata?.count).toBe(2)
    expect(result.metadata?.inProgress).toBe(1)
    expect(result.metadata?.pending).toBe(1)
  })

  it('updates status across turns (snapshot replace)', async () => {
    await tool.execute({ todos: [{ content: 'do thing', status: 'in_progress' }] })
    const result = await tool.execute({
      todos: [{ content: 'do thing', status: 'completed' }],
    })
    expect(result.metadata?.completed).toBe(1)
    expect(result.output).toContain('completed')
  })

  it('clears tasks with an empty list', async () => {
    await tool.execute({ todos: [{ content: 'a', status: 'pending' }] })
    const result = await tool.execute({ todos: [] })
    expect(result.success).toBe(true)
    expect(result.metadata?.count).toBe(0)
    expect(result.output).toBe('(no todos)')
  })

  it('rejects invalid input', async () => {
    await expect(tool.execute({ todos: 'nope' })).rejects.toThrow('todos must be an array')
    await expect(tool.execute({ todos: [{ content: '', status: 'pending' }] })).rejects.toThrow()
    await expect(tool.execute({ todos: [{ content: 'ok', status: 'bogus' }] })).rejects.toThrow()
  })

  it('respects abort signal', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(tool.execute({ todos: [] }, controller.signal)).rejects.toThrow('cancelled')
  })

  it('uses the default store for default instance', async () => {
    const write = todoWriteTool
    const read = todoReadTool
    await write.execute({ todos: [{ content: 'shared', status: 'completed' }] })
    const result = await read.execute({})
    expect(result.metadata?.todos?.[0].content).toBe('shared')
    defaultTaskStore.clearAll()
  })
})

describe('todoReadTool', () => {
  let store: TaskStore
  let write: ReturnType<typeof createTodoWriteTool>
  let read: ReturnType<typeof createTodoReadTool>

  beforeEach(() => {
    store = new TaskStore()
    write = createTodoWriteTool(store)
    read = createTodoReadTool(store)
  })

  afterEach(() => {
    store.clearAll()
  })

  it('returns (no todos) when empty', async () => {
    const result = await read.execute({})
    expect(result.success).toBe(true)
    expect(result.output).toBe('(no todos)')
    expect(result.metadata?.count).toBe(0)
  })

  it('returns tasks with status', async () => {
    await write.execute({
      todos: [
        { content: 'one', status: 'pending' },
        { content: 'two', status: 'completed' },
      ],
    })
    const result = await read.execute({})
    expect(result.metadata?.count).toBe(2)
    expect(result.metadata?.pending).toBe(1)
    expect(result.metadata?.completed).toBe(1)
    expect(result.output).toContain('one')
    expect(result.output).toContain('two')
  })

  it('is isolated per session', async () => {
    await write.execute({ todos: [{ content: 'session-a', status: 'pending' }], sessionId: 'a' })
    await write.execute({ todos: [{ content: 'session-b', status: 'pending' }], sessionId: 'b' })
    const resultA = await read.execute({ sessionId: 'a' })
    expect(resultA.metadata?.todos?.[0].content).toBe('session-a')
  })
})

describe('todo tools with registry', () => {
  let registry: ToolRegistry
  let store: TaskStore

  beforeEach(() => {
    store = new TaskStore()
    registry = new ToolRegistry(createToolRegistryConfig('allow'))
    registry.register(createTodoWriteTool(store))
    registry.register(createTodoReadTool(store))
  })

  afterEach(() => {
    store.clearAll()
  })

  it('executes TodoWrite through registry', async () => {
    const result = await registry.execute('todoWrite', { todos: [{ content: 'via registry' }] })
    expect(result.success).toBe(true)
    expect(result.metadata?.count).toBe(1)
  })

  it('tasks persist between turns through the registry', async () => {
    await registry.execute('todoWrite', {
      todos: [{ content: 'persist me', status: 'in_progress' }],
    })
    const result = await registry.execute('todoRead', {})
    expect(result.metadata?.todos?.[0].content).toBe('persist me')
    expect(result.metadata?.todos?.[0].status).toBe('in_progress')
  })

  it('getDefinitions includes both tools', () => {
    const defs = registry.getDefinitions()
    const names = defs.map((d) => d.name)
    expect(names).toContain('todoWrite')
    expect(names).toContain('todoRead')
    expect(defs.find((d) => d.name === 'todoWrite')?.parameters).toBe(TodoWriteSchema)
    expect(defs.find((d) => d.name === 'todoRead')?.parameters).toBe(TodoReadSchema)
  })
})