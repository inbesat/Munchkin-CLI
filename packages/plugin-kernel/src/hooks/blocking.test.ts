import { describe, expect, it } from 'bun:test'
import { createPolicyGate, feedbackFrom, registerToolPolicy } from './blocking'
import { BLOCK, HookEngine } from './engine'

describe('blocking hooks (Phase 105)', () => {
  it('maps a blocked emit result into LLM feedback text', async () => {
    const engine = new HookEngine()
    engine.on('PreToolUse', () => BLOCK('rm -rf is not allowed'), {
      name: 'rm-guard',
      priority: -10,
    })
    const result = await engine.emit('PreToolUse', { toolName: 'bash' })
    const feedback = feedbackFrom(result, 'PreToolUse')
    expect(feedback).not.toBeNull()
    expect(feedback).toContain('rm -rf is not allowed')
    expect(feedback).toContain('rm-guard')
    expect(feedback).toContain('adjust')
  })

  it('returns null feedback when nothing blocked (allowed)', async () => {
    const engine = new HookEngine()
    engine.on('PreToolUse', () => undefined)
    const result = await engine.emit('PreToolUse', { toolName: 'read' })
    expect(feedbackFrom(result, 'PreToolUse')).toBeNull()
  })

  it('policy gate: register → trigger blocked action → allowed=false + feedback', async () => {
    const engine = new HookEngine()
    const gate = createPolicyGate(engine, 'PreToolUse')
    engine.on('PreToolUse', () => BLOCK('never edit .env files'), { priority: -10 })

    const blocked = await gate.evaluate({ toolName: 'write', args: { path: 'src/.env' } })
    expect(blocked.allowed).toBe(false)
    expect(blocked.feedback).toContain('never edit .env files')
  })

  it('non-matching, non-blocked evaluations are allowed with no feedback', async () => {
    const engine = new HookEngine()
    const gate = createPolicyGate(engine, 'PreToolUse')
    engine.on('PreToolUse', () => undefined)
    const decision = await gate.evaluate({ toolName: 'read', args: { path: 'src/a.txt' } })
    expect(decision).toEqual({ allowed: true, feedback: null })
  })

  it('registerToolPolicy: Write targeting .env is blocked with feedback (blueprint example)', async () => {
    const engine = new HookEngine()
    const unregister = registerToolPolicy(engine, {
      matchToolName: 'write',
      command: 'deny-secret-paths',
      runner: (_cmd, _cwd, stdin) => {
        const event = JSON.parse(stdin) as { args?: { path?: string } }
        if (event.args?.path?.includes('.env'))
          return { status: 2, stdout: '', stderr: 'never edit .env files' }
        return { status: 0, stdout: '', stderr: '' }
      },
    })

    const blocked = await engine.emit('PreToolUse', {
      toolName: 'write',
      args: { path: 'config/.env' },
    })
    const feedback = feedbackFrom(blocked, 'PreToolUse')
    expect(blocked.blocked).toBe(true)
    expect(feedback).toContain('never edit .env files')

    // Non-target tool is unaffected while the policy remains registered.
    const readRun = await engine.emit('PreToolUse', {
      toolName: 'read',
      args: { path: 'config/.env' },
    })
    expect(feedbackFrom(readRun, 'PreToolUse')).toBeNull()

    // Unregistration removes the policy.
    unregister()
    const after = await engine.emit('PreToolUse', {
      toolName: 'write',
      args: { path: 'config/.env' },
    })
    expect(feedbackFrom(after, 'PreToolUse')).toBeNull()
  })
})
