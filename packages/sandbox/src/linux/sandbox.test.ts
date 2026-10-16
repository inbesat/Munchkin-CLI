import { describe, expect, it } from 'bun:test'
import { existsSync } from 'node:fs'
import { LandlockProvider, buildBwrapArgs } from './sandbox'

const onLinux = process.platform === 'linux'

describe('Linux Landlock sandbox via bubblewrap (Phase 128)', () => {
  it('assembles a read-only-root bwrap argv with scratch + cwd bind mounts', () => {
    const args = buildBwrapArgs({
      scratch: '/tmp/forge-landlock-x',
      writablePaths: ['/home/me/project'],
    })
    expect(args).toEqual([
      '--ro-bind',
      '/',
      '/',
      '--bind',
      '/tmp/forge-landlock-x',
      '/tmp/forge-landlock-x',
      '--bind',
      '/home/me/project',
      '/home/me/project',
      '--dev',
      '/dev',
      '--proc',
      '/proc',
      '--tmpfs',
      '/tmp',
      '--unshare-net',
      '--die-with-parent',
      '--new-session',
    ])
  })

  it('shares the network namespace only when opted in', () => {
    const withNet = buildBwrapArgs({ scratch: '/tmp/x', allowNetwork: true })
    expect(withNet).not.toContain('--unshare-net')
    expect(withNet).toContain('--die-with-parent')
  })

  it('identifies the provider (available only on linux with bubblewrap)', () => {
    const provider = new LandlockProvider()
    const info = provider.info()
    expect(info.id).toBe('linux-landlock')
    expect(info.platform).toBe('linux')
    expect(info.capabilities).toContain('read-only-root')
    if (onLinux) {
      expect(info.available).toBe(existsSync('/usr/bin/bwrap'))
    } else {
      expect(info.available).toBe(false)
      expect(info.unsupportedReason).toContain('Linux')
    }
  })

  it('runs commands inside the landlock sandbox (live on linux)', async () => {
    if (!onLinux) return
    const provider = new LandlockProvider()
    if ((await provider.isAvailable()) === false) return
    const result = await provider.execute({
      command: '/bin/sh',
      args: ['-c', 'echo landlock-hello'],
    })
    expect(result.timedOut).toBe(false)
    expect(result.error).toBeUndefined()
    expect(result.stdout).toContain('landlock-hello')
  })

  it('checkIsolation verifies read-only root and network denial (live on linux)', async () => {
    if (!onLinux) return
    const provider = new LandlockProvider()
    if ((await provider.isAvailable()) === false) return
    const report = await provider.checkIsolation()
    expect(report.checks.length).toBeGreaterThanOrEqual(3)
    expect(report.isolated).toBe(true)
  })
})
