import { describe, expect, it } from 'bun:test'
import { MacosSeatbeltProvider, buildSeatbeltProfile } from './sandbox'

const onDarwin = process.platform === 'darwin'

describe('macOS Seatbelt sandbox (Phase 127)', () => {
  it('builds a deny-default profile with explicit write subpaths', () => {
    const profile = buildSeatbeltProfile({
      scratchPaths: ['/tmp/forge-seatbelt-abc'],
      writablePaths: ['/Users/me/project'],
    })
    expect(profile).toContain('(version 1)')
    expect(profile).toContain('(deny default)')
    expect(profile).toContain('(allow process-exec)')
    expect(profile).toContain('(allow file-read*)')
    expect(profile).toContain('(subpath "/tmp/forge-seatbelt-abc")')
    expect(profile).toContain('(subpath "/Users/me/project")')
    expect(profile).not.toContain('(allow network*)')
  })

  it('toggles network and process-fork via options', () => {
    const withNetwork = buildSeatbeltProfile({
      scratchPaths: ['/tmp/x'],
      allowNetwork: true,
      allowProcessFork: false,
    })
    expect(withNetwork).toContain('(allow network*)')
    expect(withNetwork).not.toContain('(allow process-fork)')

    const minimal = buildSeatbeltProfile({ scratchPaths: ['/tmp/x'] })
    expect(minimal).not.toContain('(allow network*)')
    expect(minimal).toContain('(allow process-fork)')
  })

  it('escapes quote characters in paths', () => {
    const profile = buildSeatbeltProfile({ scratchPaths: ['/tmp/we"ird'] })
    expect(profile).toContain('\\"')
  })

  it('identifies the provider (available only on darwin)', () => {
    const provider = new MacosSeatbeltProvider()
    const info = provider.info()
    expect(info.id).toBe('macos-seatbelt')
    expect(info.platform).toBe('darwin')
    expect(info.capabilities).toContain('network-deny')
    if (onDarwin) {
      expect(info.available).toBe(true)
    } else {
      expect(info.available).toBe(false)
      expect(info.unsupportedReason).toContain('macOS')
    }
  })

  it('runs commands inside the Seatbelt sandbox (live on darwin)', async () => {
    if (!onDarwin) return
    const provider = new MacosSeatbeltProvider()
    if ((await provider.isAvailable()) === false) return
    const result = await provider.execute({
      command: '/bin/echo',
      args: ['seatbelt-hello'],
    })
    expect(result.timedOut).toBe(false)
    expect(result.error).toBeUndefined()
    expect(result.stdout).toContain('seatbelt-hello')
  })

  it('checkIsolation verifies write and network denials (live on darwin)', async () => {
    if (!onDarwin) return
    const provider = new MacosSeatbeltProvider()
    if ((await provider.isAvailable()) === false) return
    const report = await provider.checkIsolation()
    expect(report.checks.length).toBeGreaterThanOrEqual(4)
    expect(report.checks.every((check) => check.passed)).toBe(true)
  })
})
