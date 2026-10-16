import { describe, expect, it } from 'bun:test'
import { MockSandboxProvider, type SandboxProvider, defineSandboxProvider } from './types'

describe('SandboxProvider abstraction (Phase 125)', () => {
  it('mock implementation satisfies the SandboxProvider interface', () => {
    const provider: SandboxProvider = defineSandboxProvider(new MockSandboxProvider())
    expect(provider.id).toBe('mock')
    const info = provider.info()
    expect(info.id).toBe('mock')
    expect(info.platform).toBe('mock')
    expect(info.available).toBe(true)
    expect(info.capabilities).toContain('execute')
    expect(info.unsupportedReason).toBeUndefined()
  })

  it('executes scripted commands and records every request', async () => {
    const provider = new MockSandboxProvider({
      queue: [
        { exitCode: 0, stdout: 'hello from sandbox', stderr: '', timedOut: false, durationMs: 12 },
        { exitCode: 1, stdout: '', stderr: 'permission denied', timedOut: false, durationMs: 5 },
      ],
    })
    const first = await provider.execute({
      command: 'bun',
      args: ['test'],
      cwd: '/workspace',
      env: { CI: '1' },
      timeoutMs: 10_000,
    })
    expect(first.exitCode).toBe(0)
    expect(first.stdout).toBe('hello from sandbox')
    expect(first.timedOut).toBe(false)

    const second = await provider.execute({ command: 'git', args: ['push'], cwd: '/workspace' })
    expect(second.exitCode).toBe(1)
    expect(second.stderr).toBe('permission denied')

    // Queue exhausted: deterministic default result.
    const fallback = await provider.execute({ command: 'true', args: [] })
    expect(fallback.exitCode).toBe(0)
    expect(fallback.stdout).toBe('mock executed: true')

    expect(provider.executedRequests).toHaveLength(3)
    expect(provider.executedRequests[0]?.cwd).toBe('/workspace')
  })

  it('reports availability and isolation through the info contract', async () => {
    const unavailable = new MockSandboxProvider({
      info: { available: false, unsupportedReason: 'Windows ACL tooling missing' },
      isolationReport: {
        isolated: false,
        checks: [
          { name: 'write-to-system32', passed: false, details: 'write succeeded outside sandbox' },
          { name: 'network-blocked', passed: true },
        ],
      },
    })
    expect(await unavailable.isAvailable()).toBe(false)
    const info = unavailable.info()
    expect(info.unsupportedReason).toBe('Windows ACL tooling missing')

    const report = await unavailable.checkIsolation()
    expect(report.isolated).toBe(false)
    expect(report.checks.some((check) => !check.passed)).toBe(true)

    const availableMock = new MockSandboxProvider()
    const okReport = await availableMock.checkIsolation()
    expect(okReport.isolated).toBe(true)
    expect(okReport.checks.every((check) => check.passed)).toBe(true)
  })
})
