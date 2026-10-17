import { describe, expect, it } from 'bun:test'
import {
  TARGETS,
  buildCommandArgs,
  formatSize,
  hostTargetName,
  parseBuildArgs,
} from './build-binary'

describe('TARGETS (Phase 149)', () => {
  it('covers the five release platforms', () => {
    expect(Object.keys(TARGETS)).toEqual([
      'linux-x64',
      'linux-arm64',
      'darwin-x64',
      'darwin-arm64',
      'win-x64',
    ])
    expect(TARGETS['win-x64'].file).toBe('forge-win-x64.exe')
    expect(TARGETS['darwin-arm64'].bunTarget).toBe('bun-darwin-arm64')
  })
})

describe('hostTargetName (Phase 149)', () => {
  it('maps platform and arch to a target name', () => {
    expect(hostTargetName('win32', 'x64')).toBe('win-x64')
    expect(hostTargetName('linux', 'x64')).toBe('linux-x64')
    expect(hostTargetName('linux', 'arm64')).toBe('linux-arm64')
    expect(hostTargetName('darwin', 'arm64')).toBe('darwin-arm64')
    expect(hostTargetName('freebsd', 'x64')).toBeNull()
  })
})

describe('parseBuildArgs (Phase 149)', () => {
  it('defaults to the host target', () => {
    expect(parseBuildArgs([], 'win-x64')).toEqual({
      targets: ['win-x64'],
      json: false,
      smoke: false,
    })
  })

  it('supports --all', () => {
    const parsed = parseBuildArgs(['--all'], 'win-x64')
    if ('error' in parsed) throw new Error(parsed.error)
    expect(parsed.targets).toEqual(Object.keys(TARGETS))
  })

  it('supports repeated --target plus --out, --json, and --smoke', () => {
    expect(
      parseBuildArgs(
        ['--target', 'linux-x64', '--target', 'win-x64', '--out', 'dist', '--json', '--smoke'],
        'win-x64',
      ),
    ).toEqual({
      targets: ['linux-x64', 'win-x64'],
      outDir: 'dist',
      json: true,
      smoke: true,
    })
  })

  it('rejects unknown targets and missing values', () => {
    expect(parseBuildArgs(['--target', 'solaris'], 'win-x64')).toEqual({
      error: expect.stringContaining('unknown target'),
    })
    expect(parseBuildArgs(['--target'], 'win-x64')).toEqual({
      error: expect.stringContaining('--target'),
    })
    expect(parseBuildArgs([], null)).toEqual({ error: expect.stringContaining('host') })
  })
})

describe('formatSize (Phase 149)', () => {
  it('renders megabytes with one decimal', () => {
    expect(formatSize(0)).toBe('0.0 MB')
    expect(formatSize(120.5 * 1024 * 1024)).toBe('120.5 MB')
  })
})

describe('buildCommandArgs (Phase 149)', () => {
  it('constructs the bun compile command', () => {
    expect(buildCommandArgs('bun-linux-x64', 'entry.ts', 'out')).toEqual([
      'build',
      '--compile',
      '--target=bun-linux-x64',
      'entry.ts',
      '--outfile',
      'out',
    ])
  })
})
