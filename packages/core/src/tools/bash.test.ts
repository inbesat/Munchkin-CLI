import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { bashTool, createBashTool, BashSchema, createShellSession } from './bash'
import { BashManager } from './bash-manager'
import { ToolRegistry, createToolRegistryConfig } from './registry'

/** True when a POSIX bash binary is available (not on stock Windows hosts). */
const hasBash = (() => {
  try {
    return Bun.spawnSync(['bash', '-c', 'true']).exitCode === 0
  } catch {
    return false
  }
})()

describe('bashTool', () => {
  let tool: ReturnType<typeof createBashTool>
  let manager: BashManager

  beforeEach(() => {
    manager = new BashManager()
    tool = createBashTool(manager)
  })

  afterEach(() => {
    manager.clear()
  })

  it.skipIf(!hasBash)('executes a simple command and captures stdout', async () => {
    const result = await tool.execute({ command: 'echo hello world' })
    expect(result.success).toBe(true)
    expect(result.output).toContain('hello world')
    expect(result.metadata?.exitCode).toBe(0)
    expect(result.metadata?.sessionId).toBeDefined()
  })

  it.skipIf(!hasBash)('captures stderr', async () => {
    const result = await tool.execute({ command: 'echo error >&2' })
    expect(result.success).toBe(true)
    expect(result.output).toContain('error')
  })

  it.skipIf(!hasBash)('returns exit code for failed command', async () => {
    const result = await tool.execute({ command: 'exit 42' })
    expect(result.success).toBe(false)
    expect(result.metadata?.exitCode).toBe(42)
  })

  it.skipIf(!hasBash)('times out long-running command', async () => {
    const result = await tool.execute({ command: 'sleep 10', timeout: 100 })
    expect(result.success).toBe(false)
    expect(result.metadata?.timedOut).toBe(true)
    expect(result.metadata?.exitCode).toBeNull()
    expect(result.output).toContain('timed out')
  })

  it.skipIf(!hasBash)('creates persistent session and reuses it', async () => {
    const result1 = await tool.execute({ command: 'export TEST_VAR=hello' })
    const sessionId = result1.metadata?.sessionId
    expect(sessionId).toBeDefined()

    const result2 = await tool.execute({
      command: 'echo $TEST_VAR',
      sessionId,
    })
    expect(result2.success).toBe(true)
    expect(result2.output).toContain('hello')
  })

  it.skipIf(!hasBash)('isolates sessions - different sessions have different env', async () => {
    const session1 = createShellSession()
    const session2 = createShellSession()

    await tool.execute({ command: 'export MY_VAR=session1', sessionId: session1.id })
    await tool.execute({ command: 'export MY_VAR=session2', sessionId: session2.id })

    const result1 = await tool.execute({ command: 'echo $MY_VAR', sessionId: session1.id })
    const result2 = await tool.execute({ command: 'echo $MY_VAR', sessionId: session2.id })

    expect(result1.output).toContain('session1')
    expect(result2.output).toContain('session2')
  })

  it.skipIf(!hasBash)('supports custom working directory', async () => {
    const result = await tool.execute({ command: 'pwd', cwd: '/tmp' })
    expect(result.success).toBe(true)
    expect(result.output).toContain('/tmp')
  })

  it.skipIf(!hasBash)('supports additional environment variables', async () => {
    const result = await tool.execute({
      command: 'echo $CUSTOM_VAR',
      env: { CUSTOM_VAR: 'custom_value' },
    })
    expect(result.success).toBe(true)
    expect(result.output).toContain('custom_value')
  })

  it('throws on non-existent session', async () => {
    await expect(tool.execute({
      command: 'echo hello',
      sessionId: 'nonexistent-session-id',
    })).rejects.toThrow('Shell session not found')
  })

  it.skipIf(!hasBash)('creates new session when newShell=true', async () => {
    const session1 = createShellSession()
    await tool.execute({ command: 'export FOO=bar', sessionId: session1.id })

    const result = await tool.execute({
      command: 'echo $FOO',
      sessionId: session1.id,
      newShell: true,
    })
    // New shell won't have the env var
    expect(result.output).not.toContain('bar')
  })

  it.skipIf(!hasBash)('background execution returns immediately', async () => {
    const result = await tool.execute({
      command: 'sleep 1',
      background: true,
    })
    expect(result.success).toBe(true)
    expect(result.metadata?.background).toBe(true)
    expect(result.output).toContain('Background command started')
  })

  it('schema is valid TypeBox schema', () => {
    expect(BashSchema.type).toBe('object')
    expect(BashSchema.properties.command).toBeDefined()
    expect(BashSchema.properties.sessionId).toBeDefined()
    expect(BashSchema.properties.timeout).toBeDefined()
    expect(BashSchema.properties.background).toBeDefined()
  })
})

describe('bashTool with registry', () => {
  let registry: ToolRegistry
  let manager: BashManager
  let tool: ReturnType<typeof createBashTool>

  beforeEach(() => {
    manager = new BashManager()
    tool = createBashTool(manager)
    registry = new ToolRegistry(createToolRegistryConfig('allow'))
    registry.register(tool)
  })

  afterEach(() => {
    manager.clear()
  })

  it.skipIf(!hasBash)('executes through registry', async () => {
    const result = await registry.execute('bash', { command: 'echo registry test' })
    expect(result.success).toBe(true)
    expect(result.output).toContain('registry test')
  })

  it('getDefinitions includes bash tool', () => {
    const defs = registry.getDefinitions()
    const bashDef = defs.find((d) => d.name === 'bash')
    expect(bashDef).toBeDefined()
    expect(bashDef?.parameters).toBe(BashSchema)
  })
})

describe('BashManager', () => {
  let manager: BashManager

  beforeEach(() => {
    manager = new BashManager()
  })

  afterEach(() => {
    manager.clear()
  })

  it('creates and retrieves sessions', () => {
    const session = manager.getOrCreateSession({ id: 'test-session' })
    expect(session.id).toBe('test-session')
    expect(manager.getSession('test-session')).toBe(session)
  })

  it('deletes sessions', () => {
    const session = manager.getOrCreateSession({ id: 'delete-me' })
    expect(manager.deleteSession('delete-me')).toBe(true)
    expect(manager.getSession('delete-me')).toBeUndefined()
  })

  it('lists all sessions', () => {
    manager.getOrCreateSession({ id: 's1' })
    manager.getOrCreateSession({ id: 's2' })
    const sessions = manager.listSessions()
    expect(sessions.length).toBe(2)
  })

  it.skipIf(!hasBash)('executeBackground returns PID and abort function', () => {
    const session = manager.getOrCreateSession()
    const { pid, abort } = manager.executeBackground(session.id, 'sleep 10')
    expect(typeof pid).toBe('number')
    expect(typeof abort).toBe('function')
    abort() // Clean up
  })

  it('clears all sessions', () => {
    manager.getOrCreateSession({ id: 's1' })
    manager.getOrCreateSession({ id: 's2' })
    manager.clear()
    expect(manager.size).toBe(0)
  })
})