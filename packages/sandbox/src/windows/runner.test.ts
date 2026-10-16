import { describe, expect, it } from 'bun:test'
import { WindowsSandboxProvider, sensitiveDirectories } from './runner'

const provider = new WindowsSandboxProvider({ timeoutMs: 30_000 })
const onWindows = process.platform === 'win32'

describe('Windows ACL restricted-token runner (Phase 126)', () => {
  it('identifies the provider and the sensitive directory deny list', () => {
    const info = provider.info()
    expect(info.id).toBe('windows-restricted-token')
    expect(info.platform).toBe('win32')
    expect(info.capabilities).toContain('restricted-token')

    const dirs = sensitiveDirectories()
    if (onWindows) {
      expect(dirs.some((dir) => dir.toLowerCase().includes('windows'))).toBe(true)
      // current user's home must NOT be in the deny list
      expect(dirs.some((dir) => dir.toLowerCase() === process.env.USERPROFILE?.toLowerCase())).toBe(
        false,
      )
    }
  })

  it('isAvailable probes the restricted-token pipeline once', async () => {
    if (!onWindows) return
    const first = await provider.isAvailable()
    expect(typeof first).toBe('boolean')
    // Second call serves from cache within the same instance.
    expect(await provider.isAvailable()).toBe(first)
  })

  it('executes a command inside the restricted token', async () => {
    if (!onWindows) return
    if ((await provider.isAvailable()) === false) {
      console.log(
        'restricted-token pipeline unavailable in this session (service context or runas denied)',
      )
      return
    }
    const result = await provider.execute({
      command: 'cmd',
      args: ['/c', 'echo', 'sandboxed-hello'],
      timeoutMs: 30_000,
    })
    expect(result.timedOut).toBe(false)
    expect(result.error).toBeUndefined()
    expect(result.stdout).toContain('sandboxed-hello')
    expect(result.exitCode).toBe(0)
  })

  it('runs commands in the requested working directory', async () => {
    if (!onWindows) return
    if ((await provider.isAvailable()) === false) return
    const result = await provider.execute({
      command: 'cmd',
      args: ['/c', 'cd'],
      cwd: process.env.SystemRoot,
      timeoutMs: 30_000,
    })
    expect(result.exitCode).toBe(0)
    expect(result.stdout.toLowerCase()).toContain(
      process.env.SystemRoot?.toLowerCase() ?? 'windows',
    )
  })

  it('checkIsolation reports denied writes to sensitive directories', async () => {
    if (!onWindows) return
    if ((await provider.isAvailable()) === false) return
    const report = await provider.checkIsolation()
    expect(report.checks.length).toBeGreaterThanOrEqual(3)
    const sensitiveChecks = report.checks.filter((check) => check.name.startsWith('denied:'))
    for (const check of sensitiveChecks) {
      expect(check.passed).toBe(true)
    }
  }, 180_000)
})
