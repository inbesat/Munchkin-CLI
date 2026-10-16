import { describe, expect, it } from 'bun:test'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  DockerSandboxProvider,
  SANDBOX_DOCKERFILE,
  SANDBOX_IMAGE,
  buildDockerRunArgs,
  detectRuntime,
} from './provider'

const dockerfileDir = join(import.meta.dir, '..', '..', 'docker')

describe('Docker/Podman environment provider (Phase 129)', () => {
  it('bundles a sandbox image Dockerfile with Node, Python, and Git', () => {
    expect(existsSync(join(dockerfileDir, 'Dockerfile'))).toBe(true)
    expect(SANDBOX_DOCKERFILE).toContain('node:22')
    expect(SANDBOX_DOCKERFILE).toContain('python3')
    expect(SANDBOX_DOCKERFILE).toContain('git')
    expect(SANDBOX_DOCKERFILE).toContain('useradd') // unprivileged user
    expect(SANDBOX_DOCKERFILE).toContain('USER sandbox')
  })

  it('assembles a locked-down docker run argv with volume mounts', () => {
    const args = buildDockerRunArgs({
      image: SANDBOX_IMAGE,
      scratch: 'C:\\tmp\\scratch',
      projectDir: 'C:\\repo',
      command: '/bin/sh',
      args: ['-c', 'echo hi'],
    })
    expect(args[0]).toBe('run')
    expect(args).toContain('--rm')
    expect(args).toContain('--network')
    expect(args[args.indexOf('--network') + 1]).toBe('none')
    expect(args).toContain('--read-only')
    expect(args).toContain('--cap-drop')
    expect(args).toContain('--security-opt')
    expect(args.filter((arg) => arg === '-v')).toHaveLength(2)
    expect(args.some((arg) => arg.includes('/work'))).toBe(true)
    expect(args.some((arg) => arg.includes('/workspace'))).toBe(true)
    expect(args).toContain('--workdir')
    expect(args[args.length - 5]).toBe(SANDBOX_IMAGE)
    expect(args[args.length - 4]).toBe('--')
    expect(args.slice(-3)).toEqual(['/bin/sh', '-c', 'echo hi'])
  })

  it('allows the network only when opted in', () => {
    const withNet = buildDockerRunArgs({
      image: SANDBOX_IMAGE,
      scratch: '/tmp/s',
      command: 'true',
      args: [],
      allowNetwork: true,
    })
    expect(withNet).not.toContain('--network')
  })

  it('detects the container runtime or reports none (result object)', () => {
    const detected = detectRuntime()
    // On machines with docker/podman this succeeds; otherwise it reports cleanly.
    if (detected.ok) {
      expect(['docker', 'podman']).toContain(detected.runtime)
    } else {
      expect(detected.error).toContain('neither docker nor podman')
    }
  })

  it('provider stays inert when no runtime exists (no-throw)', async () => {
    const provider = new DockerSandboxProvider()
    const info = provider.info()
    expect(info.id).toBe('docker-container')
    expect(typeof info.available).toBe('boolean')
    if (!info.available) {
      expect(info.unsupportedReason).toBeDefined()
      const result = await provider.execute({ command: 'echo', args: ['x'] })
      expect(result.ok === undefined).toBe(true) // result object, no throw
      expect(result.exitCode).toBeNull()
    }
  })
})
